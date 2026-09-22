import { base } from '$app/paths';
import { loadVotes } from '$lib/civic/repository';

export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    return { votes: await loadVotes(fetch, base), votesError: null };
  } catch {
    return { votes: null, votesError: 'Vote receipts could not load. Please reload to try again.' };
  }
}
