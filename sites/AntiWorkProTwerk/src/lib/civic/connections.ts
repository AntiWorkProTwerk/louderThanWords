import { z } from 'zod';
import { secCik, insiderSourceSchema } from './insiders';
export const connectionKinds = ['insiders', 'major-stakes', 'shared-investors'] as const;
export const connectionLabels = {
  insiders: {
    title: 'Inside the company',
    subtitle: 'Insider records',
    color: '#927aa8',
    question: 'What ownership transactions were disclosed?',
    limit:
      'Includes grants, exercises and tax-related transactions—not just open-market buying or selling.',
  },
  'major-stakes': {
    title: 'The larger positions',
    subtitle: 'Major stakes',
    color: '#bd8762',
    question: 'Who disclosed a major ownership position?',
    limit:
      'Amendments and joint reporters stay separate. These are disclosures, not live trades or takeover predictions.',
  },
  'shared-investors': {
    title: 'The wider portfolio',
    subtitle: 'Shared investors',
    color: '#648d98',
    question: 'Which collected managers also held its peers?',
    limit:
      'Selected managers and dated securities only. Common holdings do not establish coordination or control.',
  },
};
export const connectionUpstreamSchema = z.object({
  kind: z.enum(connectionKinds),
  release: z.string().regex(/^[a-z]+-[a-f0-9]{24}$/),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  observedAt: z.string().datetime(),
  selection: z.string(),
});
export const connectionEntitySchema = z.object({
  cik: secCik,
  name: z.string().min(1),
  ticker: z.string(),
  state: z.string().nullable(),
  geography: z.string(),
  views: z
    .array(
      z.object({
        kind: z.enum(connectionKinds),
        count: z.number().int().positive(),
        unit: z.string(),
        from: z.string().date(),
        through: z.string().date(),
        dateMeaning: z.string(),
        href: z.string().regex(/^\/records\/[a-z-]+\/\?[A-Za-z0-9=&-]+$/),
        profile: insiderSourceSchema,
      }),
    )
    .min(2)
    .max(3),
});
export const connectionsDataSchema = z
  .object({
    formatVersion: z.literal(1),
    pipelineVersion: z.literal('connections-v1'),
    upstream: z.array(connectionUpstreamSchema).length(3),
    entities: z.array(connectionEntitySchema),
    method: z.literal('exact-issuer-cik'),
  })
  .superRefine((d, ctx) => {
    if (
      new Set(d.upstream.map((u) => u.kind)).size !== d.upstream.length ||
      new Set(d.entities.map((e) => e.cik)).size !== d.entities.length ||
      d.entities.some(
        (e) =>
          new Set(e.views.map((v) => v.kind)).size !== e.views.length ||
          e.views.some((v) => v.from > v.through),
      )
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate connection identity or invalid window' });
  });
export type ConnectionsData = z.infer<typeof connectionsDataSchema>;
export type ConnectionEntity = z.infer<typeof connectionEntitySchema>;
export function filterConnections(data: ConnectionsData, params: URLSearchParams) {
  const query = (params.get('q') ?? '').trim().toLowerCase();
  return data.entities.filter(
    (e) =>
      (!params.get('state') || e.state === params.get('state')) &&
      (!query || `${e.name} ${e.ticker} ${e.cik}`.toLowerCase().includes(query)) &&
      (params.get('depth') !== '3' || e.views.length === 3),
  );
}
export function connectionStateCounts(data: ConnectionsData, params: URLSearchParams) {
  const filters = new URLSearchParams(params);
  filters.delete('state');
  filters.delete('company');
  return filterConnections(data, filters).reduce<Record<string, number>>((counts, e) => {
    if (e.state) counts[e.state] = (counts[e.state] ?? 0) + 1;
    return counts;
  }, {});
}
