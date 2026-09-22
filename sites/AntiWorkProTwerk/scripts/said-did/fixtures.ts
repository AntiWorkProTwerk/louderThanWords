import type { Corpus, Review } from '../../src/lib/said-did/schema.ts';
import { hash, validateCorpus } from './engine.ts';
import {
  prepare,
  readStore,
  addReview,
  publish,
  defaultWorkspace,
  defaultOutput,
} from './pipeline.ts';

export function demoCorpus(): Corpus {
  const at = '2026-09-15T12:00:00.000Z';
  const people = [
    ['demo-maya-chen', 'Maya Chen', 'TX', 'D', '07'],
    ['demo-eli-brooks', 'Eli Brooks', 'TX', 'R', '12'],
    ['demo-nora-reyes', 'Nora Reyes', 'CA', 'D', '18'],
    ['demo-theo-bennett', 'Theo Bennett', 'NY', 'I', '09'],
  ].map(([id, name, state, party, district]) => ({
    id,
    name,
    bioguideId: null,
    fictional: true,
    terms: [
      {
        state,
        party: party as 'D' | 'R' | 'I',
        district,
        chamber: 'House' as const,
        from: '2025-01-03',
        to: '2027-01-02',
      },
    ],
  }));
  const sources: Corpus['sources'] = [];
  function source(id: string, title: string, text: string, date: string) {
    sources.push({
      id,
      title,
      text,
      date,
      provider: 'Local demonstration fixture',
      externalId: id,
      url: null,
      kind: 'fixture',
      publishedAt: at,
      fetchedAt: at,
      modifiedAt: at,
      page: 'Fixture 1',
      publicationRights: 'fixture',
    });
    return id;
  }
  const measures: Corpus['measures'] = [
    {
      id: '119-hr-9001',
      congress: 119,
      type: 'hr',
      number: 9001,
      title: 'Individual Stock Trading Restrictions',
      policy: 'Public trust',
      policyDefinition:
        'Prohibit members of Congress from trading individual stocks, with a transition period for existing holdings.',
      parentId: null,
      versions: [],
    },
    {
      id: '119-hr-9002',
      congress: 119,
      type: 'hr',
      number: 9002,
      title: 'Prescription Cost Access',
      policy: 'Healthcare',
      policyDefinition:
        'Cap eligible out-of-pocket prescription costs for a defined public insurance population, without reducing rural clinic support.',
      parentId: null,
      versions: [],
    },
    {
      id: '119-hr-9003',
      congress: 119,
      type: 'hr',
      number: 9003,
      title: 'Community Flood Recovery',
      policy: 'Disaster relief',
      policyDefinition:
        'Appropriate recovery grants for communities affected by declared floods; distinguish final passage from debate procedure.',
      parentId: null,
      versions: [],
    },
  ];
  for (const m of measures)
    m.versions.push({
      id: `text-${m.number}-v1`,
      issued: '2026-08-01',
      sourceId: source(
        `text-${m.number}`,
        'Fictional operative provision',
        m.policyDefinition,
        '2026-08-01',
      ),
      provision: m.policyDefinition,
    });
  const cases = [
    {
      person: 0,
      measure: 0,
      quote:
        'I will vote for H.R. 9001. Members of Congress should not trade individual stocks, and the transition period gives existing holdings time to unwind.',
      vote: 'Yea',
      day: '03',
      actionDay: '10',
      kind: 'passage',
    },
    {
      person: 1,
      measure: 0,
      quote:
        'I will vote against H.R. 9001. I oppose this restriction on individual stock trading by members of Congress.',
      vote: 'Yea',
      day: '04',
      actionDay: '10',
      kind: 'passage',
    },
    {
      person: 0,
      measure: 2,
      quote: 'I support H.R. 9003 and its recovery grants for flood-affected communities.',
      vote: 'Nay',
      day: '05',
      actionDay: '12',
      kind: 'procedure',
    },
    {
      person: 2,
      measure: 1,
      quote:
        'I support H.R. 9002 only if rural clinic support is preserved. Reducing that support would change my position.',
      vote: 'Nay',
      day: '06',
      actionDay: '14',
      kind: 'passage',
    },
    {
      person: 2,
      measure: 0,
      quote: 'I support H.R. 9001. The transition period protects an orderly divestment process.',
      vote: 'Yea',
      day: '07',
      actionDay: '10',
      kind: 'passage',
    },
    {
      person: 3,
      measure: 2,
      quote:
        'I will vote for H.R. 9003. Flood recovery grants should reach the affected communities.',
      vote: 'Yea',
      day: '12',
      actionDay: '12',
      kind: 'passage',
    },
    {
      person: 1,
      measure: 1,
      quote: 'I support H.R. 9002 and the specified prescription cost cap.',
      vote: 'Not Voting',
      day: '08',
      actionDay: '14',
      kind: 'passage',
    },
    {
      person: 3,
      measure: 1,
      quote: 'I support H.R. 9002, including its protections for rural clinics.',
      vote: 'Nay',
      day: '09',
      actionDay: '14',
      kind: 'passage',
      unresolved: true,
    },
    {
      person: 3,
      measure: 0,
      quote: 'I support H.R. 9001 and a clear stock-trading restriction for members.',
      vote: null,
      day: '09',
      actionDay: '15',
      kind: 'passage',
    },
  ] as const;
  const passages: Corpus['passages'] = [],
    actions: Corpus['actions'] = [];
  cases.forEach((example, i) => {
    const p = people[example.person],
      m = measures[example.measure],
      sid = `statement-${i + 1}`;
    const context =
      i === 3
        ? 'The stated condition concerns rural clinic support, not prescription costs in general.'
        : i === 2
          ? 'Debate procedure and final passage are separate legislative actions.'
          : '';
    source(
      sid,
      `${p.name} — fictional recorded statement`,
      example.quote,
      `2026-08-${example.day}`,
    );
    passages.push({
      id: `passage-${i + 1}`,
      sourceId: sid,
      personId: p.id,
      identityEvidence: 'Explicit fictional roster ID supplied in this fixture',
      attribution: 'verified',
      start: 0,
      end: example.quote.length,
      kind: i === 4 ? 'inserted_statement' : 'recorded_statement',
      eventDate: `2026-08-${example.day}`,
      eventTime: null,
      mediaUrl: null,
      context,
      contextMeasureId: null,
      contextEvidence: '',
    });
    if (example.vote) {
      const question =
        example.kind === 'procedure'
          ? 'On Ordering the Previous Question'
          : `On Passage of H.R. ${m.number}`;
      const roll = 301 + i;
      const actionText = `Fictional House roll call ${roll}, 119th Congress, session 2. ${question}. ${p.name}: ${example.vote}. Result: ${i === 3 ? 'Failed' : 'Agreed to'}. ${context}`;
      actions.push({
        id: `119-house-2-${roll}-${p.id}`,
        personId: p.id,
        measureId: m.id,
        versionId: `text-${m.number}-v1`,
        sourceId: source(
          `action-${i + 1}`,
          `${p.name} — fictional individual action`,
          actionText,
          `2026-08-${example.actionDay}`,
        ),
        congress: 119,
        chamber: 'House',
        session: 2,
        roll,
        date: `2026-08-${example.actionDay}`,
        time: null,
        question,
        kind: example.kind,
        result: i === 3 ? 'Failed' : 'Agreed to',
        rawVote: example.vote,
        vote: example.vote,
        operativeText: 'unresolved' in example ? 'unresolved' : i === 3 ? 'changed' : 'established',
        conditionsMet: i === 3 ? 'unknown' : 'not_applicable',
        context,
      });
    }
  });
  return validateCorpus({
    formatVersion: 1,
    scope: {
      id: 'fictional-local-pilot',
      title: 'Local evidence pilot',
      mode: 'demo',
      chamber: 'House',
      from: '2026-08-01',
      through: '2026-08-31',
      lookbackDays: 30,
      eligibility:
        'A fixed fictional corpus covering direct references, agreement, tension, procedural actions, conditions, absence, uncertain same-day order, missing text and no-match outcomes. Not a sample of actual congressional behavior.',
      exclusions: [
        {
          id: 'unresolved-operative-text',
          reason: 'An example with missing operative text remains in the private review queue.',
        },
      ],
    },
    people,
    sources,
    measures,
    passages,
    actions,
  });
}
export async function seed(workspace = defaultWorkspace, output = defaultOutput) {
  // Fixture-only convenience. Real inputs never receive generated approval.
  await prepare(demoCorpus(), { workspace });
  const store = await readStore(workspace);
  for (const c of store.candidates.filter((c) => !c.blockers.length)) {
    const explanation =
      c.suggestedAssessment === 'consistent'
        ? 'The recorded choice aligns with the stated position on this exact measure. This comparison concerns this action, not every provision or a career-wide record.'
        : c.suggestedAssessment === 'apparent_tension'
          ? 'The recorded Yea differs from the explicit intention to vote against this measure. The fixture supplies no later explanation; this is not a finding about motive or honesty.'
          : c.cautions.join(' ');
    const review: Review = {
      id: `demo-review-${hash(c.fingerprint).slice(0, 16)}`,
      candidateId: c.id,
      fingerprint: c.fingerprint,
      reviewer: 'Demonstration editorial fixture',
      reviewedAt: '2026-09-15T12:30:00.000Z',
      decision: 'approved',
      rationale:
        'Synthetic expected outcome for UI and pipeline testing; not a real editorial approval.',
      assessment: c.suggestedAssessment,
      explanation,
      limitations: [
        'Fictional person, statement, measure and action. This example is not evidence about any real member of Congress.',
      ],
      checks: {
        identity: true,
        quote: true,
        action: true,
        text: true,
        chronology: true,
        qualifications: true,
        contraryEvidence: true,
      },
      factsPassAt: '2026-09-15T12:00:00.000Z',
      contextPassAt: '2026-09-15T12:15:00.000Z',
      independentReview: false,
    };
    await addReview(review, workspace);
  }
  return publish(workspace, output);
}
