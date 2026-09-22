import { base } from '$app/paths';
import { loadRules } from '$lib/civic/rules-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { rules: await loadRules(fetch, base), rulesError: null };
  } catch {
    return {
      rules: null,
      rulesError:
        'The rulebook snapshot could not load. Your saved topics remain on this device. Reload to retry.',
    };
  }
}
