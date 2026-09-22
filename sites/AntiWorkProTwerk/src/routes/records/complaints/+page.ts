import { base } from '$app/paths';
import { loadComplaints } from '$lib/civic/complaints-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { complaints: await loadComplaints(fetch, base), complaintsError: null };
  } catch {
    return {
      complaints: null,
      complaintsError: 'The complaint snapshot could not load. Reload to try again.',
    };
  }
}
