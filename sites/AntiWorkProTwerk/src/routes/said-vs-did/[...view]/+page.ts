import { loadEvidence } from '$lib/said-did/load';
export const load = ({
  fetch,
  params,
}: {
  fetch: typeof globalThis.fetch;
  params: { view: string };
}) => loadEvidence(fetch, params.view);
