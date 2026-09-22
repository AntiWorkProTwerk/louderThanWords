import { base } from '$app/paths';
import { loadLobbying } from '$lib/civic/lobbying-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { lobbying: await loadLobbying(fetch, base), lobbyingError: null };
  } catch {
    return {
      lobbying: null,
      lobbyingError: 'The lobbying snapshot could not load. Reload to try again.',
    };
  }
}
