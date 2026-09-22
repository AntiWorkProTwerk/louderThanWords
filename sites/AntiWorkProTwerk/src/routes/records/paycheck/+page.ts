import { base } from '$app/paths';
import { browser } from '$app/environment';
import { loadPaycheck } from '$lib/civic/paycheck-repository';
export async function load({ fetch, url }: { fetch: typeof globalThis.fetch; url: URL }) {
  try {
    return {
      paycheck: await loadPaycheck(fetch, base, browser ? url.searchParams.get('release') : null),
      paycheckError: null,
    };
  } catch {
    return {
      paycheck: null,
      paycheckError:
        'This paycheck snapshot could not load. A pinned release is never silently replaced with a newer one.',
    };
  }
}
