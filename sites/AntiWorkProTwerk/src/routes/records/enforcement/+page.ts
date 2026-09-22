import { base } from '$app/paths';
import { loadEcho } from '$lib/civic/echo-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { echo: await loadEcho(fetch, base), echoError: null };
  } catch {
    return {
      echo: null,
      echoError: 'The EPA collection could not load or verify. Reload to try again.',
    };
  }
}
