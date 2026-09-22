import { z } from 'zod';

export const secCik = z.string().regex(/^\d{10}$/);
export const insiderAccession = z.string().regex(/^\d{10}-\d{2}-\d{6}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const insiderQuarter = z.string().regex(/^20\d{2}q[1-4]$/);
export const insiderKinds = [
  'purchase',
  'sale',
  'award',
  'taxExercise',
  'exercise',
  'gift',
  'other',
] as const;
export const insiderKindNames = {
  purchase: 'Purchase',
  sale: 'Sale',
  award: 'Grant / award',
  taxExercise: 'Tax / exercise payment',
  exercise: 'Exercise / conversion',
  gift: 'Gift',
  other: 'Other transaction',
};
export const insiderCodes: Record<
  string,
  { kind: (typeof insiderKinds)[number]; label: string; explanation: string }
> = {
  P: {
    kind: 'purchase',
    label: 'Open-market or private purchase',
    explanation:
      'A reported purchase. This code does not distinguish an exchange trade from a private purchase, or establish the buyer’s motive.',
  },
  S: {
    kind: 'sale',
    label: 'Open-market or private sale',
    explanation:
      'A reported sale. Read the price footnotes and filing-level trading-plan disclosure; a sale is not a prediction about the company.',
  },
  A: {
    kind: 'award',
    label: 'Grant, award or other Rule 16b-3(d) acquisition',
    explanation:
      'An equity grant or another acquisition under this rule—not necessarily a purchase with the reporting person’s own cash.',
  },
  F: {
    kind: 'taxExercise',
    label: 'Securities withheld or delivered for tax / exercise payment',
    explanation:
      'Shares delivered or withheld to cover a tax liability or exercise price. Do not relabel this as an open-market sale.',
  },
  M: {
    kind: 'exercise',
    label: 'Exempt exercise or conversion',
    explanation:
      'Exercise or conversion of a derivative security under Rule 16b-3. Related rows may describe the same event; do not add them as separate economic trades.',
  },
  C: {
    kind: 'exercise',
    label: 'Derivative conversion',
    explanation:
      'Conversion of a derivative security. Read the underlying security and linked footnotes.',
  },
  O: {
    kind: 'exercise',
    label: 'Out-of-the-money derivative exercise',
    explanation: 'A reported exercise, not an ordinary open-market purchase.',
  },
  X: {
    kind: 'exercise',
    label: 'In- or at-the-money derivative exercise',
    explanation: 'A reported exercise, not an ordinary open-market purchase.',
  },
  G: {
    kind: 'gift',
    label: 'Gift',
    explanation: 'A gift reported in the filing. It is not a purchase or sale.',
  },
  D: {
    kind: 'other',
    label: 'Disposition to the issuer',
    explanation:
      'A disposition to the issuing company under Rule 16b-3(e), not the same as transaction code S.',
  },
  E: {
    kind: 'other',
    label: 'Short derivative expiration',
    explanation: 'Expiration of a short derivative position; read the security and footnotes.',
  },
  H: {
    kind: 'other',
    label: 'Long derivative expiration / cancellation',
    explanation: 'Expiration or cancellation of a long derivative position with value received.',
  },
  I: {
    kind: 'other',
    label: 'Discretionary plan transaction',
    explanation:
      'A discretionary acquisition or disposition under Rule 16b-3(f); this is not the 10b5-1 checkbox.',
  },
  J: {
    kind: 'other',
    label: 'Other acquisition / disposition',
    explanation:
      'The transaction needs its footnote explanation. No motive or ordinary buy/sell label is inferred.',
  },
  L: {
    kind: 'other',
    label: 'Small acquisition',
    explanation: 'A small acquisition reported under Rule 16a-6; read the original disclosure.',
  },
  U: {
    kind: 'other',
    label: 'Change-of-control tender disposition',
    explanation: 'A disposition through a tender of shares in a change-of-control transaction.',
  },
  W: {
    kind: 'other',
    label: 'Inheritance / will transaction',
    explanation: 'An acquisition or disposition through a will or inheritance.',
  },
  Z: {
    kind: 'other',
    label: 'Voting trust deposit / withdrawal',
    explanation:
      'A deposit into or withdrawal from a voting trust—not automatically an economic purchase or sale.',
  },
};
export function explainInsiderCode(code: string | null) {
  return (
    insiderCodes[code ?? ''] ?? {
      kind: 'other' as const,
      label: code ? `Unclassified code ${code}` : 'Transaction code not supplied',
      explanation:
        'Read the exact source fields and footnotes. The code is not silently translated into a purchase or sale.',
    }
  );
}
export const insiderPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    selection: z.string().min(1),
    issuers: z.array(secCik).min(1).max(50),
    quarters: z
      .array(z.object({ quarter: insiderQuarter, url: z.string().url() }))
      .min(1)
      .max(12),
    maxFilings: z.number().int().positive().max(25000),
  })
  .refine(
    (p) =>
      new Set(p.issuers).size === p.issuers.length &&
      new Set(p.quarters.map((q) => q.quarter)).size === p.quarters.length,
    'Duplicate insider scope',
  );
export type InsiderPlan = z.infer<typeof insiderPlanSchema>;
export const insiderSourceSchema = z.object({
  url: z.string().url(),
  hash: digest,
  bytes: z.number().int().positive(),
  observedAt: z.string().datetime(),
  lastModified: z.string().nullable(),
});
export const insiderRowSchema = z.object({
  row: z.number().int().positive(),
  hash: digest,
  fields: z.record(z.string(), z.string()),
});
export type InsiderRow = z.infer<typeof insiderRowSchema>;
export const insiderOwnerSchema = z.object({
  cik: secCik,
  name: z.string().min(1),
  relationship: z.string(),
  title: z.string().nullable(),
  other: z.string().nullable(),
});
export const insiderIssuerSchema = z.object({
  cik: secCik,
  name: z.string(),
  tickers: z.array(z.string()),
  city: z.string().nullable(),
  state: z.string().nullable(),
  stateDescription: z.string().nullable(),
  source: insiderSourceSchema,
});
export type InsiderIssuer = z.infer<typeof insiderIssuerSchema>;
export const insiderSummarySchema = z.object({
  accession: insiderAccession,
  quarter: insiderQuarter,
  issuerCik: secCik,
  issuerName: z.string().min(1),
  symbol: z.string().nullable(),
  filed: z.string().date(),
  period: z.string().date().nullable(),
  originalFiled: z.string().date().nullable(),
  form: z.enum(['3', '3/A', '4', '4/A', '5', '5/A']),
  tradingPlan: z.boolean().nullable(),
  owners: z.array(insiderOwnerSchema).min(1),
  codes: z.array(z.string()),
  transactions: z.object({
    nonDerivative: z.number().int().nonnegative(),
    derivative: z.number().int().nonnegative(),
  }),
  holdings: z.object({
    nonDerivative: z.number().int().nonnegative(),
    derivative: z.number().int().nonnegative(),
  }),
  recordHash: digest,
});
export type InsiderSummary = z.infer<typeof insiderSummarySchema>;
export const insiderEntrySchema = z.object({
  id: z.string().regex(/^\d+$/),
  table: z.enum(['NONDERIV_TRANS', 'DERIV_TRANS', 'NONDERIV_HOLDING', 'DERIV_HOLDING']),
  security: z.string(),
  code: z.string().nullable(),
  date: z.string().date().nullable(),
  kind: z.enum(insiderKinds).nullable(),
  fields: insiderRowSchema,
  footnotes: z.array(z.object({ field: z.string(), id: z.string(), text: z.string().nullable() })),
});
export type InsiderEntry = z.infer<typeof insiderEntrySchema>;
export const insiderDetailSchema = z.object({
  filing: insiderSummarySchema,
  submission: insiderRowSchema,
  owners: z.array(insiderRowSchema),
  entries: z.array(insiderEntrySchema),
  footnotes: z.array(insiderRowSchema),
});
export type InsiderDetail = z.infer<typeof insiderDetailSchema>;
export const insiderDataSchema = z
  .object({
    formatVersion: z.literal(1),
    pipelineVersion: z.literal('insiders-v1'),
    plan: insiderPlanSchema,
    observedAt: z.string().datetime(),
    archives: z.array(
      z.object({
        quarter: insiderQuarter,
        source: insiderSourceSchema,
        tables: z.array(
          z.object({
            member: z.string(),
            rows: z.number().int().nonnegative(),
            selected: z.number().int().nonnegative(),
            headers: z.array(z.string()),
          }),
        ),
      }),
    ),
    issuers: z.array(insiderIssuerSchema),
    filings: z.array(insiderSummarySchema),
    changes: z.object({
      baselineAt: z.string().datetime().nullable(),
      added: z.array(insiderAccession),
      updated: z.array(insiderAccession),
    }),
  })
  .refine(
    (d) =>
      new Set(d.filings.map((f) => f.accession)).size === d.filings.length &&
      new Set(d.issuers.map((i) => i.cik)).size === d.issuers.length &&
      d.filings.length <= d.plan.maxFilings,
    'Duplicate or oversized insider collection',
  );
export type InsiderData = z.infer<typeof insiderDataSchema>;
export function filterInsiders(data: InsiderData, params: URLSearchParams) {
  const terms = (params.get('q') ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean),
    kind = params.get('kind');
  return data.filings.filter(
    (f) =>
      (!params.get('issuer') || f.issuerCik === params.get('issuer')) &&
      (!params.get('owner') || f.owners.some((o) => o.cik === params.get('owner'))) &&
      (!params.get('state') ||
        data.issuers.find((i) => i.cik === f.issuerCik)?.state === params.get('state')) &&
      (!params.get('form') || f.form === params.get('form')) &&
      (!params.get('month') || f.filed.startsWith(params.get('month')!)) &&
      (!kind || f.codes.some((c) => explainInsiderCode(c).kind === kind)) &&
      (!params.get('plan') ||
        (params.get('plan') === 'yes'
          ? f.tradingPlan === true
          : params.get('plan') === 'no'
            ? f.tradingPlan === false
            : params.get('plan') === 'unknown' && f.tradingPlan === null)) &&
      terms.every((t) =>
        `${f.accession} ${f.issuerCik} ${f.issuerName} ${f.symbol ?? ''} ${f.owners.map((o) => `${o.cik} ${o.name}`).join(' ')}`
          .toLowerCase()
          .includes(t),
      ),
  );
}
export function insiderStateCounts(data: InsiderData, params: URLSearchParams) {
  const p = new URLSearchParams(params);
  p.delete('state');
  return filterInsiders(data, p).reduce<Record<string, number>>((result, f) => {
    const state = data.issuers.find((i) => i.cik === f.issuerCik)?.state;
    if (state) result[state] = (result[state] ?? 0) + 1;
    return result;
  }, {});
}
export const insiderFilingUrl = (f: Pick<InsiderSummary, 'issuerCik' | 'accession'>) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(f.issuerCik)}/${f.accession.replaceAll('-', '')}/${f.accession}-index.html`;
