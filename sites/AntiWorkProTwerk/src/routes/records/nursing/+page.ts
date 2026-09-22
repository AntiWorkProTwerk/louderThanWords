import { base } from '$app/paths';
import { loadNursing } from '$lib/civic/nursing-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { nursing: await loadNursing(fetch, base), nursingError: null };
  } catch {
    return {
      nursing: null,
      nursingError: 'The CMS collection could not load or verify. Reload to try again.',
    };
  }
}
