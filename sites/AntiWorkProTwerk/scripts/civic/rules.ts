import { z } from 'zod';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { withLock, writeAtomic } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import {
  ruleId,
  ruleSchema,
  ruleTextSchema,
  rulesDataSchema,
  type RulesData,
  type RuleText,
} from '../../src/lib/civic/rules';

export const rulesPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    term: z.string().min(2).max(120),
    agency: z.string().regex(/^[a-z0-9-]+$/),
    from: z.string().date(),
    through: z.string().date(),
    pageSize: z.number().int().min(1).max(100).default(20),
    maxPages: z.number().int().min(1).max(10).default(2),
    maxTracked: z.number().int().min(1).max(1000).default(200),
  })
  .refine((p) => p.from <= p.through, 'Invalid publication window');
const sourceSchema = z.object({
  url: z.string().url(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  observedAt: z.string().datetime(),
});
export const rulesInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: rulesPlanSchema,
  observedAt: z.string().datetime(),
  totalMatches: z.number().int().nonnegative(),
  truncated: z.boolean(),
  records: z
    .array(
      z.object({
        metadata: z.record(z.string(), z.unknown()),
        xml: z.string().max(12_000_000),
        source: sourceSchema,
        xmlSource: sourceSchema,
      }),
    )
    .max(1000),
});
const metadataSchema = z.object({
  document_number: ruleId,
  title: z.string().min(1),
  type: ruleSchema.shape.type,
  publication_date: z.string().date(),
  action: z.string().nullable().optional(),
  abstract: z.string().nullable().optional(),
  effective_on: z.string().date().nullable(),
  comments_close_on: z.string().date().nullable(),
  dates: z.string().nullable().optional(),
  agencies: z.array(z.object({ id: z.number().int(), name: z.string(), slug: z.string() })),
  topics: z.array(z.string()),
  docket_ids: z.array(z.string()),
  regulation_id_numbers: z.array(z.string()),
  cfr_references: z.array(
    z.object({
      title: z.number().int(),
      part: z.union([z.string(), z.number()]).transform(String),
    }),
  ),
  correction_of: z.unknown().optional(),
  corrections: z.array(z.unknown()).optional(),
  html_url: z.string().url(),
  pdf_url: z.string().url(),
  full_text_xml_url: z.string().url(),
});
function officialUrl(raw: string, kind: 'api' | 'xml' | 'html' | 'pdf', id?: string) {
  const u = new URL(raw);
  const paths = {
    api: /^\/api\/v1\/documents(?:\.json|\/\d{4}-\d{4,6}\.json)$/,
    xml: /^\/documents\/full_text\/xml\/\d{4}\/\d{2}\/\d{2}\/\d{4}-\d{4,6}\.xml$/,
    html: /^\/documents\/\d{4}\/\d{2}\/\d{2}\/\d{4}-\d{4,6}\//,
    pdf: /^\/content\/pkg\/FR-\d{4}-\d{2}-\d{2}\/pdf\/\d{4}-\d{4,6}\.pdf$/,
  };
  if (
    u.protocol !== 'https:' ||
    u.hostname !== (kind === 'pdf' ? 'www.govinfo.gov' : 'www.federalregister.gov') ||
    u.port ||
    u.username ||
    u.password ||
    u.hash ||
    !paths[kind].test(u.pathname)
  )
    throw new Error('Unsafe Federal Register source URL');
  const allowed = [
    'conditions[term]',
    'conditions[agencies][]',
    'conditions[publication_date][gte]',
    'conditions[publication_date][lte]',
    'per_page',
    'page',
    'order',
  ];
  if ([...u.searchParams.keys()].some((k) => kind !== 'api' || !allowed.includes(k)))
    throw new Error('Unexpected source query parameter');
  if (
    id &&
    !u.pathname.includes(
      `/${id}${kind === 'html' ? '/' : kind === 'api' ? '.json' : kind === 'xml' ? '.xml' : '.pdf'}`,
    )
  )
    throw new Error('Source URL does not match document identity');
  return raw;
}

// Preserve mixed-content order. Only text is rendered, never source HTML or scripts.
export function parseRuleText(xml: string, documentId: string): RuleText {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error('Unsafe or invalid Federal Register XML');
  const tree = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: true,
    trimValues: false,
    parseTagValue: false,
    processEntities: true,
  }).parse(xml);
  const roots = tree.filter((n: any) =>
    Object.keys(n).some((k) => ['RULE', 'PRORULE', 'NOTICE', 'PRESDOCU'].includes(k)),
  );
  if (roots.length !== 1) throw new Error('Unsupported Federal Register document root');
  const blocks: RuleText['blocks'] = [];
  const flat = (nodes: any[]): string =>
    nodes
      .map((n) =>
        Object.entries(n)
          .map(([tag, v]) =>
            tag === '#text'
              ? String(v)
              : tag === 'PRTPAGE'
                ? ' '
                : tag === 'STARS'
                  ? ' * * * '
                  : Array.isArray(v)
                    ? flat(v)
                    : '',
          )
          .join(''),
      )
      .join('');
  const walk = (nodes: any[], section: RuleText['blocks'][number]['section'] | null) => {
    for (const node of nodes)
      for (const [tag, value] of Object.entries(node)) {
        if (!Array.isArray(value)) continue;
        const current =
          tag === 'SUM'
            ? 'summary'
            : tag === 'EFFDATE'
              ? 'dates'
              : tag === 'SUPLINF'
                ? 'supplement'
                : tag === 'REGTEXT'
                  ? 'regulatory'
                  : section;
        const kinds: Record<string, RuleText['blocks'][number]['kind']> = {
          P: 'paragraph',
          FP: 'paragraph',
          HD: 'heading',
          SECTNO: 'heading',
          SUBJECT: 'heading',
          AMDPAR: 'amendment',
          GPOTABLE: 'table',
          STARS: 'omission',
        };
        if (current && kinds[tag]) {
          // Table cells are separated explicitly so flattening cannot concatenate numbers.
          const table = (items: any[]): string =>
            items
              .map((n) =>
                Object.entries(n)
                  .map(([t, v]) =>
                    t === '#text'
                      ? String(v)
                      : Array.isArray(v)
                        ? `${table(v)}${['ENT', 'ROW', 'CHED'].includes(t) ? ' | ' : ''}`
                        : '',
                  )
                  .join(''),
              )
              .join('');
          const text = (tag === 'STARS' ? '* * *' : tag === 'GPOTABLE' ? table(value) : flat(value))
            .replace(/\s+/g, ' ')
            .trim();
          if (text)
            blocks.push({
              id: `b${String(blocks.length + 1).padStart(5, '0')}`,
              section: current,
              kind: kinds[tag],
              text,
            });
        } else walk(value, current);
      }
  };
  walk(roots, null);
  if (!blocks.length) throw new Error('Federal Register document has no supported source passages');
  return ruleTextSchema.parse({ formatVersion: 1, documentId, blocks });
}
const correctionId = (value: unknown): string | null => {
  if (value == null) return null;
  const candidate = typeof value === 'string' ? value : (value as any).document_number;
  return ruleId.parse(candidate);
};
const comparable = (d: RulesData['documents'][number]) =>
  Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'source'));
export function buildRules(inputValue: unknown, previous: RulesData | null = null) {
  const input = rulesInputSchema.parse(inputValue),
    p = input.plan;
  if (input.records.length > p.maxTracked) throw new Error('Collection exceeds maxTracked');
  if (
    previous &&
    (previous.collectionId !== p.id ||
      previous.term !== p.term ||
      previous.agency !== p.agency ||
      previous.from !== p.from)
  )
    throw new Error('Different collection; use an isolated output directory');
  if (previous && (input.observedAt < previous.observedAt || p.through < previous.through))
    throw new Error('Stale collection observation or shortened window');
  const ids = new Set<string>(),
    texts = new Map<string, RuleText>(),
    events = [...(previous?.events ?? [])];
  const documents = input.records
    .map((r) => {
      const m = metadataSchema.parse(r.metadata),
        id = m.document_number;
      const old = previous?.documents.find((d) => d.id === id);
      if (
        !old &&
        (m.publication_date < p.from ||
          m.publication_date > p.through ||
          !m.agencies.some((a) => a.slug === p.agency))
      )
        throw new Error('New document is outside the configured agency or publication window');
      if (ids.has(id)) throw new Error('Duplicate document identity');
      ids.add(id);
      if (hash(r.metadata) !== r.source.hash || hash(r.xml) !== r.xmlSource.hash)
        throw new Error('Source checksum mismatch');
      officialUrl(r.source.url, 'api', id);
      officialUrl(r.xmlSource.url, 'xml', id);
      if (r.xmlSource.url !== m.full_text_xml_url)
        throw new Error('XML source differs from registry metadata');
      if (
        r.source.observedAt > input.observedAt ||
        r.xmlSource.observedAt > input.observedAt ||
        m.publication_date > input.observedAt.slice(0, 10)
      )
        throw new Error('Invalid source chronology');
      const text = parseRuleText(r.xml, id),
        textHash = hash(text);
      texts.set(textHash, text);
      const document = ruleSchema.parse({
        id,
        title: m.title,
        type: m.type,
        action: m.action ?? '',
        abstract: m.abstract ?? '',
        publicationDate: m.publication_date,
        effectiveOn: m.effective_on,
        commentsCloseOn: m.comments_close_on,
        dates: m.dates ?? '',
        agencies: m.agencies,
        topics: m.topics,
        docketIds: m.docket_ids,
        rins: m.regulation_id_numbers,
        cfr: m.cfr_references,
        correctionOf: correctionId(m.correction_of),
        corrections: (m.corrections ?? []).map(correctionId).filter(Boolean),
        htmlUrl: officialUrl(m.html_url, 'html', id),
        pdfUrl: officialUrl(m.pdf_url, 'pdf', id),
        xmlUrl: officialUrl(m.full_text_xml_url, 'xml', id),
        source: {
          ...r.source,
          observedAt: [r.source.observedAt, r.xmlSource.observedAt].sort().at(-1),
          xmlHash: r.xmlSource.hash,
        },
        textHash,
        blockCount: text.blocks.length,
        amendmentCount: text.blocks.filter((b) => b.kind === 'amendment').length,
      });
      if (old && document.source.observedAt < old.source.observedAt)
        throw new Error('Stale document observation');
      const current = comparable(document),
        before = old ? comparable(old) : null;
      const changedFields = before
        ? Object.keys(current).filter((k) => hash(current[k]) !== hash(before[k]))
        : [];
      if (
        old &&
        document.source.observedAt === old.source.observedAt &&
        (changedFields.length ||
          old.source.hash !== document.source.hash ||
          old.source.xmlHash !== document.source.xmlHash)
      )
        throw new Error('Conflicting observation');
      // A newer XML fetch must not conceal changed metadata from an older observation, or vice versa.
      if (
        old &&
        ((r.source.hash !== old.source.hash && r.source.observedAt <= old.source.observedAt) ||
          (r.xmlSource.hash !== old.source.xmlHash &&
            r.xmlSource.observedAt <= old.source.observedAt))
      )
        throw new Error('Stale changed source asset; refresh both metadata and XML');
      if (previous && (!old || changedFields.length))
        events.push({
          documentId: id,
          kind: old ? 'record_updated' : 'document_added',
          observedAt: document.source.observedAt,
          previousObservedAt: old?.source.observedAt ?? null,
          previousTextHash: old?.textHash ?? null,
          textHash,
          changedFields,
        });
      return document;
    })
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate) || a.id.localeCompare(b.id));
  if (previous?.documents.some((d) => !ids.has(d.id)))
    throw new Error('Tracked document missing; absence is not withdrawal');
  const data = rulesDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'quiet-rulebook-v1',
    collectionId: p.id,
    term: p.term,
    agency: p.agency,
    from: p.from,
    through: p.through,
    observedAt: input.observedAt,
    trackingStartedAt: previous?.trackingStartedAt ?? input.observedAt,
    totalMatches: input.totalMatches,
    truncated: input.truncated,
    documents,
    events,
  });
  return { data, texts };
}
async function request(
  url: string,
  kind: 'api' | 'xml',
  workspace: string,
  fetcher: typeof fetch,
): Promise<{ raw: string; observedAt: string }> {
  officialUrl(url, kind);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: kind === 'api' ? 'application/json' : 'application/xml' },
      });
    } catch (e) {
      if (attempt === 2) throw e;
    }
    if (response?.ok) break;
    if (response && response.status !== 429 && response.status < 500)
      throw new Error(`Federal Register HTTP ${response.status}`);
    if (attempt === 2)
      throw new Error(`Federal Register unavailable (${response?.status ?? 'network'})`);
    await response?.body?.cancel();
    response = undefined;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response?.body) throw new Error('Empty source response');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 12_000_000) {
      await reader.cancel();
      throw new Error('Source exceeds 12 MB limit');
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString('utf8'),
    observedAt = new Date().toISOString();
  await writeAtomic(join(workspace, 'raw', `${hash(raw)}.json`), { url, observedAt, raw });
  return { raw, observedAt };
}
export async function collectRules(
  planValue: unknown,
  previous: RulesData | null,
  workspace: string,
  fetcher: typeof fetch = fetch,
) {
  const plan = rulesPlanSchema.parse(planValue),
    ids = new Set<string>();
  let totalMatches = 0,
    truncated = false;
  for (let page = 1; page <= plan.maxPages; page++) {
    const url = new URL('https://www.federalregister.gov/api/v1/documents.json');
    url.search = new URLSearchParams({
      'conditions[term]': plan.term,
      'conditions[agencies][]': plan.agency,
      'conditions[publication_date][gte]': plan.from,
      'conditions[publication_date][lte]': plan.through,
      per_page: String(plan.pageSize),
      page: String(page),
      order: 'newest',
    }).toString();
    const result = z
      .object({
        count: z.number().int().nonnegative(),
        total_pages: z.number().int().nonnegative(),
        results: z.array(z.object({ document_number: ruleId })),
      })
      .parse(JSON.parse((await request(url.href, 'api', workspace, fetcher)).raw));
    if (page === 1) totalMatches = result.count;
    else if (result.count !== totalMatches)
      throw new Error('Discovery changed during pagination; rerun');
    for (const doc of result.results) {
      if (ids.has(doc.document_number)) throw new Error('Duplicate discovery document');
      ids.add(doc.document_number);
    }
    truncated = page < result.total_pages;
    if (!truncated) break;
    if (!result.results.length) throw new Error('Unexpected empty discovery page');
  }
  for (const doc of previous?.documents ?? []) ids.add(doc.id);
  if (ids.size > plan.maxTracked)
    throw new Error('Collection exceeds maxTracked; increase the explicit bound');
  const records: z.infer<typeof rulesInputSchema>['records'] = [];
  // Sequential requests deliberately keep this public API job polite and bounded.
  for (const id of ids) {
    const url = `https://www.federalregister.gov/api/v1/documents/${id}.json`,
      raw = await request(url, 'api', workspace, fetcher),
      metadata = JSON.parse(raw.raw);
    if (metadata.document_number !== id) throw new Error('Requested document identity mismatch');
    const xmlUrl = officialUrl(metadata.full_text_xml_url, 'xml', id),
      xml = await request(xmlUrl, 'xml', workspace, fetcher);
    records.push({
      metadata,
      xml: xml.raw,
      source: { url, observedAt: raw.observedAt, hash: hash(metadata) },
      xmlSource: { url: xmlUrl, observedAt: xml.observedAt, hash: hash(xml.raw) },
    });
  }
  const input = rulesInputSchema.parse({
    formatVersion: 1,
    plan,
    observedAt: new Date().toISOString(),
    totalMatches,
    truncated,
    records,
  });
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}
export async function readRulesPublication(output: string) {
  let manifest: any;
  try {
    manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  if (!/^rr-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid rule release');
  const raw = JSON.parse(
    await readFile(join(output, 'releases', manifest.release, 'data.json'), 'utf8'),
  );
  if (hash(raw) !== manifest.dataHash || manifest.release !== `rr-${hash(raw).slice(0, 24)}`)
    throw new Error('Rule release checksum mismatch');
  return { manifest, data: rulesDataSchema.parse(raw) };
}
export async function runRules(options: {
  plan?: unknown;
  input?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    const previous = await readRulesPublication(options.output);
    const input =
      options.input ??
      (options.offline
        ? JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'))
        : await collectRules(
            options.plan,
            previous?.data ?? null,
            options.workspace,
            options.fetcher,
          ));
    if (
      options.offline &&
      options.plan &&
      hash(rulesPlanSchema.parse(options.plan)) !== hash(rulesInputSchema.parse(input).plan)
    )
      throw new Error('Offline archive belongs to a different plan');
    const { data, texts } = buildRules(input, previous?.data ?? null);
    await mkdir(join(options.output, 'texts'), { recursive: true });
    for (const [checksum, text] of texts) {
      const file = join(options.output, 'texts', `${checksum}.json`),
        payload = JSON.stringify(text);
      try {
        await writeFile(file, payload, { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        if ((await readFile(file, 'utf8')) !== payload)
          throw new Error('Immutable rule text mismatch');
      }
    }
    // Retain and verify historical text dependencies before advancing the pointer.
    const dependencies = new Set(
      data.events.flatMap((e) => [e.textHash, ...(e.previousTextHash ? [e.previousTextHash] : [])]),
    );
    for (const checksum of dependencies) {
      const raw = JSON.parse(
        await readFile(join(options.output, 'texts', `${checksum}.json`), 'utf8'),
      );
      if (hash(raw) !== checksum) throw new Error('Historical rule text missing or corrupt');
      ruleTextSchema.parse(raw);
    }
    const manifest = await publishSnapshot(
      data,
      options.output,
      'rr',
      previous?.manifest.release ?? null,
    );
    return {
      manifest,
      counts: {
        documents: data.documents.length,
        events: data.events.length,
        passages: [...texts.values()].reduce((n, t) => n + t.blocks.length, 0),
      },
    };
  });
}
