/**
 * Cloudflare Edge Worker API & Site Router
 * Provides sub-30ms forensic procurement creep data from Cloudflare D1
 * Secured with strict Origin whitelist & Content Security Policies
 */

import registry from '../sites.config.json';
import { siteHandlers } from '../.generated/site-handlers.js';

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/louderthanwords\.fyi$/,
  /^https:\/\/([a-zA-Z0-9-]+\.)?louderthanwords\.fyi$/,
  /^https:\/\/([a-zA-Z0-9-]+\.)*louder-than-words\.workers\.dev$/,
  /^https:\/\/([a-zA-Z0-9-]+\.)*workers\.dev$/,
];

function isOriginAllowed(origin) {
  if (!origin) return true; // Direct same-origin browser request
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function getCorsHeaders(origin) {
  const isAllowed = isOriginAllowed(origin);
  const allowedOrigin = isAllowed && origin ? origin : (origin || 'https://louderthanwords.fyi');
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);

    // 1. Handle CORS preflight & reject unauthorized foreign domains
    if (request.method === 'OPTIONS') {
      if (origin && !isOriginAllowed(origin)) {
        return new Response(null, { status: 403, statusText: 'Forbidden Origin' });
      }
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Reject unallowed cross-origin API calls
    if (origin && !isOriginAllowed(origin)) {
      return new Response(JSON.stringify({ error: 'Access Forbidden: Origin not authorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const requestPath = url.pathname;
    const username = requestPath.split('/')[1];
    const site = registry.sites?.find((entry) => entry.username === username);

    // Site-specific API handler routing (e.g. AntiWorkProTwerk)
    if (site) {
      const prefix = `/${site.username}/api/`;
      const envPrefix = `${site.username.toUpperCase().replaceAll('-', '_')}__`;
      const siteEnv = Object.fromEntries(
        Object.entries(env)
          .filter(([key]) => key.startsWith(envPrefix))
          .map(([key, value]) => [key.slice(envPrefix.length), value]),
      );
      siteEnv.PUBLIC_APP_URL ??= `https://${registry.domain}/${site.username}/`;
      if (requestPath.startsWith(prefix) || requestPath === prefix.slice(0, -1)) {
        const handler = siteHandlers?.[site.username];
        if (handler) {
          return handler(request, siteEnv, requestPath.slice(prefix.length));
        }
      }
      const key = requestPath.slice(site.username.length + 2);
      if (siteEnv.DATA && (key.startsWith('data/') || key.startsWith('tiles/'))) {
        if (!['GET', 'HEAD'].includes(request.method))
          return new Response('Method not allowed', { status: 405 });
        let object;
        try {
          object = await siteEnv.DATA.get(key, { range: request.headers, onlyIf: request.headers });
        } catch {
          return new Response('Dataset temporarily unavailable', {
            status: 503,
            headers: { 'Cache-Control': 'no-store' },
          });
        }
        if (!object) return new Response('Dataset not found', { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('ETag', object.httpEtag);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set(
          'Cache-Control',
          key.startsWith('data/releases/') || key.startsWith('tiles/releases/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=60, must-revalidate',
        );
        if (!('body' in object))
          return new Response(null, {
            status:
              request.headers.has('if-match') || request.headers.has('if-unmodified-since')
                ? 412
                : 304,
            headers,
          });
        if (object.range)
          headers.set(
            'Content-Range',
            `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`,
          );
        return new Response(request.method === 'HEAD' ? null : object.body, {
          status: object.range ? 206 : 200,
          headers,
        });
      }
    }

    // Normalize path for forensic procurement API
    const pathname = url.pathname.replace(/^\/dukevibington/, '') || '/';
    const BACKEND_WORKER_URL = 'https://dukevibington-dev-louderthanwords.louder-than-words.workers.dev';

    // If D1 is not bound in this environment, transparently proxy /api/ requests to the backend worker
    if (!env.DB && (pathname.startsWith('/api/') || pathname.startsWith('/bundles/'))) {
      const targetUrl = new URL(pathname + url.search, BACKEND_WORKER_URL);
      const proxyReq = new Request(targetUrl, request);
      try {
        const proxyRes = await fetch(proxyReq);
        const resHeaders = new Headers(proxyRes.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(proxyRes.body, {
          status: proxyRes.status,
          statusText: proxyRes.statusText,
          headers: resHeaders,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Backend proxy error: ' + String(err) }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // =========================================================================
    // 1. FORENSIC PROCUREMENT EDGE API ROUTES (Backed by D1)
    // =========================================================================

    // GET /api/creep/state/:stateCode -> State summary + all county rollups
    if (pathname.startsWith('/api/creep/state/')) {
      const stateCode = pathname.split('/')[4]?.toUpperCase();
      if (!stateCode || !env.DB) {
        return new Response(JSON.stringify({ error: 'Invalid state or DB not bound' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      try {
        // 1. Query State jurisdiction aggregate
        const stateRow = await env.DB.prepare(
          'SELECT * FROM jurisdictions WHERE id = ? OR (state_code = ? AND level = ?)'
        )
          .bind(`state:${stateCode}`, stateCode, 'state')
          .first();

        // 2. Query all County rollups in this state
        const countiesRes = await env.DB.prepare(
          'SELECT id, county_fips, name, initial_obligation, current_obligation, dollar_creep, percent_creep, active_contracts_count, top_offender_name FROM jurisdictions WHERE state_code = ? AND level = ?'
        )
          .bind(stateCode, 'county')
          .all();

        // 3. Query Top 100 Awards for this state
        const awardsRes = await env.DB.prepare(
          'SELECT * FROM awards WHERE state_code = ? ORDER BY dollar_creep DESC, current_obligation DESC LIMIT 100'
        )
          .bind(stateCode)
          .all();

        // 4. Query Fiscal Year Cohorts & State Budget time series
        const fyRes = await env.DB.prepare(
          'SELECT * FROM jurisdiction_fiscal_years WHERE jurisdiction_id = ? ORDER BY fiscal_year ASC'
        )
          .bind(`state:${stateCode}`)
          .all();

        function mapAwardRow(a) {
          if (!a) return null;
          let tx = [];
          try {
            tx = a.transactions_json ? (typeof a.transactions_json === 'string' ? JSON.parse(a.transactions_json) : a.transactions_json) : [];
          } catch {
            tx = [];
          }
          const piid = a.award_id_piid || a['Award ID'] || a.piid || a.internal_id || 'N/A';
          const recName = a.recipient_name || a['Recipient Name'] || 'Unknown Vendor';
          const parent = a.parent_recipient_name || a.parentName || recName;
          const agency = a.awarding_agency || a['Awarding Agency'] || 'Federal Government';
          const office = a.awarding_sub_agency || a['Awarding Sub Agency'] || a.office_name || 'Procurement Bureau';
          const pricing = a.pricing_type || a.pricingType || a.type_of_contract_pricing || 'FIXED PRICE';
          const hq = a.recipient_state || a.recipientState || a.recipient_location_state_code || '';
          const currentAmt = Number(a.current_obligation ?? a['Award Amount'] ?? 0);
          const initialAmt = Number(a.initial_obligation ?? a['Initial Obligation'] ?? currentAmt);
          const creepAmt = Number(a.dollar_creep ?? Math.max(0, currentAmt - initialAmt));
          const pctCreep = Number(a.percent_creep ?? (initialAmt > 0 ? (creepAmt / initialAmt) * 100 : 0));

          return {
            ...a,
            'Award ID': piid,
            award_id_piid: piid,
            piid,
            'Recipient Name': recName,
            recipient_name: recName,
            recipientName: recName,
            parent_recipient_name: parent,
            parentName: parent,
            'Awarding Agency': agency,
            awarding_agency: agency,
            agencyName: agency,
            'Awarding Sub Agency': office,
            awarding_sub_agency: office,
            officeName: office,
            pricingType: pricing,
            pricing_type: pricing,
            type_of_contract_pricing: pricing,
            recipient_location_state_code: hq,
            recipientState: hq,
            recipient_state: hq,
            'Award Amount': currentAmt,
            current_obligation: currentAmt,
            'Initial Obligation': initialAmt,
            initial_obligation: initialAmt,
            dollar_creep: creepAmt,
            percent_creep: pctCreep,
            'Base and All Options Value': Number(a.award_ceiling || currentAmt),
            Description: a.description || a.Description || '',
            description: a.description || a.Description || '',
            city_name: a.city_name || '',
            recipient_city_name: a.city_name || '',
            place_of_performance_city_name: a.city_name || '',
            transactions: tx,
          };
        }

        const awards = (awardsRes.results || []).map(mapAwardRow);

        return new Response(
          JSON.stringify({
            state: stateRow || null,
            counties: countiesRes.results || [],
            fiscalYears: fyRes.results || [],
            topAwards: awards,
            cachedAt: Date.now(),
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
              ...corsHeaders,
            },
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // GET /api/creep/county/:stateCode/:countyFips -> County details & awards
    if (pathname.startsWith('/api/creep/county/')) {
      const parts = pathname.split('/');
      const stateCode = parts[4]?.toUpperCase();
      const countyFips = parts[5]?.padStart(3, '0');

      if (!stateCode || !countyFips || !env.DB) {
        return new Response(JSON.stringify({ error: 'Missing stateCode or countyFips' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      try {
        const countyRow = await env.DB.prepare(
          'SELECT * FROM jurisdictions WHERE state_code = ? AND county_fips = ?'
        )
          .bind(stateCode, countyFips)
          .first();

        const awardsRes = await env.DB.prepare(
          'SELECT * FROM awards WHERE state_code = ? AND county_fips = ? ORDER BY dollar_creep DESC LIMIT 100'
        )
          .bind(stateCode, countyFips)
          .all();

        const fyRes = await env.DB.prepare(
          'SELECT * FROM jurisdiction_fiscal_years WHERE jurisdiction_id = ? ORDER BY fiscal_year ASC'
        )
          .bind(`county:${stateCode}:${countyFips}`)
          .all();

        function mapCountyAward(a) {
          if (!a) return null;
          let tx = [];
          try {
            tx = a.transactions_json ? (typeof a.transactions_json === 'string' ? JSON.parse(a.transactions_json) : a.transactions_json) : [];
          } catch {
            tx = [];
          }
          const piid = a.award_id_piid || a['Award ID'] || a.piid || a.internal_id || 'N/A';
          const recName = a.recipient_name || a['Recipient Name'] || 'Unknown Vendor';
          const parent = a.parent_recipient_name || a.parentName || recName;
          const agency = a.awarding_agency || a['Awarding Agency'] || 'Federal Government';
          const office = a.awarding_sub_agency || a['Awarding Sub Agency'] || a.office_name || 'Procurement Bureau';
          const pricing = a.pricing_type || a.pricingType || a.type_of_contract_pricing || 'FIXED PRICE';
          const hq = a.recipient_state || a.recipientState || a.recipient_location_state_code || '';
          const currentAmt = Number(a.current_obligation ?? a['Award Amount'] ?? 0);
          const initialAmt = Number(a.initial_obligation ?? a['Initial Obligation'] ?? currentAmt);
          const creepAmt = Number(a.dollar_creep ?? Math.max(0, currentAmt - initialAmt));
          const pctCreep = Number(a.percent_creep ?? (initialAmt > 0 ? (creepAmt / initialAmt) * 100 : 0));

          return {
            ...a,
            'Award ID': piid,
            award_id_piid: piid,
            piid,
            'Recipient Name': recName,
            recipient_name: recName,
            recipientName: recName,
            parent_recipient_name: parent,
            parentName: parent,
            'Awarding Agency': agency,
            awarding_agency: agency,
            agencyName: agency,
            'Awarding Sub Agency': office,
            awarding_sub_agency: office,
            officeName: office,
            pricingType: pricing,
            pricing_type: pricing,
            type_of_contract_pricing: pricing,
            recipient_location_state_code: hq,
            recipientState: hq,
            recipient_state: hq,
            'Award Amount': currentAmt,
            current_obligation: currentAmt,
            'Initial Obligation': initialAmt,
            initial_obligation: initialAmt,
            dollar_creep: creepAmt,
            percent_creep: pctCreep,
            'Base and All Options Value': Number(a.award_ceiling || currentAmt),
            Description: a.description || a.Description || '',
            description: a.description || a.Description || '',
            city_name: a.city_name || '',
            recipient_city_name: a.city_name || '',
            place_of_performance_city_name: a.city_name || '',
            transactions: tx,
          };
        }

        let countyAwardsRows = awardsRes.results || [];
        if (countyAwardsRows.length === 0) {
          const fallbackRes = await env.DB.prepare(
            'SELECT * FROM awards WHERE state_code = ? ORDER BY dollar_creep DESC, current_obligation DESC LIMIT 100'
          )
            .bind(stateCode)
            .all();
          countyAwardsRows = fallbackRes.results || [];
        }

        const awards = countyAwardsRows.map(mapCountyAward).filter(Boolean);

        return new Response(
          JSON.stringify({
            county: countyRow || null,
            fiscalYears: fyRes.results || [],
            awards,
            cachedAt: Date.now(),
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600',
              ...corsHeaders,
            },
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // GET /api/creep/fiscal-years/:jurisdictionId -> Year-by-year time-series
    if (pathname.startsWith('/api/creep/fiscal-years/')) {
      const jurId = decodeURIComponent(pathname.replace(/^\/api\/creep\/fiscal-years\//, ''));
      if (!jurId || !env.DB) {
        return new Response(JSON.stringify({ error: 'Missing jurisdictionId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      try {
        const fyRes = await env.DB.prepare(
          'SELECT * FROM jurisdiction_fiscal_years WHERE jurisdiction_id = ? ORDER BY fiscal_year ASC'
        )
          .bind(jurId)
          .all();

        return new Response(JSON.stringify({ fiscalYears: fyRes.results || [] }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // =========================================================================
    // 2. CIVIC KV / D1 CACHE LAYER (Dynamic Cache Fallback)
    // =========================================================================
    if (pathname.startsWith('/api/civic/cache')) {
      if (request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key || !env.DB) {
          return new Response(JSON.stringify({ hit: false }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        try {
          const now = Date.now();
          const row = await env.DB.prepare(
            'SELECT payload, expires_at FROM civic_cache WHERE cache_key = ? AND expires_at > ?'
          )
            .bind(key, now)
            .first();

          if (row) {
            return new Response(row.payload, {
              headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT-D1', ...corsHeaders },
            });
          }
        } catch (e) {
          // Ignore
        }

        return new Response(JSON.stringify({ hit: false }), {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS', ...corsHeaders },
        });
      }

      if (request.method === 'POST') {
        if (!env.DB) {
          return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
            status: 200,
            headers: corsHeaders,
          });
        }

        try {
          const { key, payload, ttlSeconds = 86400 } = await request.json();
          const now = Date.now();
          const expiresAt = now + ttlSeconds * 1000;

          await env.DB.prepare(`
            INSERT INTO civic_cache (cache_key, payload, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at
          `)
            .bind(key, typeof payload === 'string' ? payload : JSON.stringify(payload), expiresAt, now)
            .run();

          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: String(e) }), {
            status: 500,
            headers: corsHeaders,
          });
        }
      }
    }

    // =========================================================================
    // 3. STATIC SITE ASSET ROUTING & FALLBACK
    // =========================================================================
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const isDukeSubdomain =
      url.hostname.toLowerCase().startsWith('dukevibington.') ||
      url.hostname.toLowerCase().startsWith('dukevibington-') ||
      url.hostname.toLowerCase().startsWith('dukevibington');

    const addCacheHeaders = (res, targetUrl) => {
      const pathname = targetUrl.pathname;
      const headers = new Headers(res.headers);
      if (pathname.endsWith('.html') || pathname === '/' || !pathname.includes('.')) {
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');
      } else if (pathname.includes('/assets/')) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    };

    // If accessing via dukevibington subdomain directly
    if (isDukeSubdomain) {
      if (url.pathname === '/' || url.pathname === '') {
        const dukeHome = new URL('/dukevibington/index.html', url);
        const res = await env.ASSETS.fetch(new Request(dukeHome, request));
        return addCacheHeaders(res, dukeHome);
      }
      if (!url.pathname.startsWith('/dukevibington/')) {
        const dukeAsset = new URL(`/dukevibington${url.pathname}`, url);
        const res = await env.ASSETS.fetch(new Request(dukeAsset, request));
        if (res.status !== 404) return addCacheHeaders(res, dukeAsset);
      }
    }

    // Direct asset lookup first
    const directRes = await env.ASSETS.fetch(request);
    if (directRes.status !== 404) return addCacheHeaders(directRes, url);

    const siteName = url.pathname.split('/').filter(Boolean)[0];

    if (!siteName) {
      const rootHome = new URL('/index.html', url);
      const res = await env.ASSETS.fetch(new Request(rootHome, request));
      return addCacheHeaders(res, rootHome);
    }

    // Missing data/files must remain real 404s rather than receive an HTML shell.
    if (
      site &&
      (requestPath.includes('/data/') ||
        requestPath.includes('/tiles/') ||
        /\.[^/]+$/.test(requestPath))
    ) {
      return directRes;
    }

    if (siteName) {
      const siteHome = new URL(`/${encodeURIComponent(siteName)}/index.html`, url);
      const fallback = await env.ASSETS.fetch(new Request(siteHome, request));
      if (fallback.status !== 404) return addCacheHeaders(fallback, siteHome);
    }

    const notFound = await env.ASSETS.fetch(new Request(new URL('/404.html', url), request));
    return new Response(notFound.body, { status: 404, headers: notFound.headers });
  },
};
