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
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
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
