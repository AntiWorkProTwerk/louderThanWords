import { base } from '$app/paths';
import { loadGraveyard } from '$lib/civic/graveyard-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { graveyard: await loadGraveyard(fetch, base), graveyardError: null };
  } catch {
    return {
      graveyard: null,
      graveyardError: 'The bill-status snapshot could not load. Reload to try again.',
    };
  }
}
