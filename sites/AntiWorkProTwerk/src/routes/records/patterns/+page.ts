import { browser } from '$app/environment';
import { base } from '$app/paths';
import { loadPatterns } from '$lib/civic/patterns-repository';
export async function load({ fetch, url }: { fetch: typeof globalThis.fetch; url: URL }) {
  try {
    return {
      patterns: await loadPatterns(fetch, base, browser ? url.searchParams.get('release') : null),
      patternsError: null,
    };
  } catch {
    return {
      patterns: null,
      patternsError:
        'This frozen comparison could not load or failed verification. A pinned link never silently substitutes newer data.',
    };
  }
}
