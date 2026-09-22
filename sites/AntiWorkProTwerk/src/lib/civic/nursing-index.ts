import { z } from 'zod';
import {
  nursingDataSchema,
  facilitySummarySchema,
  partySchema,
  nursingDetailSchema,
  partyFacilities,
  type NursingData,
  type NursingDetail,
  type NursingSummary,
} from './nursing';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const nursingFields = Object.keys(facilitySummarySchema.shape) as (keyof NursingSummary)[];
const { facilities: _facilities, parties: _parties, ...metadata } = nursingDataSchema.shape;
const wireSchema = z.object({
  ...metadata,
  indexVersion: z.literal('nursing-browser-v1'),
  dataHash: digest,
  fields: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  featured: z.array(partySchema).max(12),
  partyCount: z.number().int().nonnegative(),
});
export type NursingIndex = Omit<z.infer<typeof wireSchema>, 'rows' | 'fields'> & {
  facilities: NursingSummary[];
};
export function decodeNursingIndex(raw: unknown): NursingIndex {
  const { rows, fields, ...data } = wireSchema.parse(raw);
  if (
    JSON.stringify(fields) !== JSON.stringify(nursingFields) ||
    rows.some((r) => r.length !== fields.length)
  )
    throw new Error('Nursing index columns mismatch');
  const facilities = rows.map((row) =>
    facilitySummarySchema.parse(Object.fromEntries(fields.map((key, i) => [key, row[i]]))),
  );
  const ids = new Set(facilities.map((f) => f.id));
  if (
    ids.size !== facilities.length ||
    facilities.length !== data.coverage.selectedProviders ||
    facilities.length > data.plan.maxFacilities ||
    facilities.some((f) => !data.plan.states.includes(f.state)) ||
    new Set(data.sources.map((s) => s.kind)).size !== 5
  )
    throw new Error('Nursing index scope mismatch');
  validateParties(data.featured, ids);
  return { ...data, facilities };
}
export function validateParties(parties: z.infer<typeof partySchema>[], ids: Set<string>) {
  if (
    new Set(parties.map((p) => p.id)).size !== parties.length ||
    parties.some((p) =>
      Object.values(p.facilitiesByRole).some(
        (ccns) => new Set(ccns).size !== ccns.length || ccns.some((id) => !ids.has(id)),
      ),
    )
  )
    throw new Error('Nursing party references mismatch');
}
export function nursingShard(kind: 'facilities' | 'parties', id: string) {
  if (!(kind === 'facilities' ? /^[A-Z0-9]{6}$/ : /^\d{10}$/).test(id))
    throw new Error('Invalid nursing evidence ID');
  let code = 0;
  for (const char of id) code = (code * 31 + char.charCodeAt(0)) % 64;
  return `${kind}-v1/${code.toString(16).padStart(2, '0')}.json`;
}
export const nursingPartyShardSchema = z.object({
  dataHash: digest,
  records: z.array(partySchema),
});
export const nursingFacilityShardSchema = z.object({
  dataHash: digest,
  records: z.array(nursingDetailSchema),
});
export function nursingAttachments(data: NursingData, details: NursingDetail[], dataHash: string) {
  const { facilities, parties, ...metadata } = data;
  const index = {
    ...metadata,
    indexVersion: 'nursing-browser-v1' as const,
    dataHash,
    fields: nursingFields,
    rows: facilities.map((f) => nursingFields.map((key) => f[key])),
    featured: parties
      .filter((p) => p.type === 'O' && partyFacilities(p).size > 1)
      .sort((a, b) => partyFacilities(b).size - partyFacilities(a).size || a.id.localeCompare(b.id))
      .slice(0, 12),
    partyCount: parties.length,
  };
  decodeNursingIndex(index);
  const shards = new Map<string, unknown[]>();
  for (const detail of details) {
    const file = nursingShard('facilities', detail.facility.id);
    shards.set(file, [...(shards.get(file) ?? []), detail]);
  }
  for (const party of parties) {
    const file = nursingShard('parties', party.id);
    shards.set(file, [...(shards.get(file) ?? []), party]);
  }
  return Object.fromEntries([
    ['index-v1.json', index],
    ['parties-v1.json', { dataHash, records: parties }],
    ...[...shards].map(([file, records]) => [file, { dataHash, records }]),
  ]);
}
