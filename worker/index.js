import registry from '../sites.config.json';
import { siteHandlers } from '../.generated/site-handlers.js';

export default {
  async fetch(request, env) {
    const requestPath = new URL(request.url).pathname;
    const username = requestPath.split('/')[1];
    const site = registry.sites.find((entry) => entry.username === username);
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
        const handler = siteHandlers[site.username];
        return handler
          ? handler(request, siteEnv, requestPath.slice(prefix.length))
          : Response.json(
              { error: 'This site has no API handler yet.' },
              { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
            );
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
    const url = new URL(request.url);

    // 1. Edge API & D1 Cache Routes
    if (url.pathname.startsWith('/api/civic/cache')) {
      if (request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key || !env.DB) {
          return new Response(JSON.stringify({ hit: false }), {
            headers: { 'Content-Type': 'application/json' },
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
              headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT-D1' },
            });
          }
        } catch (e) {
          // Table not yet created or error
        }

        return new Response(JSON.stringify({ hit: false }), {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
        });
      }

      if (request.method === 'POST') {
        if (!env.DB) {
          return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), { status: 200 });
        }

        try {
          const { key, payload, ttlSeconds = 86400 } = await request.json();
          const now = Date.now();
          const expiresAt = now + ttlSeconds * 1000;

          // Auto-create cache table if not exists
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS civic_cache (
              cache_key TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              expires_at INTEGER NOT NULL,
              created_at INTEGER NOT NULL
            )
          `).run();

          await env.DB.prepare(`
            INSERT INTO civic_cache (cache_key, payload, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at
          `)
            .bind(key, typeof payload === 'string' ? payload : JSON.stringify(payload), expiresAt, now)
            .run();

          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
        }
      }
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    // 2. Static Asset and Site Fallback Routing
    const siteName = url.pathname.split('/').filter(Boolean)[0];

    if (!siteName) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    // Missing data/files must remain real 404s rather than receive an HTML shell.
    if (
      site &&
      (requestPath.includes('/data/') ||
        requestPath.includes('/tiles/') ||
        /\.[^/]+$/.test(requestPath))
    )
      return asset;

    if (site) {
      const siteHome = new URL(`/${encodeURIComponent(siteName)}/index.html`, url);
      const fallback = await env.ASSETS.fetch(new Request(siteHome, request));
      if (fallback.status !== 404) return fallback;
    }

    const notFound = await env.ASSETS.fetch(new Request(new URL('/404.html', url), request));
    return new Response(notFound.body, { status: 404, headers: notFound.headers });
  },
};
