import { z } from 'zod';
import { join } from 'node:path';
import { corpusSchema } from '../../src/lib/said-did/schema.ts';
import {
  acquisitionSchema,
  decodeEntities,
  fetchOfficial,
  officialDate,
  parseXml,
  type Acquisition,
} from './sources.ts';
import { defaultWorkspace, writeAtomic } from './pipeline.ts';

export const discoverySchema = z.object({
  scope: corpusSchema.shape.scope,
  congress: z.number().int().positive(),
  session: z.number().int().min(1).max(2),
  measureIds: z
    .array(z.string().regex(/^\d+-(?:hr|s|hres|sres|hjres|sjres)-\d+$/))
    .min(1)
    .max(10),
  maxDocuments: z.number().int().min(1).max(100).default(40),
  identities: acquisitionSchema.shape.identities.default([]),
});
const array = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const value = (v: any) =>
  typeof v === 'object' && v !== null ? String(v['#text'] ?? '') : String(v ?? '');

export async function discoverSources(
  input: unknown,
  options: { workspace?: string; offline?: boolean; fetcher?: typeof fetch } = {},
) {
  const config = discoverySchema.parse(input),
    workspace = options.workspace ?? defaultWorkspace;
  const begin = Date.parse(`${config.scope.from}T00:00:00Z`),
    end = Date.parse(`${config.scope.through}T00:00:00Z`);
  if (config.scope.mode !== 'real' || end < begin || end - begin > 6 * 86400000)
    throw new Error('Discovery requires a real-data window of 1–7 days.');
  const documents: Acquisition['documents'] = [],
    identities = [...config.identities],
    diagnostics: string[] = [];
  const add = (document: Acquisition['documents'][number]) => {
    if (documents.some((d) => d.url === document.url)) return;
    if (documents.length >= config.maxDocuments)
      throw new Error(
        'Discovery document cap reached. Narrow the measure/date scope; results are never silently truncated.',
      );
    documents.push(document);
  };
  for (let instant = begin; instant <= end; instant += 86400000) {
    const date = new Date(instant).toISOString().slice(0, 10);
    const metadataUrl = `https://www.govinfo.gov/metadata/pkg/CREC-${date}/mods.xml`;
    let raw: string;
    try {
      ({ raw } = await fetchOfficial(metadataUrl, workspace, options));
    } catch (e) {
      diagnostics.push(`${date}: ${String(e)}`);
      continue;
    }
    const metadata = parseXml(raw).mods;
    for (const item of array(metadata?.relatedItem).filter((r) => r['@_type'] === 'constituent')) {
      const extension = item.extension,
        chamber =
          value(extension?.chamber) === 'HOUSE'
            ? 'House'
            : value(extension?.chamber) === 'SENATE'
              ? 'Senate'
              : null;
      if (
        !chamber ||
        (config.scope.chamber !== 'Both' && config.scope.chamber !== chamber) ||
        !['HOUSE', 'SENATE', 'EXTENSIONS'].includes(value(extension?.granuleClass))
      )
        continue;
      const bills = array(extension.bill).map(
        (b) => `${b['@_congress']}-${String(b['@_type']).toLowerCase()}-${b['@_number']}`,
      );
      if (!bills.some((id) => config.measureIds.includes(id))) continue;
      const url = array(item.location?.url)
        .map(value)
        .find((u) => /\/html\/CREC-[\w-]+\.htm$/.test(u));
      if (!url) continue;
      const id = value(extension.accessId).toLowerCase();
      add({ id, kind: 'record', url, date, congress: config.congress, chamber });
      for (const member of array(extension.congMember).filter(
        (m) => m['@_role'] === 'SPEAKING' && Number(m['@_congress']) === config.congress,
      )) {
        const bioguide = member['@_bioGuideId'];
        if (!/^[A-Z]\d{6}$/.test(bioguide ?? '')) continue;
        const names = array(member.name),
          full = names.find((n) => n['@_type'] === 'authority-fnf'),
          parsed = names
            .filter((n) => n['@_type'] === 'parsed')
            .map((n) =>
              value(n)
                .replace(/^(Mr\.|Mrs\.|Ms\.|Miss)\s+/, '')
                .replace(/\.$/, ''),
            );
        if (!full || !parsed.length || !['D', 'R', 'I'].includes(member['@_party'])) continue;
        const term = {
          state: member['@_state'],
          party: member['@_party'] as 'D' | 'R' | 'I',
          district: '',
          chamber,
          from: date,
          to: date,
        };
        const existing = identities.find((p) => p.bioguideId === bioguide);
        if (existing) {
          existing.aliases = [...new Set([...existing.aliases, ...parsed])];
          if (!existing.terms.some((t) => JSON.stringify(t) === JSON.stringify(term)))
            existing.terms.push(term);
        } else
          identities.push({
            id: bioguide.toLowerCase(),
            bioguideId: bioguide,
            fictional: false,
            name: decodeEntities(value(full)),
            terms: [term],
            aliases: parsed,
            evidenceUrl: metadataUrl,
          });
      }
    }
  }
  const years = [...new Set([config.scope.from.slice(0, 4), config.scope.through.slice(0, 4)])];
  if (config.scope.chamber !== 'Senate')
    for (const year of years) {
      const queue = [`https://clerk.house.gov/evs/${year}/index.asp`],
        seen = new Set<string>();
      while (queue.length) {
        const url = queue.shift()!;
        if (seen.has(url)) continue;
        seen.add(url);
        if (seen.size > 30) throw new Error('House index page cap reached.');
        const { raw } = await fetchOfficial(url, workspace, options);
        for (const match of raw.matchAll(/href=["']([^"']*(?:ROLL_\d+|index)\.asp)["']/gi)) {
          const next = new URL(match[1], url);
          if (next.hostname === 'clerk.house.gov' && next.pathname.startsWith(`/evs/${year}/`))
            queue.push(next.href.replace('http:', 'https:'));
        }
        for (const row of raw.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
          const roll = row[1].match(/rollnumber=(\d+)/i)?.[1],
            day = row[1].match(/\b(\d{1,2}-[A-Za-z]{3})\b/)?.[1];
          if (!roll || !day) continue;
          const date = officialDate(`${day}-${year}`);
          if (date < config.scope.from || date > config.scope.through) continue;
          const text = decodeEntities(row[1].replace(/<[^>]+>/g, ' '))
            .replaceAll('.', '')
            .replace(/\s+/g, ' ');
          if (
            !config.measureIds.some((id) => {
              const [, type, number] = id.split('-');
              return new RegExp(`\\b${type.split('').join('\\s*')}\\s*${number}\\b`, 'i').test(
                text,
              );
            })
          )
            continue;
          add({
            id: `house-${year}-${roll}`,
            kind: 'house_vote',
            url: `https://clerk.house.gov/evs/${year}/roll${roll.padStart(3, '0')}.xml`,
            congress: config.congress,
            chamber: 'House',
            date,
          });
        }
      }
    }
  if (config.scope.chamber !== 'House') {
    const { raw } = await fetchOfficial(
      `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${config.congress}_${config.session}.xml`,
      workspace,
      options,
    );
    const menu = parseXml(raw).vote_summary;
    for (const vote of array(menu?.votes?.vote)) {
      const date = officialDate(`${value(vote.vote_date)}-${value(menu.congress_year)}`);
      if (date < config.scope.from || date > config.scope.through) continue;
      const issue = value(vote.issue).toLowerCase().replace(/[.\s]/g, '');
      if (!config.measureIds.some((id) => id.split('-').slice(1).join('') === issue)) continue;
      const number = value(vote.vote_number).padStart(5, '0');
      add({
        id: `senate-${config.congress}-${config.session}-${number}`,
        kind: 'senate_vote',
        congress: config.congress,
        chamber: 'Senate',
        date,
        url: `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${config.congress}${config.session}/vote_${config.congress}_${config.session}_${number}.xml`,
      });
    }
    diagnostics.push(
      'Senate votes require an explicit dated LIS/Bioguide crosswalk in identities. MODS speaking metadata does not supply LIS IDs. Unresolved members are held, never name-guessed.',
    );
  }
  for (const measure of config.measureIds) {
    const [congress, type, number] = measure.split('-');
    if (Number(congress) !== config.congress)
      throw new Error('Discovery measure Congress mismatch.');
    const version = type.startsWith('h') ? 'ih' : 'is';
    add({
      id: `${measure}-${version}`,
      kind: 'bill',
      congress: config.congress,
      chamber: type.startsWith('h') ? 'House' : 'Senate',
      url: `https://www.govinfo.gov/bulkdata/BILLS/${congress}/${config.session}/${type}/BILLS-${congress}${type}${number}${version}.xml`,
    });
  }
  const plan = acquisitionSchema.parse({
    scope: config.scope,
    identities,
    documents,
    operativeBindings: [],
  });
  const file = join(workspace, 'acquisition', 'discovered-plan.json');
  await writeAtomic(file, plan);
  await writeAtomic(join(workspace, 'acquisition', 'discovery-report.json'), {
    diagnostics,
    documents: documents.length,
    identities: identities.length,
  });
  return { file, plan, diagnostics };
}
