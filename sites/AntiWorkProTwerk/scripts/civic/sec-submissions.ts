import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { acquireSecFile, secSourceSchema } from './sec-source';
import { secCik, insiderAccession } from '../../src/lib/civic/insiders';

export const secCaptureSchema = z.object({
  key: z.string(),
  source: secSourceSchema,
  body: z.string().max(20_000_000),
});
export type SecCapture = z.infer<typeof secCaptureSchema>;
export const secSubmissionRowSchema = z.object({
  accessionNumber: insiderAccession,
  filingDate: z.string().date(),
  acceptanceDateTime: z.string().datetime({ offset: true }),
  form: z.string().min(1),
  primaryDocument: z.string(),
});
export type SecSubmissionRow = z.infer<typeof secSubmissionRowSchema>;
const columns = [
  'accessionNumber',
  'filingDate',
  'acceptanceDateTime',
  'form',
  'primaryDocument',
] as const;
export function secSubmissionRows(value: unknown): SecSubmissionRow[] {
  const data = z.record(z.string(), z.unknown()).parse(value),
    count = Array.isArray(data.accessionNumber) ? data.accessionNumber.length : -1;
  if (count < 0 || columns.some((k) => !Array.isArray(data[k]) || data[k].length !== count))
    throw new Error('Incomplete SEC submissions columns');
  const rows = Array.from({ length: count }, (_, i) =>
    secSubmissionRowSchema.parse(
      Object.fromEntries(columns.map((k) => [k, (data[k] as unknown[])[i]])),
    ),
  );
  if (new Set(rows.map((r) => r.accessionNumber)).size !== rows.length)
    throw new Error('Duplicate SEC submission accession');
  return rows;
}
export const secHistoryFileSchema = z
  .object({
    name: z.string(),
    filingCount: z.number().int().nonnegative(),
    filingFrom: z.string().date(),
    filingTo: z.string().date(),
  })
  .refine((f) => f.filingFrom <= f.filingTo, 'Invalid SEC history interval');
export function secSubmissionsUrl(cik: string, file?: string) {
  secCik.parse(cik);
  if (file && !new RegExp(`^CIK${cik}-submissions-\\d+\\.json$`).test(file))
    throw new Error('Unexpected SEC submissions history filename');
  return `https://data.sec.gov/submissions/${file ?? `CIK${cik}.json`}`;
}
export function validateSecCapture(c: SecCapture, url: string) {
  if (
    c.source.url !== url ||
    Buffer.byteLength(c.body) !== c.source.bytes ||
    createHash('sha256').update(c.body).digest('hex') !== c.source.hash
  )
    throw new Error('SEC captured source integrity failure');
  return c;
}
export async function captureSecSubmissions(
  workspace: string,
  cik: string,
  file?: string,
  offline = false,
  fetcher: typeof fetch = fetch,
): Promise<SecCapture> {
  const key = file ? file.replace(/\.json$/, '').toLowerCase() : 'issuer-' + cik;
  const r = await acquireSecFile(
    workspace,
    { url: secSubmissionsUrl(cik, file), key, extension: 'json', cap: 15_000_000 },
    offline,
    fetcher,
  );
  return { key, source: r.source, body: await readFile(r.path, 'utf8') };
}
