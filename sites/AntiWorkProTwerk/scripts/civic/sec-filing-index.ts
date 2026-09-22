import { z } from 'zod';
import { secCik, insiderAccession } from '../../src/lib/civic/insiders';
import { decodeEntities } from '../said-did/sources';
import { validateSecCapture, type SecCapture } from './sec-submissions';

export function secDocumentUrl(cik: string, accession: string, name: string) {
  secCik.parse(cik);
  insiderAccession.parse(accession);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) || name.includes('..'))
    throw new Error('Invalid SEC document filename');
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll('-', '')}/${name}`;
}
export function secDirectory(cik: string, accession: string, capture: SecCapture) {
  validateSecCapture(capture, secDocumentUrl(cik, accession, 'index.json'));
  const value = z
    .object({
      directory: z.object({
        name: z.string(),
        item: z.array(z.object({ name: z.string(), size: z.string(), type: z.string() })),
      }),
    })
    .parse(JSON.parse(capture.body));
  const expected = new URL(secDocumentUrl(cik, accession, 'index.json')).pathname.replace(
    '/index.json',
    '',
  );
  if (
    value.directory.name !== expected ||
    new Set(value.directory.item.map((i) => i.name)).size !== value.directory.item.length
  )
    throw new Error('SEC directory identity or duplicate file mismatch');
  for (const i of value.directory.item) secDocumentUrl(cik, accession, i.name);
  const index = value.directory.item.filter(
    (i) => i.name === `${accession}-index.html` || i.name === `${accession}-index.htm`,
  );
  if (index.length !== 1) throw new Error('SEC filing index missing or ambiguous');
  return { files: value.directory.item, index: index[0].name };
}
export function secXmlDocuments(
  cik: string,
  accession: string,
  html: string,
  files: { name: string }[],
) {
  const documents: { name: string; role: string }[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map((m) => m[1]);
    if (cells.length !== 5) continue;
    const role = decodeEntities(cells[3].replace(/<[^>]*>/g, '')).trim();
    if (!['N-PX', 'N-PX/A', 'PROXY VOTING RECORD'].includes(role)) continue;
    const links = [...cells[2].matchAll(/href\s*=\s*["']([^"']+)["']/gi)];
    for (const match of links) {
      const url = new URL(decodeEntities(match[1]), secDocumentUrl(cik, accession, 'index.html'));
      if (!url.pathname.endsWith('.xml')) continue;
      const name = url.pathname.split('/').at(-1)!;
      const expected = new URL(secDocumentUrl(cik, accession, name));
      const directory = expected.pathname.slice(0, -name.length),
        relative = url.pathname.slice(directory.length);
      if (
        url.origin !== expected.origin ||
        url.search ||
        url.hash ||
        !url.pathname.startsWith(directory) ||
        !new RegExp(`^(?:xsl[A-Za-z0-9_-]+/)?${name.replaceAll('.', '\\.')}$`).test(relative) ||
        !files.some((f) => f.name === name)
      )
        throw new Error('SEC document link outside verified accession directory');
      const prior = documents.find((d) => d.name === name);
      if (prior && prior.role !== role) throw new Error('Conflicting SEC XML roles');
      // EDGAR lists the stylesheet view and original XML as two links to the same document.
      if (prior) continue;
      documents.push({ name, role });
    }
  }
  if (documents.filter((d) => d.role !== 'PROXY VOTING RECORD').length !== 1)
    throw new Error('Expected one N-PX primary document');
  return documents;
}
