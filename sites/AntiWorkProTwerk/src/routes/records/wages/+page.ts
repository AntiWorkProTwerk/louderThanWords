import { base } from '$app/paths';
import { loadWageIndex } from '$lib/civic/wages-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { wages: await loadWageIndex(fetch, base), wagesError: null };
  } catch {
    return {
      wages: null,
      wagesError: 'The wage ledger snapshot could not load. Reload to try again.',
    };
  }
}
