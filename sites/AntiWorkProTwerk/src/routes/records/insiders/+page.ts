import { base } from '$app/paths';
import { loadInsiders } from '$lib/civic/insiders-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { insiders: await loadInsiders(fetch, base), insidersError: null };
  } catch {
    return {
      insiders: null,
      insidersError: 'The SEC ownership collection could not load or verify. Reload to try again.',
    };
  }
}
