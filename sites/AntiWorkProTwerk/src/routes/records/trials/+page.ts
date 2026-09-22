import { base } from '$app/paths';
import { loadTrials } from '$lib/civic/repository';
import { loadResearch } from '$lib/civic/research-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    const [trials,research] = await Promise.all([loadTrials(fetch,base),loadResearch(fetch,base).catch(()=>null)]);
    return { trials, research, trialsError: null };
  } catch {
    return {
      trials: null,
      research: null,
      trialsError: 'The trial-results snapshot could not load. Reload to try again.',
    };
  }
}
