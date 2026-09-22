import { base } from '$app/paths';
import { loadSharedInvestors } from '$lib/civic/shared-investors-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { sharedInvestors: await loadSharedInvestors(fetch, base), sharedInvestorsError: null };
  } catch {
    return {
      sharedInvestors: null,
      sharedInvestorsError:
        'The shared-investor collection could not load or verify. Reload to try again.',
    };
  }
}
