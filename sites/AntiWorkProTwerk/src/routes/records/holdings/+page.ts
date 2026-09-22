import { base } from '$app/paths';
import { loadHoldings } from '$lib/civic/holdings-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { holdings: await loadHoldings(fetch, base), holdingsError: null };
  } catch {
    return {
      holdings: null,
      holdingsError: 'The holdings collection could not load or verify. Reload to try again.',
    };
  }
}
