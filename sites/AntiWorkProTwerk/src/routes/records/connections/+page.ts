import { base } from '$app/paths';
import { loadConnections } from '$lib/civic/connections-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { connections: await loadConnections(fetch, base), connectionsError: null };
  } catch {
    return {
      connections: null,
      connectionsError: 'The connection index could not load or verify. Reload to try again.',
    };
  }
}
