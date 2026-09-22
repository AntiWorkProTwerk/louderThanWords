import { secCik, insiderQuarter } from '../../src/lib/civic/insiders';
import { acquireSecFile } from './sec-source';
export function insiderArchiveUrl(quarter: string, url: string) {
  insiderQuarter.parse(quarter);
  const parsed = new URL(url);
  if (
    !['https://www.sec.gov', 'https://dcm.sec.gov'].includes(parsed.origin) ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    !new RegExp(
      `^/files/(?:structureddata|datastandardsinnovation)/data/insider-transactions-data-sets/${quarter}_form345\\.zip$`,
    ).test(parsed.pathname)
  )
    throw new Error('Insider archive must be the exact official SEC quarter URL');
  return url;
}
export const insiderIssuerUrl = (cik: string) =>
  `https://data.sec.gov/submissions/CIK${secCik.parse(cik)}.json`;
export async function acquireInsiderFile(
  workspace: string,
  request: { quarter: string; url: string } | { cik: string },
  offline = false,
  fetcher: typeof fetch = fetch,
) {
  const archive = 'quarter' in request;
  return acquireSecFile(
    workspace,
    {
      url: archive
        ? insiderArchiveUrl(request.quarter, request.url)
        : insiderIssuerUrl(request.cik),
      key: archive ? request.quarter : 'issuer-' + request.cik,
      extension: archive ? 'zip' : 'json',
      cap: archive ? 100_000_000 : 15_000_000,
    },
    offline,
    fetcher,
  );
}
