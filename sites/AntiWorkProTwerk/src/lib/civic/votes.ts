import { z } from 'zod';
import {
  actionSchema,
  corpusSchema,
  personSchema,
  measureSchema,
  sourceSchema,
} from '../said-did/schema';

// Stable entity IDs deliberately reuse the Said / Did corpus. No fuzzy name joins.
export const voteReceiptSchema = z.object({
  id: z.string(),
  action: actionSchema,
  person: personSchema.nullable(),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  cautions: z.array(z.string()),
  connections: z.array(
    z.object({
      kind: z.enum(['member', 'measure', 'statement']),
      id: z.string(),
      label: z.string(),
    }),
  ),
});
export const voteDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('vote-receipts-v1'),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  scope: corpusSchema.shape.scope,
  receipts: z.array(voteReceiptSchema),
  measures: z.array(measureSchema),
  sources: z.array(sourceSchema),
  statements: z.array(
    z.object({
      id: z.string(),
      passageId: z.string(),
      personId: z.string(),
      measureId: z.string(),
      sourceId: z.string(),
      text: z.string(),
      date: z.string().date(),
    }),
  ),
  states: z.record(z.string(), z.number().int().nonnegative()),
  excluded: z.array(z.object({ id: z.string(), reason: z.string() })),
});
export const voteManifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^vr-[a-f0-9]{24}$/),
  publishedAt: z.string().datetime(),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type VoteData = z.infer<typeof voteDataSchema>;
export type VoteReceipt = z.infer<typeof voteReceiptSchema>;

const searchIndexes = new WeakMap<
  VoteData,
  { bills: Map<string, string>; receipts: Map<string, string> }
>();
function searchIndex(data: VoteData) {
  const previous = searchIndexes.get(data);
  if (previous) return previous;
  const index = {
    bills: new Map(
      data.measures.map((bill) => [
        bill.id,
        [
          bill.title,
          bill.id,
          bill.policy,
          bill.policyDefinition,
          ...bill.versions.map((v) => v.provision),
        ]
          .join(' ')
          .toLocaleLowerCase(),
      ]),
    ),
    receipts: new Map(
      data.receipts.map((r) => [
        r.id,
        [r.person?.name, r.person?.bioguideId, r.action.question, r.action.rawVote]
          .join(' ')
          .toLocaleLowerCase(),
      ]),
    ),
  };
  searchIndexes.set(data, index);
  return index;
}

export function searchReceipts(
  data: VoteData,
  query: string,
  state = '',
  kind = '',
  member = '',
  measure = '',
) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const index = searchIndex(data);
  // Search long legislative text once per measure, not once per representative.
  const matches = new Map(
    [...index.bills].map(([id, text]) => [id, terms.map((term) => text.includes(term))]),
  );
  return data.receipts.filter((receipt) => {
    const text = index.receipts.get(receipt.id)!;
    return (
      (!state || receipt.state === state) &&
      (!kind || receipt.action.kind === kind) &&
      (!member || receipt.person?.id === member) &&
      (!measure || receipt.action.measureId === measure) &&
      terms.every((term, i) => matches.get(receipt.action.measureId)![i] || text.includes(term))
    );
  });
}
