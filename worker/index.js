export default {
  async fetch(request, env) {
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

    if (siteName) {
      const siteHome = new URL(`/${encodeURIComponent(siteName)}/index.html`, url);
      const fallback = await env.ASSETS.fetch(new Request(siteHome, request));
      if (fallback.status !== 404) return fallback;
    }

    const notFound = await env.ASSETS.fetch(new Request(new URL('/404.html', url), request));
    return new Response(notFound.body, { status: 404, headers: notFound.headers });
  },
};
