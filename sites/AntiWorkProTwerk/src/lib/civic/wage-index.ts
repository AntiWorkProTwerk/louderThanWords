import { z } from 'zod';
import { wageDataSchema, wageSummarySchema, wageCaseSchema, type WageSummary } from './wages';

// Ordered transport fields: a compact wire format, not a different data model.
export const wageIndexFields = [
  'id',
  'name',
  'legalName',
  'employerKey',
  'city',
  'state',
  'reportedState',
  'industry',
  'industryDescription',
  'end',
  'backWages',
  'penalties',
  'employeesAgreed',
  'employeesViolation',
  'violations',
] as const;
const rowSchema = z.tuple([
  wageSummarySchema.shape.id,
  wageSummarySchema.shape.name,
  wageSummarySchema.shape.legalName,
  wageSummarySchema.shape.employerKey,
  wageSummarySchema.shape.city,
  wageSummarySchema.shape.state,
  wageSummarySchema.shape.reportedState,
  wageSummarySchema.shape.industry,
  wageSummarySchema.shape.industryDescription,
  wageSummarySchema.shape.end,
  wageSummarySchema.shape.backWages,
  wageSummarySchema.shape.penalties,
  wageSummarySchema.shape.employeesAgreed,
  wageSummarySchema.shape.employeesViolation,
  wageSummarySchema.shape.violations,
]);
export const wageIndexSchema = wageDataSchema.omit({ records: true }).extend({
  indexVersion: z.literal('wage-browser-v1'),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  fields: z.array(z.enum(wageIndexFields)).length(wageIndexFields.length),
  rows: z.array(rowSchema),
});
export type WageIndex = Omit<z.infer<typeof wageIndexSchema>, 'rows' | 'fields'> & {
  records: WageSummary[];
};
export function decodeWageIndex(raw: unknown): WageIndex {
  const { rows, fields, ...index } = wageIndexSchema.parse(raw);
  if (JSON.stringify(fields) !== JSON.stringify(wageIndexFields))
    throw new Error('WHD index column order mismatch');
  const records = rows.map((row) =>
    wageSummarySchema.parse(Object.fromEntries(fields.map((field, i) => [field, row[i]]))),
  );
  if (
    records.length !== index.coverage.selectedRows ||
    new Set(records.map((r) => r.id)).size !== records.length
  )
    throw new Error('WHD index coverage mismatch');
  return { ...index, records };
}
export function wageShard(id: string) {
  if (!/^\d{1,10}$/.test(id)) throw new Error('Invalid WHD case ID');
  return `cases-v1/${(Number(id) % 64).toString(16).padStart(2, '0')}.json`;
}
export const wageShardSchema = z.object({
  indexVersion: z.literal('wage-browser-v1'),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  records: z.array(wageCaseSchema),
});
