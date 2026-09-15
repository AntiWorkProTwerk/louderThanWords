import { z } from 'zod';

export const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const stateCode = z.string().regex(/^[A-Z]{2}$/);
export const sourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  collectedAt: z.string().datetime(),
  transformationVersion: z.string(),
  kind: z.enum(['demo', 'official']),
});
export const stateSchema = z.object({
  code: stateCode,
  name: z.string(),
  fips: z.string(),
  center: z.tuple([z.number(), z.number()]),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});
export const politicianSummarySchema = z.object({
  id: identifier,
  name: z.string(),
  party: z.enum(['R', 'D', 'I']),
  state: stateCode,
  role: z.string(),
  description: z.string(),
  portrait: z.string().nullable(),
  approval: z.number().min(0).max(100),
  alignment: z.number().min(0).max(100),
  donations: z.number().nonnegative(),
  billCount: z.number().int().nonnegative(),
  issues: z.array(z.string()),
  district: z.string(),
  fictional: z.boolean(),
});
export const billSchema = z.object({
  id: identifier,
  number: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
});
export const politicianSchema = politicianSummarySchema.extend({
  release: identifier,
  source: sourceSchema,
  votes: z.array(
    z.object({ bill: billSchema, vote: z.enum(['Yea', 'Nay', 'Not voting']), date: z.string() }),
  ),
  donors: z.array(z.object({ category: z.string(), amount: z.number().nonnegative() })),
  bills: z.array(billSchema),
});
export const summarySchema = z.object({
  release: identifier,
  state: stateSchema,
  people: z.array(politicianSummarySchema),
  source: sourceSchema,
});
export const manifestSchema = z.object({
  version: z.literal(1),
  release: identifier,
  publishedAt: z.string().datetime(),
  states: z.array(stateSchema),
  demo: z.boolean(),
});
export type State = z.infer<typeof stateSchema>;
export type PoliticianSummary = z.infer<typeof politicianSummarySchema>;
export type Politician = z.infer<typeof politicianSchema>;
export type StateSummary = z.infer<typeof summarySchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type Panel =
  | 'people'
  | 'call'
  | 'votes'
  | 'donors'
  | 'compare'
  | 'bills'
  | 'profile'
  | 'account'
  | 'saved'
  | 'impact';
export const panels: Panel[] = [
  'people',
  'call',
  'votes',
  'donors',
  'compare',
  'bills',
  'profile',
  'account',
  'saved',
  'impact',
];
