import type { NursingSummary } from './nursing';
// Per-layout context, never a shared server/global store. The page publishes the
// state-independent filtered collection so map selection and list selection agree.
export const nursingMapContext = 'nursing-map-v1';
export type NursingMapContext = { set: (facilities: NursingSummary[] | null) => void };
