import { base } from '$app/paths';
import { loadResearch } from '$lib/civic/research-repository';
import { loadTrials } from '$lib/civic/repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  const [research, trials] = await Promise.all([
    loadResearch(fetch, base).catch(() => null),
    loadTrials(fetch, base).catch(() => null),
  ]);
  return {
    research,
    trials,
    researchError: research
      ? null
      : 'The research-funding snapshot could not load. Reload to try again.',
  };
}
