import { loadEvidence } from '$lib/said-did/load';
export const load = ({ fetch }: { fetch: typeof globalThis.fetch }) => loadEvidence(fetch);
