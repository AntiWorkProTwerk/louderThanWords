import { base } from '$app/paths';
import { loadStakes } from '$lib/civic/major-stakes-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { majorStakes: await loadStakes(fetch, base), majorStakesError: null };
  } catch {
    return {
      majorStakes: null,
      majorStakesError:
        'The ownership-disclosure collection could not load or verify. Reload to try again.',
    };
  }
}
