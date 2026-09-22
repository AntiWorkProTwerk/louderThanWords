import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import {
  corpusSchema,
  personSchema,
  type Corpus,
  type Source,
  type Action,
} from '../../src/lib/said-did/schema.ts';
import { hash, normalizeText, validateCorpus } from './engine.ts';
import { defaultWorkspace, readJson, withLock, writeAtomic } from './pipeline.ts';

export const SOURCE_PARSER_VERSION = 'official-documents-v2';
export const acquisitionSchema = z.object({
  scope: corpusSchema.shape.scope,
  houseRoster: z.enum(['supplied', 'roll_call']).default('supplied'),
  identities: z.array(
    personSchema.extend({
      aliases: z.array(z.string()).min(1),
      lisId: z.string().optional(),
      evidenceUrl: z.string().url(),
    }),
  ),
  documents: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,100}$/),
        kind: z.enum(['house_vote', 'senate_vote', 'record', 'bill']),
        url: z.string().url(),
        localFile: z.string().optional(),
        congress: z.number().int().positive(),
        chamber: z.enum(['House', 'Senate']),
        date: z.string().date().optional(),
        policy: z.string().optional(),
        policyDefinition: z.string().optional(),
        contextMeasureId: z.string().optional(),
        contextEvidence: z.string().optional(),
        provisionElementId: z.string().optional(),
      }),
    )
    .min(1)
    .max(100),
  operativeBindings: z
    .array(
      z.object({
        documentId: z.string(),
        measureId: z.string(),
        versionId: z.string(),
        evidence: z.string().min(10),
        evidenceSourceId: z.string(),
        status: z.enum(['established', 'changed']),
        basis: z.enum(['supplied', 'engrossed_house_passage']).default('supplied'),
      }),
    )
    .default([]),
});
export type Acquisition = z.infer<typeof acquisitionSchema>;
type Document = Acquisition['documents'][number];
type Identity = Acquisition['identities'][number];
type Issue = { id: string; reason: string };
const array = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const value = (node: any): string =>
  typeof node === 'object' && node !== null ? String(node['#text'] ?? '') : String(node ?? '');

export function officialUrl(input: string) {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !['www.govinfo.gov', 'clerk.house.gov', 'www.senate.gov'].includes(url.hostname)
  )
    throw new Error(
      'Source URL must be an HTTPS document on govinfo.gov, clerk.house.gov or senate.gov without credentials, query or fragment.',
    );
  return url;
}
export function decodeEntities(text: string) {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (whole, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : '\ufffd';
      }
      return (
        ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[
          entity.toLowerCase()
        ] ?? whole
      );
    },
  );
}
export function parseXml(raw: string) {
  if (raw.length > 2_000_000 || /<!ENTITY|<!DOCTYPE[^>]*\[/i.test(raw))
    throw new Error('Oversized XML or entity declarations are not accepted.');
  const clean = raw.replace(/<!DOCTYPE[^>]*>/gi, ''); // No DTD loading or external entities.
  const valid = XMLValidator.validate(clean);
  if (valid !== true) throw new Error(`Malformed source XML: ${valid.err.msg}`);
  return new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    processEntities: false,
  }).parse(clean);
}
export function measureReference(raw: string, congress: number) {
  const match = raw
    .trim()
    .match(
      /^(H\s*\.?\s*J\s*\.?\s*RES\.?|S\s*\.?\s*J\s*\.?\s*RES\.?|H\s*\.?\s*RES\.?|S\s*\.?\s*RES\.?|H\s*\.?\s*R\.?|S\.?|H\s*\.?\s*AMDT\.?|S\s*\.?\s*AMDT\.?)\s*(\d+)$/i,
    );
  if (!match) return null;
  const type = match[1].replace(/[.\s]/g, '').toLowerCase() as Corpus['measures'][number]['type'];
  return {
    id: `${congress}-${type}-${Number(match[2])}`,
    congress,
    type,
    number: Number(match[2]),
  };
}
export function actionKind(question: string): Action['kind'] | null {
  if (
    /previous question|cloture|motion to proceed|recommit|adjourn|recess|journal|consideration|appeal|waive/i.test(
      question,
    )
  )
    return 'procedure';
  if (/motion to table/i.test(question)) return 'table';
  if (/suspend.*rules.*pass/i.test(question)) return 'combined_passage';
  if (/amendment/i.test(question)) return 'amendment';
  if (/passage|on passing|on agreeing|on adoption/i.test(question)) return 'passage';
  return null;
}
export function officialDate(text: string) {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return z.string().date().parse(iso[0]);
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  const a = text.match(/\b(\d{1,2})-([A-Za-z]+)-(\d{4})\b/),
    b = text.match(/\b([A-Za-z]+) (\d{1,2}), (\d{4})\b/);
  if (!a && !b) throw new Error(`Unrecognized official date: ${text}`);
  const month = months.indexOf((a ? a[2] : b![1]).slice(0, 3).toLowerCase()) + 1;
  return z
    .string()
    .date()
    .parse(
      `${a ? a[3] : b![3]}-${String(month).padStart(2, '0')}-${(a ? a[1] : b![2]).padStart(2, '0')}`,
    );
}
export function easternTimestamp(date: string, clock: string): string | null {
  const match = clock.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  if (hour > 23 || minute > 59) throw new Error('Invalid official vote clock.');
  const offsetAt = (time: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
      .formatToParts(new Date(`${date}T${time}Z`))
      .find((p) => p.type === 'timeZoneName')!.value;
  // Abstain on a transition day's repeated/nonexistent early-morning clock.
  if (hour < 3 && offsetAt('00:00:00') !== offsetAt('23:00:00')) return null;
  const offset = offsetAt('12:00:00').match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!offset) return null;
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset[1]}${offset[2].padStart(2, '0')}:${offset[3] ?? '00'}`;
}
function source(
  document: Document,
  text: string,
  date: string,
  rawHash: string,
  fetchedAt: string,
  title = document.id,
): Source {
  return {
    id: document.id,
    provider: new URL(document.url).hostname,
    externalId: document.url.split('/').at(-1)!,
    title,
    url: document.url,
    kind: 'official',
    text,
    date,
    publishedAt: `${date}T00:00:00Z`,
    fetchedAt,
    modifiedAt: `${date}T00:00:00Z`,
    page: '',
    publicationRights: 'public_record',
    provenance: {
      rawHash,
      parserVersion: SOURCE_PARSER_VERSION,
      publicationTimePrecision: 'date',
      modifiedTimePrecision: 'unknown',
    },
  };
}

// A bounded collector: retries transient failures only, validates every redirect,
// archives exact bytes and metadata, and reuses prior downloads when offline.
export async function fetchOfficial(
  urlString: string,
  workspace: string,
  options: { offline?: boolean; fetcher?: typeof fetch } = {},
) {
  officialUrl(urlString);
  const reference = join(workspace, 'acquisition', 'urls', `${hash(urlString)}.json`);
  let prior: any;
  try {
    prior = await readJson(reference);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (options.offline) {
    if (!prior) throw new Error(`No cached source: ${urlString}`);
    const archived = await readJson(join(workspace, 'acquisition', 'raw', `${prior.rawHash}.json`));
    const bytes = Buffer.from(archived.base64, 'base64');
    if (hash(bytes.toString('base64')) !== prior.rawHash)
      throw new Error('Raw archive hash mismatch.');
    return { ...prior, raw: bytes.toString('utf8') };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let url = urlString;
    try {
      for (let hop = 0; hop < 4; hop++) {
        officialUrl(url);
        const response = await (options.fetcher ?? fetch)(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(30_000),
          headers: {
            'User-Agent': 'LouderThanWords-local-research/1.0',
            ...(prior?.etag && url === urlString ? { 'If-None-Match': prior.etag } : {}),
          },
        });
        if (response.status === 304 && prior)
          return fetchOfficial(urlString, workspace, { ...options, offline: true });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          url = new URL(response.headers.get('location') ?? '', url).href;
          continue;
        }
        if ([429, 500, 502, 503, 504].includes(response.status))
          throw new Error(`Transient HTTP ${response.status}`);
        if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${url}`);
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (!response.body) throw new Error('Empty source response.');
        const reader = response.body.getReader();
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > 2_000_000)
              throw new Error(
                'Source exceeds 2 MB. Supply individual granules, not an entire daily PDF.',
              );
            chunks.push(part.value);
          }
        } finally {
          await reader.cancel();
        }
        const bytes = Buffer.concat(chunks),
          raw = bytes.toString('utf8');
        if (/Page Not Found|page you requested cannot be found|<title>Access Denied/i.test(raw))
          throw new Error('Provider returned an error page instead of a document.');
        const rawHash = hash(bytes.toString('base64'));
        const receipt = {
          url: urlString,
          finalUrl: url,
          rawHash,
          fetchedAt: new Date().toISOString(),
          etag: response.headers.get('etag'),
          lastModified: response.headers.get('last-modified'),
          contentType: response.headers.get('content-type'),
          bytes: size,
        };
        await writeAtomic(join(workspace, 'acquisition', 'raw', `${rawHash}.json`), {
          base64: bytes.toString('base64'),
          encoding: 'utf8',
        });
        await writeAtomic(reference, receipt);
        return { ...receipt, raw };
      }
      throw new Error('Too many source redirects.');
    } catch (e) {
      if (attempt === 2 || !/Transient|timeout|fetch failed/i.test(String(e))) throw e;
      await new Promise((done) => setTimeout(done, (attempt + 1) * 1000));
    }
  }
  throw new Error('Source acquisition failed.');
}

export function recordText(raw: string) {
  if (!/<html\b/i.test(raw)) return normalizeText(raw).text;
  const pre = raw.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i);
  if (!pre || !/Congressional Record/i.test(pre[1]))
    throw new Error(
      'Expected a GovInfo Congressional Record text granule. PDFs and arbitrary HTML are not silently parsed.',
    );
  return normalizeText(decodeEntities(pre[1].replace(/<[^>]+>/g, ''))).text;
}
export function parseRecord(
  document: Document,
  raw: string,
  identities: Identity[],
  fetchedAt: string,
  rawHash: string,
) {
  const text = recordText(raw),
    date = officialDate(document.date ?? document.url);
  if (
    !text.includes(`[${document.chamber}]`) &&
    !(document.chamber === 'House' && /\[Extensions of Remarks\]/i.test(text))
  )
    throw new Error('Record chamber does not match collection configuration.');
  const src = source(
    document,
    text,
    date,
    rawHash,
    fetchedAt,
    text.match(/^\[Congressional Record[^\n]+/m)?.[0] ?? document.id,
  );
  src.page = text.match(/\[Pages? ([^\]]+)\]/)?.[1] ?? '';
  // Only margin-level speaker labels. Indented quotations cannot become speakers.
  // Officer/clerk turns are also boundaries, but never attributed to an individual.
  const markers = [
    ...text.matchAll(
      /^ {0,2}(?:(Mr\.|Mrs\.|Ms\.|Miss) ([A-Z][A-Za-zÀ-ž'’ -]*?(?: of [A-Za-z ]+)?)[.]|The (?:SPEAKER[^\n]*?|PRESIDING OFFICER|ACTING PRESIDENT pro tempore|PRESIDENT pro tempore|VICE PRESIDENT)[.]|The (?:(?:legislative|assistant legislative|bill|reading) )?[Cc]lerk\b[^\n]*)[ \t]*/gm,
    ),
  ];
  const passages: Corpus['passages'] = [],
    issues: Issue[] = [];
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    if (!marker[2]) continue;
    const start = marker.index! + marker[0].length,
      end = markers[i + 1]?.index ?? text.length;
    if (!text.slice(start, end).trim()) continue;
    const matches = identities.filter(
      (person) =>
        person.aliases.some((alias) => norm(alias) === norm(marker[2])) &&
        person.terms.some(
          (term) => term.chamber === document.chamber && term.from <= date && term.to >= date,
        ),
    );
    const id = `${document.id}-turn-${i + 1}`;
    const inserted =
      /\[Extensions of Remarks\]/i.test(text) ||
      /(?:include|insert|submit).{0,80}(?:record|remarks)|remarks.*(?:revis|extend)/i.test(
        text.slice(start, end),
      );
    if (matches.length !== 1)
      issues.push({
        id,
        reason: `Speaker ${marker[2]} has ${matches.length} dated roster matches; attribution held.`,
      });
    const contextEvidence = document.contextEvidence ?? '';
    if (document.contextMeasureId && (!contextEvidence || !text.includes(contextEvidence)))
      throw new Error('Debate context must quote exact source text.');
    passages.push({
      id,
      sourceId: src.id,
      personId: matches.length === 1 ? matches[0].id : null,
      identityEvidence:
        matches.length === 1
          ? `Exact unique dated roster alias “${marker[2]}”; ${matches[0].evidenceUrl}`
          : `Unresolved label: ${marker[2]}`,
      attribution: matches.length === 1 ? 'verified' : 'ambiguous',
      start,
      end,
      kind: inserted ? 'inserted_statement' : 'recorded_statement',
      eventDate: date,
      eventTime: null,
      mediaUrl: null,
      context:
        'Parsed from the Congressional Record, not verified spoken audio. Whole marker-bounded turn retained; quoted material and inserts require review.',
      contextMeasureId: document.contextMeasureId ?? null,
      contextEvidence,
    });
  }
  if (!passages.length)
    issues.push({
      id: document.id,
      reason: 'No supported speaker boundaries found; document retained for parser review.',
    });
  return { source: src, passages, issues };
}

export function parseBill(document: Document, raw: string, fetchedAt: string, rawHash: string) {
  const xml = parseXml(raw),
    root = xml.bill ?? xml.resolution ?? xml['amendment-doc'];
  if (!root?.form) throw new Error('Expected House legislative XML with a form element.');
  const ref = measureReference(decodeEntities(value(root.form['legis-num'])), document.congress);
  if (!ref || Number(value(root.form.congress).match(/\d+/)?.[0]) !== document.congress)
    throw new Error('Bill identity/Congress mismatch.');
  const date = officialDate(document.date ?? value(root.metadata?.dublinCore?.['dc:date']));
  const text = normalizeText(
    decodeEntities(raw.replace(/<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/g, '').replace(/<[^>]+>/g, '')),
  ).text;
  const src = source(
    document,
    text,
    date,
    rawHash,
    fetchedAt,
    decodeEntities(value(root.metadata?.dublinCore?.['dc:title'])) || ref.id,
  );
  let provision = text;
  if (document.provisionElementId) {
    // Preserve order and original mixed-content text; select the exact XML subtree.
    const escaped = document.provisionElementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = raw.match(
      new RegExp(`<([\\w:-]+)\\b[^>]*\\bid=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/\\1>`),
    );
    if (!match) throw new Error('Requested bill provision element was not found.');
    provision = decodeEntities(match[2].replace(/<[^>]+>/g, ''));
    if (!text.includes(provision)) throw new Error('Bill provision is not an exact source span.');
  }
  const measure: Corpus['measures'][number] = {
    ...ref,
    title: src.title,
    policy: document.policy ?? 'Unclassified',
    policyDefinition:
      document.policyDefinition ?? 'Not classified; no policy-equivalence inference is allowed.',
    parentId: null,
    versions: [{ id: document.id, issued: date, sourceId: src.id, provision }],
  };
  const attestation = root.attestation?.['attestation-group']?.['attestation-date'];
  const certification =
    root['@_bill-stage'] === 'Engrossed-in-House' && attestation?.['@_chamber'] === 'House'
      ? { date: officialDate(value(attestation)), text: decodeEntities(value(attestation)) }
      : null;
  return { source: src, measure, certification };
}

// A roll-call row is evidence of representation on that date only, not a whole term.
// These aliases are NEVER used to attribute Congressional Record speakers.
export function houseRollCallRoster(raw: string, document: Document, existing: Corpus['people']) {
  const root = parseXml(raw)['rollcall-vote'];
  if (
    !root ||
    document.kind !== 'house_vote' ||
    document.chamber !== 'House' ||
    Number(value(root['vote-metadata']?.congress)) !== document.congress
  )
    throw new Error('House roster document identity mismatch.');
  const date = officialDate(value(root['vote-metadata']['action-date']));
  const rows = array<any>(root['vote-data']?.['recorded-vote']);
  const totals = root['vote-metadata']['vote-totals']?.['totals-by-vote'];
  if (!rows.length || !totals)
    throw new Error('Full House roster requires rows and official totals.');
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const identities = rows.map((row) => {
    const l = row.legislator,
      bioguideId = String(l?.['@_name-id'] ?? '');
    if (!/^[A-Z][0-9]{6}$/.test(bioguideId) || seen.has(bioguideId))
      throw new Error('Invalid or duplicate House roster identity.');
    seen.add(bioguideId);
    const choice = decodeEntities(value(row.vote));
    if (!['Yea', 'Nay', 'Present', 'Not Voting'].includes(choice))
      throw new Error('Unknown House roster vote choice.');
    counts.set(choice, (counts.get(choice) ?? 0) + 1);
    const matches = existing.filter((p) => p.bioguideId === bioguideId);
    if (matches.length > 1) throw new Error('Ambiguous existing Bioguide identity.');
    const prior = matches[0];
    const term = {
      state: value(l['@_state']),
      party: value(l['@_party']),
      district: '',
      chamber: 'House' as const,
      from: date,
      to: date,
    };
    const overlapping =
      prior?.terms.filter((t) => t.chamber === 'House' && t.from <= date && t.to >= date) ?? [];
    if (
      overlapping.length > 1 ||
      overlapping.some((t) => t.state !== term.state || t.party !== term.party)
    )
      throw new Error('House roster conflicts with supplied dated identity.');
    const person = personSchema.parse({
      id: prior?.id ?? bioguideId.toLowerCase(),
      bioguideId,
      name: prior?.name ?? decodeEntities(value(l)),
      fictional: false,
      terms: overlapping.length ? prior!.terms : [...(prior?.terms ?? []), term],
    });
    return { ...person, aliases: [decodeEntities(value(l))], evidenceUrl: document.url };
  });
  for (const [choice, key] of [
    ['Yea', 'yea-total'],
    ['Nay', 'nay-total'],
    ['Present', 'present-total'],
    ['Not Voting', 'not-voting-total'],
  ]) {
    const rawTotal = value(totals[key]);
    if (!/^\d+$/.test(rawTotal) || Number(rawTotal) !== (counts.get(choice) ?? 0))
      throw new Error(`House roster total mismatch: ${choice}`);
  }
  return identities;
}

export function parseVote(
  document: Document,
  raw: string,
  identities: Identity[],
  fetchedAt: string,
  rawHash: string,
) {
  const xml = parseXml(raw),
    house = document.kind === 'house_vote';
  const root = house ? xml['rollcall-vote'] : xml.roll_call_vote;
  if (!root || document.chamber !== (house ? 'House' : 'Senate'))
    throw new Error('Vote format/chamber mismatch.');
  const meta = house ? root['vote-metadata'] : root;
  const congress = Number(value(meta.congress)),
    session = parseInt(value(meta.session)),
    roll = Number(value(house ? meta['rollcall-num'] : meta.vote_number));
  if (congress !== document.congress) throw new Error('Vote Congress mismatch.');
  const question = decodeEntities(value(house ? meta['vote-question'] : meta.vote_question_text));
  const date = officialDate(value(house ? meta['action-date'] : meta.vote_date));
  const rawTime = value(
    house ? (meta['action-time']?.['@_time-etz'] ?? meta['action-time']) : meta.vote_date,
  );
  const time = easternTimestamp(date, rawTime);
  const result = decodeEntities(value(house ? meta['vote-result'] : meta.vote_result_text));
  const ref = measureReference(
    value(house ? meta['legis-num'] : meta.document?.document_name),
    congress,
  );
  const kind = actionKind(question),
    issues: Issue[] = [],
    actions: Action[] = [],
    sources: Source[] = [];
  if (
    !ref ||
    !kind ||
    (kind === 'amendment' && !['hamdt', 'samdt'].includes(ref.type)) ||
    (!house && value(root.amendment?.amendment_number))
  ) {
    return {
      sources,
      actions,
      issues: [
        {
          id: document.id,
          reason:
            'Unresolved action target/type (including amendment target); preserved raw source requires explicit review.',
        },
      ],
    };
  }
  const members = array<any>(house ? root['vote-data']?.['recorded-vote'] : root.members?.member);
  if (!members.length) throw new Error('Vote has no individual member records.');
  for (const member of members) {
    const legislator = house ? member.legislator : member;
    const matches = identities.filter((p) =>
      house ? p.bioguideId === legislator['@_name-id'] : p.lisId === value(member.lis_member_id),
    );
    if (matches.length !== 1) {
      issues.push({
        id: `${document.id}-${house ? legislator['@_name-id'] : value(member.lis_member_id)}`,
        reason:
          'Individual outside supplied identity scope or unresolved Senate LIS/Bioguide crosswalk.',
      });
      continue;
    }
    const person = matches[0],
      rawVote = decodeEntities(value(house ? member.vote : member.vote_cast));
    const vote = (
      {
        Yea: 'Yea',
        Aye: 'Yea',
        Nay: 'Nay',
        No: 'Nay',
        Present: 'Present',
        'Not Voting': 'Not Voting',
      } as const
    )[rawVote as 'Yea'];
    if (!vote) throw new Error(`Unrecognized individual vote: ${rawVote}`);
    const state = value(house ? legislator['@_state'] : member.state),
      party = value(house ? legislator['@_party'] : member.party);
    if (
      !person.terms.some(
        (t) =>
          t.chamber === document.chamber &&
          t.state === state &&
          t.party === party &&
          t.from <= date &&
          t.to >= date,
      )
    )
      throw new Error('Supplied identity term disagrees with the official member vote.');
    const id = `${document.id}-${person.id}`;
    const text = `Congress: ${congress}\nChamber: ${document.chamber}\nSession: ${session}\nRoll: ${roll}\nDate: ${date}\nRaw official time: ${rawTime}\nEastern timestamp: ${time ?? 'unresolved'}\nMeasure: ${ref.id}\nQuestion: ${question}\nResult: ${result}\nMember: ${person.name}\nBioguide: ${person.bioguideId}\nState: ${state}\nParty: ${party}\nVote: ${rawVote}\n`;
    sources.push(
      source(
        { ...document, id },
        text,
        date,
        rawHash,
        fetchedAt,
        `${document.chamber} roll ${roll}: ${person.name}`,
      ),
    );
    actions.push({
      id,
      personId: person.id,
      measureId: ref.id,
      versionId: null,
      sourceId: id,
      congress,
      chamber: document.chamber,
      session,
      roll,
      date,
      time,
      kind,
      question,
      result,
      rawVote,
      vote,
      operativeText: 'unresolved',
      conditionsMet: 'unknown',
      context:
        'Individual vote parsed from official XML. Exact question retained. Operative version and conditions require source-backed review; no latest-version assumption.',
    });
  }
  return { sources, actions, issues };
}

export async function collectSources(
  input: unknown,
  options: {
    workspace?: string;
    inputDirectory?: string;
    offline?: boolean;
    fetcher?: typeof fetch;
  } = {},
) {
  const plan = acquisitionSchema.parse(input),
    workspace = options.workspace ?? defaultWorkspace;
  if (plan.scope.mode !== 'real')
    throw new Error('Official-source collection requires real corpus mode.');
  if (new Set(plan.documents.map((d) => d.id)).size !== plan.documents.length)
    throw new Error('Duplicate acquisition document IDs.');
  for (const person of plan.identities) officialUrl(person.evidenceUrl);
  return withLock(join(workspace, 'acquisition'), async () => {
    const corpus: Corpus = {
      formatVersion: 1,
      scope: plan.scope,
      people: plan.identities.map((p) => personSchema.parse(p)),
      sources: [],
      measures: [],
      passages: [],
      actions: [],
    };
    const issues: Issue[] = [],
      receipts: any[] = [];
    const certifications = new Map<string, { date: string; text: string }>();
    for (const document of [...plan.documents].sort(
      (a, b) => Number(b.kind === 'bill') - Number(a.kind === 'bill'),
    )) {
      officialUrl(document.url);
      let raw: string, rawHash: string, fetchedAt: string;
      if (document.localFile) {
        const bytes = await readFile(resolve(options.inputDirectory ?? '.', document.localFile));
        if (bytes.length > 2_000_000) throw new Error('Local document exceeds 2 MB.');
        raw = bytes.toString('utf8');
        rawHash = hash(bytes.toString('base64'));
        fetchedAt = new Date().toISOString();
        await writeAtomic(join(workspace, 'acquisition', 'raw', `${rawHash}.json`), {
          base64: bytes.toString('base64'),
          encoding: 'utf8',
        });
      } else ({ raw, rawHash, fetchedAt } = await fetchOfficial(document.url, workspace, options));
      receipts.push({
        documentId: document.id,
        url: document.url,
        rawHash,
        fetchedAt,
        localFile: !!document.localFile,
      });
      if (document.kind === 'bill') {
        const parsed = parseBill(document, raw, fetchedAt, rawHash);
        if (parsed.certification) certifications.set(document.id, parsed.certification);
        corpus.sources.push(parsed.source);
        const existing = corpus.measures.find((m) => m.id === parsed.measure.id);
        if (existing) existing.versions.push(...parsed.measure.versions);
        else corpus.measures.push(parsed.measure);
      } else if (document.kind === 'record') {
        const parsed = parseRecord(document, raw, plan.identities, fetchedAt, rawHash);
        corpus.sources.push(parsed.source);
        corpus.passages.push(...parsed.passages);
        issues.push(...parsed.issues);
      } else {
        let voteIdentities = plan.identities;
        if (document.kind === 'house_vote' && plan.houseRoster === 'roll_call') {
          voteIdentities = houseRollCallRoster(raw, document, corpus.people);
          for (const person of voteIdentities) {
            const index = corpus.people.findIndex((p) => p.bioguideId === person.bioguideId);
            if (index < 0) corpus.people.push(personSchema.parse(person));
            else corpus.people[index] = personSchema.parse(person);
          }
        }
        const parsed = parseVote(document, raw, voteIdentities, fetchedAt, rawHash);
        corpus.sources.push(...parsed.sources);
        issues.push(...parsed.issues);
        for (const action of parsed.actions) {
          if (!corpus.measures.some((m) => m.id === action.measureId))
            issues.push({
              id: action.id,
              reason: `No supplied bill-text document for ${action.measureId}; action held outside corpus.`,
            });
          else corpus.actions.push(action);
        }
      }
    }
    for (const binding of plan.operativeBindings) {
      const evidence = corpus.sources.find((s) => s.id === binding.evidenceSourceId);
      const measure = corpus.measures.find((m) => m.id === binding.measureId);
      if (
        !evidence?.text.includes(binding.evidence) ||
        !measure?.versions.some((v) => v.id === binding.versionId)
      )
        throw new Error('Unsupported operative-text binding.');
      const receipt = receipts.find((r) => r.documentId === binding.documentId);
      if (!receipt) throw new Error('Unknown binding vote document.');
      const matchedActions = corpus.actions.filter(
        (a) =>
          a.measureId === binding.measureId &&
          corpus.sources.find((s) => s.id === a.sourceId)?.provenance?.rawHash === receipt.rawHash,
      );
      if (!matchedActions.length) throw new Error('Operative binding matched no recorded actions.');
      if (binding.basis === 'engrossed_house_passage') {
        const proof = certifications.get(binding.versionId);
        const version = measure!.versions.find((v) => v.id === binding.versionId)!;
        if (
          !proof ||
          binding.status !== 'established' ||
          version.sourceId !== binding.evidenceSourceId ||
          proof.text !== binding.evidence ||
          version.issued !== proof.date ||
          matchedActions.some(
            (a) =>
              a.chamber !== 'House' ||
              a.kind !== 'passage' ||
              a.question !== 'On Passage' ||
              a.result !== 'Passed' ||
              a.date !== proof.date,
          )
        )
          throw new Error(
            'House engrossed-text binding requires matching certified date, measure, and successful passage vote.',
          );
      }
      for (const action of corpus.actions.filter(
        (a) =>
          a.measureId === binding.measureId &&
          corpus.sources.find((s) => s.id === a.sourceId)?.provenance?.rawHash === receipt.rawHash,
      )) {
        action.versionId = binding.versionId;
        action.operativeText = binding.status;
        action.context =
          binding.basis === 'engrossed_house_passage'
            ? `Individual choice and exact question are from the official roll call. The measure, successful House passage, vote date, and House engrossment certification match. Certification: ${binding.evidence} (${binding.evidenceSourceId}). This establishes the House-passed text, not a separate position on every provision or a later Senate/final version.`
            : `${action.context} Supplied operative-text evidence: ${binding.evidence} (${binding.evidenceSourceId}).`;
      }
    }
    corpus.scope.exclusions = [...corpus.scope.exclusions, ...issues];
    validateCorpus(corpus);
    const file = join(workspace, 'acquisition', 'corpus.json');
    const report = {
      parserVersion: SOURCE_PARSER_VERSION,
      at: new Date().toISOString(),
      receipts,
      issues,
      counts: {
        documents: receipts.length,
        passages: corpus.passages.length,
        actions: corpus.actions.length,
        measures: corpus.measures.length,
      },
    };
    await writeAtomic(file, corpus);
    await writeAtomic(join(workspace, 'acquisition', 'report.json'), report);
    return { corpus, report, file };
  });
}
