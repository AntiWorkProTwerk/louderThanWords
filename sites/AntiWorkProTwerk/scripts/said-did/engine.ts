import { createHash } from 'node:crypto';
import {
  corpusSchema,
  claimSchema,
  candidateSchema,
  reviewSchema,
  type Corpus,
  type Claim,
  type Candidate,
  type Review,
} from '../../src/lib/said-did/schema.ts';

export const PIPELINE_VERSION = 'said-did-v3';
export const hash = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
export function normalizeText(raw: string) {
  let text = '';
  const rawOffsets: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    rawOffsets.push(i);
    if (raw[i] === '\r') {
      text += '\n';
      if (raw[i + 1] === '\n') i++;
    } else text += raw[i];
  }
  rawOffsets.push(raw.length);
  return { text, rawOffsets, version: 'newline-only-v1' };
}
export function measureMentions(text: string) {
  return [
    ...text.matchAll(
      /\b(H\s*\.?\s*J\s*\.?\s*Res\.?|S\s*\.?\s*J\s*\.?\s*Res\.?|H\s*\.?\s*Res\.?|S\s*\.?\s*Res\.?|H\s*\.?\s*Amdt\.?|S\s*\.?\s*Amdt\.?|H\s*\.?\s*R\.?|S\.?)\s*(\d+)\b/gi,
    ),
  ].map((match) => ({
    type: match[1].replace(/[.\s]/g, '').toLowerCase(),
    number: Number(match[2]),
  }));
}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function validateCorpus(input: unknown): Corpus {
  const c = corpusSchema.parse(input);
  for (const key of ['people', 'sources', 'measures', 'passages', 'actions'] as const) {
    requireThat(
      new Set(c[key].map((x) => x.id)).size === c[key].length,
      `Duplicate ${key} identity`,
    );
  }
  requireThat(c.scope.from <= c.scope.through, 'Invalid coverage window');
  for (const person of c.people) {
    requireThat(
      c.scope.mode === 'demo' ? person.fictional : !person.fictional && person.bioguideId,
      'Demo people must be fictional; real people need Bioguide IDs',
    );
    for (const term of person.terms) requireThat(term.from <= term.to, 'Invalid member term');
  }
  for (const s of c.sources)
    requireThat(
      c.scope.mode === 'demo' ? s.kind === 'fixture' : s.kind === 'official' && s.url,
      'Source provenance does not match corpus mode',
    );
  for (const m of c.measures) {
    requireThat(m.id === `${m.congress}-${m.type}-${m.number}`, `Noncanonical measure ID: ${m.id}`);
    if (m.parentId)
      requireThat(
        c.measures.some((x) => x.id === m.parentId),
        'Missing amendment parent',
      );
    for (const v of m.versions)
      requireThat(
        c.sources.find((s) => s.id === v.sourceId)?.text.includes(v.provision),
        `Unsupported provision ${v.id}`,
      );
  }
  for (const p of c.passages) {
    const s = c.sources.find((s) => s.id === p.sourceId);
    requireThat(s, `Missing source for passage ${p.id}`);
    requireThat(
      p.end > p.start && p.end <= normalizeText(s.text).text.length,
      `Invalid passage offsets ${p.id}`,
    );
    requireThat(!p.personId || c.people.some((x) => x.id === p.personId), 'Unknown passage person');
    requireThat(
      !p.eventTime || p.eventTime.slice(0, 10) === p.eventDate,
      'Statement timestamp/date mismatch',
    );
    requireThat(
      p.kind !== 'floor_verified' || p.mediaUrl,
      'Verified floor words require media evidence',
    );
    if (p.contextMeasureId)
      requireThat(
        c.measures.some((m) => m.id === p.contextMeasureId) &&
          p.contextEvidence &&
          normalizeText(s.text).text.includes(p.contextEvidence),
        'Unsupported debate context',
      );
  }
  const votes = new Set<string>();
  for (const a of c.actions) {
    const m = c.measures.find((m) => m.id === a.measureId),
      s = c.sources.find((s) => s.id === a.sourceId);
    requireThat(m && s, `Missing action target/source ${a.id}`);
    requireThat(!a.personId || c.people.some((p) => p.id === a.personId), 'Unknown action person');
    requireThat(a.congress === m.congress, 'Action Congress mismatch');
    requireThat(
      !a.versionId || m.versions.some((v) => v.id === a.versionId),
      'Unknown operative version',
    );
    requireThat(
      s.text.includes(a.question) && s.text.includes(a.rawVote),
      `Action facts absent from source ${a.id}`,
    );
    requireThat(
      a.kind !== 'voice' || (a.personId === null && a.vote === 'Chamber action'),
      'Voice votes cannot imply an individual vote',
    );
    requireThat(!a.time || a.time.slice(0, 10) === a.date, 'Action timestamp/date mismatch');
    const rawChoice = a.rawVote.toLowerCase().trim();
    const normalizedChoices: Record<string, string> = {
      yea: 'Yea',
      aye: 'Yea',
      yes: 'Yea',
      nay: 'Nay',
      no: 'Nay',
      present: 'Present',
      'not voting': 'Not Voting',
    };
    if (['Yea', 'Nay', 'Present', 'Not Voting'].includes(a.vote))
      requireThat(
        normalizedChoices[rawChoice] === a.vote,
        'Raw and normalized individual vote disagree',
      );
    if (/previous question|cloture/i.test(a.question))
      requireThat(a.kind === 'procedure', 'Procedural question cannot be classified as passage');
    if (/motion to table/i.test(a.question))
      requireThat(a.kind === 'table', 'Table motion must retain its action type');
    if (/suspend.*rules.*pass/i.test(a.question))
      requireThat(
        a.kind === 'combined_passage',
        'Combined passage motion must retain the full question',
      );
    if (a.roll !== null && a.personId) {
      const key = `${a.congress}:${a.chamber}:${a.session}:${a.roll}:${a.personId}`;
      requireThat(!votes.has(key), `Duplicate member vote ${key}`);
      votes.add(key);
    }
  }
  return c;
}
export function extractDeterministic(c: Corpus): Claim[] {
  return c.passages.flatMap((p) => {
    if (p.attribution !== 'verified' || !p.personId || ['third_party', 'unknown'].includes(p.kind))
      return [];
    const source = c.sources.find((s) => s.id === p.sourceId)!;
    if (!['public_record', 'fixture'].includes(source.publicationRights)) return [];
    const quote = normalizeText(source.text).text.slice(p.start, p.end);
    // Deliberately conservative: a complete supplied speaker turn, never a
    // clipped sentence or a model-created quotation. Ambiguity is review work.
    const oppose = /\b(?:oppose|vote against|do not support|cannot support)\b/i.test(quote);
    const support = /\b(?:I support|I will vote for|I favor)\b/i.test(quote);
    const conditional = /\b(?:if|unless|provided that|only when)\b/i.test(quote);
    const matches = measureMentions(quote);
    const targets = c.measures.filter((m) =>
      matches.some((x) => x.type === m.type && x.number === m.number),
    );
    const targetId =
      targets.length === 1 ? targets[0].id : targets.length ? null : p.contextMeasureId;
    const type = conditional
      ? 'conditional'
      : /\bI will vote\b/i.test(quote)
        ? 'voting_intention'
        : support || oppose
          ? 'position'
          : /\bshould\b/i.test(quote)
            ? 'policy'
            : 'aspiration';
    return [
      claimSchema.parse({
        id: `claim-${p.id}`,
        passageId: p.id,
        quoteStart: p.start,
        quoteEnd: p.end,
        quote,
        type,
        stance: oppose && !support ? 'oppose' : support && !oppose ? 'support' : 'unclear',
        targetId,
        policy: targets[0]?.policy ?? '',
        qualifiers: conditional ? [quote] : [],
        conditions: conditional ? [quote] : [],
        meaning: quote,
        sentiment: 'not_assessed',
      }),
    ];
  });
}
export function validateClaims(c: Corpus, input: unknown): Claim[] {
  const claims = claimSchema.array().parse(input);
  requireThat(new Set(claims.map((x) => x.id)).size === claims.length, 'Duplicate claim IDs');
  for (const claim of claims) {
    const p = c.passages.find((p) => p.id === claim.passageId);
    requireThat(
      p &&
        p.personId &&
        p.attribution === 'verified' &&
        !['third_party', 'unknown'].includes(p.kind),
      'Unresolved or third-party attribution',
    );
    const s = c.sources.find((s) => s.id === p.sourceId)!;
    const text = normalizeText(s.text).text;
    requireThat(
      ['public_record', 'fixture'].includes(s.publicationRights),
      'Publication rights not established',
    );
    requireThat(
      claim.quoteStart >= p.start &&
        claim.quoteEnd <= p.end &&
        claim.quoteEnd > claim.quoteStart &&
        text.slice(claim.quoteStart, claim.quoteEnd) === claim.quote,
      'Quote is not an exact saved source span',
    );
    // Full turns are required for v1. A future span editor may safely narrow
    // these only after a qualification-retention evaluation.
    requireThat(
      claim.quoteStart === p.start && claim.quoteEnd === p.end,
      'V1 requires the complete attributable passage; do not clip qualifications',
    );
    requireThat(
      !claim.targetId || c.measures.some((m) => m.id === claim.targetId),
      'Invented claim target',
    );
    if (claim.targetId) {
      const measure = c.measures.find((m) => m.id === claim.targetId)!;
      const explicit = measureMentions(claim.quote).some(
        (ref) => ref.type === measure.type && ref.number === measure.number,
      );
      requireThat(
        explicit || (p.contextMeasureId === claim.targetId && !!p.contextEvidence),
        'Claim target has no explicit or sourced debate reference',
      );
      requireThat(
        c.measures.filter((m) => m.type === measure.type && m.number === measure.number).length ===
          1 || claim.quote.includes(String(measure.congress)),
        'Congress of the measure reference is ambiguous',
      );
    }
    for (const q of [...claim.qualifiers, ...claim.conditions])
      requireThat(
        claim.quote.includes(q),
        `Unsupported qualification in ${claim.id}: ${JSON.stringify(q)}. Preserve source line breaks and spacing, or use the whole quote.`,
      );
  }
  return claims;
}
export function generateCandidates(c: Corpus, claims: Claim[]): Candidate[] {
  return claims.flatMap((claim) => {
    const passage = c.passages.find((p) => p.id === claim.passageId)!;
    const person = c.people.find((p) => p.id === passage.personId) ?? null;
    const matched = c.actions
      .filter(
        (a) =>
          a.personId === passage.personId &&
          a.date >= c.scope.from &&
          a.date <= c.scope.through &&
          (c.scope.chamber === 'Both' || a.chamber === c.scope.chamber) &&
          (claim.targetId
            ? a.measureId === claim.targetId
            : claim.policy &&
              c.measures.find((m) => m.id === a.measureId)?.policy === claim.policy),
      )
      .slice(0, 10);
    return (matched.length ? matched : [null]).map((action) => {
      const measure =
        c.measures.find((m) => m.id === (action?.measureId ?? claim.targetId)) ?? null;
      const blockers: string[] = [],
        cautions: string[] = [];
      let chronology: Candidate['chronology'] = 'unknown';
      if (action)
        chronology =
          passage.eventDate < action.date
            ? 'statement_before_action'
            : passage.eventDate > action.date
              ? 'action_before_statement'
              : passage.eventTime && action.time
                ? Date.parse(passage.eventTime) < Date.parse(action.time)
                  ? 'statement_before_action'
                  : 'action_before_statement'
                : 'same_day_order_unknown';
      if (!action) blockers.push('No matching individual action in the declared coverage window.');
      const earliest = new Date(`${c.scope.from}T00:00:00Z`);
      earliest.setUTCDate(earliest.getUTCDate() - c.scope.lookbackDays);
      if (
        passage.eventDate < earliest.toISOString().slice(0, 10) ||
        passage.eventDate > c.scope.through
      )
        blockers.push('Statement is outside the declared lookback window.');
      if (
        !person ||
        !person.terms.some(
          (t) =>
            t.from <= passage.eventDate &&
            t.to >= passage.eventDate &&
            (!action || t.chamber === action.chamber),
        )
      )
        blockers.push('Identity or statement-date member term is unresolved.');
      if (
        action &&
        !person?.terms.some(
          (t) => t.from <= action.date && t.to >= action.date && t.chamber === action.chamber,
        )
      )
        blockers.push('Action-date member term is unresolved.');
      if (chronology === 'action_before_statement' || chronology === 'unknown')
        blockers.push('A subsequent action has not been established.');
      if (['aspiration', 'description'].includes(claim.type) || claim.stance === 'unclear')
        blockers.push('The statement is not a sufficiently specific assessable position.');
      if (action && (!action.versionId || action.operativeText === 'unresolved'))
        blockers.push('The operative text bundle is unresolved.');
      if (action?.kind === 'voice')
        blockers.push('Chamber action is not an individual recorded vote.');
      if (chronology === 'same_day_order_unknown')
        cautions.push('Same day; order not established. This is not proof of a later reversal.');
      if (action && ['procedure', 'table', 'combined_passage', 'sponsorship'].includes(action.kind))
        cautions.push(
          'The precise legislative question matters; this is not an ordinary final-passage comparison.',
        );
      if (action && ['Present', 'Not Voting'].includes(action.vote))
        cautions.push(`${action.vote} is not a vote against the policy.`);
      if (
        claim.conditions.length ||
        claim.type === 'conditional' ||
        /\b(if|unless|provided that|only when)\b/i.test(claim.quote)
      )
        cautions.push('The statement is conditional. Whether the condition held must be checked.');
      if (action?.operativeText === 'changed')
        cautions.push('The operative text changed between the statement and action.');
      const basis: Candidate['basis'] = !action
        ? 'none'
        : !claim.targetId
          ? 'reviewed_policy'
          : passage.contextMeasureId === claim.targetId &&
              !measureMentions(claim.quote).some(
                (ref) => ref.type === measure?.type && ref.number === measure?.number,
              )
            ? 'debate_context'
            : 'explicit_measure';
      if (basis === 'reviewed_policy')
        cautions.push(
          'Topic retrieval is only a candidate; a reviewer must establish precise policy equivalence.',
        );
      const contextRequired = cautions.length > 0;
      const suggestedAssessment =
        contextRequired || !action || !['Yea', 'Nay'].includes(action.vote)
          ? 'context_dependent'
          : (claim.stance === 'support') === (action.vote === 'Yea')
            ? 'consistent'
            : 'apparent_tension';
      const sourceIds = [
        passage.sourceId,
        action?.sourceId,
        measure?.versions.find((v) => v.id === action?.versionId)?.sourceId,
      ].filter(Boolean);
      const sourceHashes = Object.fromEntries(
        c.sources.filter((s) => sourceIds.includes(s.id)).map((s) => [s.id, hash(s.text)]),
      );
      if (
        claim.quote.length > 20_000 ||
        (action && (c.sources.find((s) => s.id === action.sourceId)?.text.length ?? 0) > 20_000) ||
        (measure?.versions.find((v) => v.id === action?.versionId)?.provision.length ?? 0) > 20_000
      )
        blockers.push(
          'Select a smaller source-backed evidence document before publication; raw corpus text must not enter public snapshots.',
        );
      const draft = {
        id: `link-${hash([claim.id, action?.id ?? 'unmatched']).slice(0, 20)}`,
        claim,
        passage,
        person,
        action,
        measure,
        basis,
        chronology,
        suggestedAssessment,
        blockers,
        cautions,
        status: !action ? 'unrelated' : blockers.length ? 'needs_evidence' : 'draft',
        sourceHashes,
      };
      return candidateSchema.parse({
        ...draft,
        fingerprint: hash([
          PIPELINE_VERSION,
          draft,
          c.sources
            .filter((s) => sourceIds.includes(s.id))
            .map(({ fetchedAt, ...source }) => source),
        ]),
      });
    });
  });
}
export function validateReview(candidate: Candidate, input: unknown): Review {
  const r = reviewSchema.parse(input);
  requireThat(
    r.candidateId === candidate.id && r.fingerprint === candidate.fingerprint,
    'Review is stale; sources or extraction changed',
  );
  if (r.decision === 'approved') {
    requireThat(candidate.blockers.length === 0, `Cannot approve: ${candidate.blockers.join(' ')}`);
    requireThat(
      Object.values(r.checks).every(Boolean),
      'Both evidence and contrary-context checks are required',
    );
    requireThat(
      Date.parse(r.contextPassAt) > Date.parse(r.factsPassAt),
      'Record a separate, later context review pass',
    );
    requireThat(
      Date.parse(r.reviewedAt) >= Date.parse(r.contextPassAt),
      'Review timestamp precedes checks',
    );
    requireThat(
      !candidate.cautions.length || r.assessment === 'context_dependent',
      'Qualified/procedural/same-day cases must remain context dependent in v1',
    );
  }
  return r;
}
