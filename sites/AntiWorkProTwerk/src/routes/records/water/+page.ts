import { base } from '$app/paths';
import { loadWater } from '$lib/civic/water-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { water: await loadWater(fetch, base), waterError: null };
  } catch {
    return {
      water: null,
      waterError: 'The water-system collection could not load or verify. Reload to try again.',
    };
  }
}
