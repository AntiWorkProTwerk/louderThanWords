export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
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
