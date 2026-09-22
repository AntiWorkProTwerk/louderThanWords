// Embedded in the offline HTML. No network requests, models or public writes.
(() => {
  'use strict';
  const packet = JSON.parse(document.getElementById('packet-data').textContent);
  const { corpus } = packet;
  let dataset = structuredClone(packet.dataset),
    index = 0,
    step = 0,
    dirty = false;
  let drafts = dataset.cases.map(fromAnnotation);
  const $ = (id) => document.getElementById(id);
  const personName = (id) => corpus.people.find((p) => p.id === id)?.name ?? 'Unresolved speaker';
  const measureName = (id) =>
    corpus.measures.find((m) => m.id === id)?.title ?? 'No specific bill established';
  const passage = () => corpus.passages.find((p) => p.id === dataset.cases[index].passageId);
  const sourceFor = (id) => corpus.sources.find((s) => s.id === id);
  const normalized = (text) => text.replace(/\r\n?/g, '\n');
  const choices = {
    type: [
      ['voting_intention', 'A stated intention to vote'],
      ['conditional', 'A position dependent on a condition'],
      ['position', 'Support for or opposition to a specific proposal'],
      ['policy', 'A general policy position'],
      ['aspiration', 'A desired outcome, without a commitment'],
      ['description', 'A factual description, not a promise'],
    ],
    stance: [
      ['support', 'Supports the target'],
      ['oppose', 'Opposes the target'],
      ['unclear', 'No clear support or opposition'],
    ],
    sentiment: [
      ['positive', 'Positive tone'],
      ['negative', 'Negative tone'],
      ['neutral', 'Neutral tone'],
      ['mixed', 'Mixed tone'],
      ['not_assessed', 'I cannot defensibly assess the tone'],
    ],
    kind: [
      ['passage', 'Final passage vote'],
      ['amendment', 'Amendment vote'],
      ['procedure', 'Procedural vote'],
      ['table', 'Motion to table (set aside)'],
      ['combined_passage', 'Combined suspension and passage'],
      ['sponsorship', 'Sponsorship'],
      ['voice', 'Chamber voice vote'],
    ],
    vote: ['Yea', 'Nay', 'Present', 'Not Voting', 'Sponsored', 'Chamber action'].map((v) => [v, v]),
    chronology: [
      ['statement_before_action', 'Statement demonstrably before the action'],
      ['same_day_order_unknown', 'Same day; order cannot be established'],
      ['action_before_statement', 'Action demonstrably before the statement'],
      ['unknown', 'Timing cannot be established'],
    ],
    relevance: [
      ['yes', 'Yes — a relevant action by this person on the supported target'],
      ['no', 'No — this is not a relevant comparison'],
    ],
    assessments: [
      ['consistent', 'Consistent — the statement and action align'],
      ['apparent_tension', 'Apparent tension — comparable evidence points in different directions'],
      ['context_dependent', 'Needs more context — a fair conclusion is not established'],
    ],
  };
  const peopleOptions = [
    ['', 'Unresolved / I have not established the speaker'],
    ...corpus.people.map((p) => [p.id, p.name]),
  ];
  const targetOptions = [
    ['', 'Choose a target…'],
    ['none', 'No specific bill can be established'],
    ...corpus.measures.map((m) => [m.id, m.title]),
  ];
  function fromAnnotation(c) {
    return {
      person: c.expectedPersonId ?? '',
      quote: c.expectedQuote,
      decision: c.expectedClaims.length ? 'yes' : '',
      claims: c.expectedClaims.map((c) => ({
        ...c,
        targetId: c.targetId ?? 'none',
        conditions: c.conditions.join('\n'),
        qualifiers: c.qualifiers.join('\n'),
      })),
      pairs: c.pairs.map((p) => ({
        ...p,
        relevant: p.relevant ? 'yes' : 'no',
        expectedPersonId: p.expectedPersonId ?? '',
        expectedTime: p.expectedTime ?? '',
        acceptableAssessments: [...p.acceptableAssessments],
      })),
      notes: c.notes,
      reviewer: c.reviewer,
      checks: [false, false, false, false],
    };
  }
  function node(tag, text, className) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  }
  function options(select, items, value) {
    select.replaceChildren(
      ...items.map(([v, label]) => {
        const o = node('option', label);
        o.value = v;
        return o;
      }),
    );
    select.value = value;
  }
  function selectField(parent, key, label, items, value, hint = '') {
    const wrapper = node('div'),
      l = node('label', label),
      select = node('select');
    select.dataset.field = key;
    options(select, items, value);
    l.append(select);
    wrapper.append(l);
    if (hint) wrapper.append(node('p', hint, 'hint'));
    parent.append(wrapper);
    return select;
  }
  function textField(parent, key, label, value, hint = '', type = 'textarea') {
    const wrapper = node('div'),
      l = node('label', label),
      input = node(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    else input.rows = 2;
    input.dataset.field = key;
    input.value = value;
    l.append(input);
    wrapper.append(l);
    if (hint) wrapper.append(node('p', hint, 'hint'));
    parent.append(wrapper);
    return input;
  }
  function externalLink(parent, url, label) {
    if (!url) return;
    const a = node('a', label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    parent.append(a);
  }
  function details(parent, title, text) {
    const d = node('details');
    d.append(node('summary', title), node('pre', text, 'source-text'));
    parent.append(d);
    return d;
  }
  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
  }
  function fields(container) {
    return Object.fromEntries(
      [...container.querySelectorAll('[data-field]')].map((n) => [n.dataset.field, n.value]),
    );
  }
  function capture() {
    const d = drafts[index];
    d.person = $('person').value;
    d.quote = $('expected-quote').value;
    d.decision = $('claim-decision').value;
    d.notes = $('notes').value;
    d.reviewer = $('reviewer').value;
    d.checks = ['check-source', 'check-claims', 'check-actions', 'check-independent'].map(
      (id) => $(id).checked,
    );
    d.claims = [...$('claim-list').querySelectorAll('.claim-card')].map(fields);
    d.pairs = [...$('action-list').querySelectorAll('.action-editor')].map((el) => ({
      ...fields(el),
      actionId: el.dataset.actionId,
      acceptableAssessments: [...el.querySelectorAll('input[data-assessment]:checked')].map(
        (n) => n.dataset.assessment,
      ),
    }));
  }
  function changed() {
    capture();
    dirty = true;
    if (dataset.cases[index].status !== 'pending') {
      dataset.cases[index].status = 'pending';
      dataset.cases[index].reviewedAt = null;
      message('You edited a reviewed case. It is pending again until you explicitly review it.');
    }
  }
  function renderClaims() {
    $('claim-list').replaceChildren();
    drafts[index].claims.forEach((claim, i) => {
      const card = node('div', undefined, 'claim-card');
      card.append(node('h3', 'Statement ' + (i + 1)));
      selectField(
        card,
        'targetId',
        'What proposal is this about?',
        targetOptions,
        claim.targetId,
        'Use a specific bill only when the words or the sourced debate context establish it. A shared topic alone is not enough.',
      );
      selectField(
        card,
        'type',
        'What kind of statement is it?',
        [['', 'Choose the most specific description…'], ...choices.type],
        claim.type,
        'For an explicit vote intention, use “intention to vote” and still record every condition below. Otherwise prefer a conditional position when support depends on a requirement.',
      );
      const grid = node('div', undefined, 'field-grid');
      card.append(grid);
      selectField(
        grid,
        'stance',
        'Does the person support the target?',
        [['', 'Choose a stance…'], ...choices.stance],
        claim.stance,
      );
      selectField(
        grid,
        'sentiment',
        'What is the tone?',
        [['', 'Choose a tone…'], ...choices.sentiment],
        claim.sentiment,
        'Tone is not stance: someone can calmly oppose a bill.',
      );
      textField(
        card,
        'conditions',
        'Only if… (exact words, one condition per line)',
        claim.conditions,
        'A prerequisite, such as “if funding is restored.” Copy the source wording. Leave blank only if none.',
      );
      textField(
        card,
        'qualifiers',
        'Limits or exceptions (exact words, one per line)',
        claim.qualifiers,
        'For example “only for small towns” or “except in emergencies.” Preserve negation; do not paraphrase.',
      );
      const remove = node('button', 'Remove this statement', 'remove');
      remove.onclick = () => {
        capture();
        drafts[index].claims.splice(i, 1);
        renderClaims();
        changed();
      };
      card.append(remove);
      $('claim-list').append(card);
    });
    $('add-claim').disabled = drafts[index].decision !== 'yes';
  }
  function renderActions() {
    $('action-list').replaceChildren();
    const d = drafts[index],
      p = passage();
    $('action-help').textContent =
      'All ' +
      corpus.actions.length +
      ' scoped actions are available below. Start with the verified speaker’s actions; the collection code proposed ' +
      personName(p.personId) +
      '. Adding an action does not mark it relevant or approve a finding.';
    // Original inventory order: no model retrieval or suggested match selection.
    corpus.actions.forEach((a) => {
      const section = node('details', undefined, 'card action-card'),
        summary = node('summary');
      summary.append(
        node('span', personName(a.personId) + ' · ' + a.date + ' · ' + a.question),
        node('span', a.rawVote + ' (collection proposal)', 'badge'),
      );
      section.append(summary);
      const s = sourceFor(a.sourceId);
      externalLink(section, s.url, 'Open original action record ↗');
      section.append(
        node('p', 'Proposed target: ' + measureName(a.measureId)),
        node(
          'p',
          'Collection code reports ' +
            a.vote +
            '; time ' +
            (a.time ?? 'unknown') +
            '. Text version: ' +
            a.operativeText +
            '.',
          'notice',
        ),
      );
      details(section, 'Read saved action evidence', s.text);
      const existing = d.pairs.find((pair) => pair.actionId === a.id);
      if (!existing) {
        const add = node('button', 'Review this action');
        add.onclick = () => {
          capture();
          drafts[index].pairs.push({
            actionId: a.id,
            relevant: '',
            actionKind: '',
            expectedPersonId: '',
            expectedVote: '',
            expectedDate: '',
            expectedTime: '',
            chronology: '',
            acceptableAssessments: [],
          });
          renderActions();
          changed();
        };
        section.append(add);
      } else {
        section.open = true;
        const editor = node('div', undefined, 'action-editor');
        editor.dataset.actionId = a.id;
        editor.append(node('h3', 'Your independent action check'));
        selectField(
          editor,
          'relevant',
          'Is this a relevant comparison?',
          [['', 'Decide after reading…'], ...choices.relevance],
          existing.relevant,
          'Relevance is not agreement. A relevant action may align, differ, or need more context. Mark a plausible but incorrect match “No” and explain why.',
        );
        selectField(
          editor,
          'expectedPersonId',
          'Whose action does the original record establish?',
          peopleOptions,
          existing.expectedPersonId,
        );
        const grid = node('div', undefined, 'field-grid');
        editor.append(grid);
        selectField(
          grid,
          'actionKind',
          'What kind of action was it?',
          [['', 'Choose the action type…'], ...choices.kind],
          existing.actionKind,
        );
        selectField(
          grid,
          'expectedVote',
          'What did the record say?',
          [['', 'Choose the recorded action…'], ...choices.vote],
          existing.expectedVote,
        );
        textField(
          grid,
          'expectedDate',
          'Action date',
          existing.expectedDate,
          'Use the date in the original record.',
          'date',
        );
        textField(
          grid,
          'expectedTime',
          'Verified time, if known',
          existing.expectedTime,
          'Optional ISO time with zone, e.g. 2025-01-07T13:27:00-05:00. Leave blank if unknown; do not use a fetch time.',
          'text',
        );
        selectField(
          editor,
          'chronology',
          'Which came first?',
          [['', 'Choose what the evidence establishes…'], ...choices.chronology],
          existing.chronology,
          'The statement date is ' +
            p.eventDate +
            '; its event time is ' +
            (p.eventTime ?? 'not established') +
            '. A publication timestamp is not proof of speech time.',
        );
        editor.append(
          node('h4', 'Which conclusions could the evidence support?'),
          node(
            'p',
            'Select all defensible options for a relevant pair. For an irrelevant action, leave all unchecked.',
            'hint',
          ),
        );
        choices.assessments.forEach(([value, label]) => {
          const l = node('label', undefined, 'check'),
            input = node('input');
          input.type = 'checkbox';
          input.dataset.assessment = value;
          input.checked = existing.acceptableAssessments.includes(value);
          l.append(input, document.createTextNode(label));
          editor.append(l);
        });
        const remove = node('button', 'Remove this action review', 'remove');
        remove.onclick = () => {
          capture();
          drafts[index].pairs = drafts[index].pairs.filter((pair) => pair.actionId !== a.id);
          renderActions();
          changed();
        };
        editor.append(remove);
        section.append(editor);
      }
      $('action-list').append(section);
    });
  }
  function renderCase() {
    const c = dataset.cases[index],
      d = drafts[index],
      p = passage(),
      s = sourceFor(p.sourceId),
      text = normalized(s.text);
    $('case').value = String(index);
    $('case-heading').textContent =
      'CASE ' + (index + 1) + ' / ' + dataset.cases.length + ' · ' + p.eventDate;
    $('source-title').textContent = s.title;
    $('source-caption').textContent =
      'Archived source dated ' + s.date + '. Saved ' + s.fetchedAt.slice(0, 10) + '.';
    $('source').hidden = !s.url;
    if (s.url) $('source').href = s.url;
    $('parser-person').textContent =
      'Collection code proposes: ' +
      personName(p.personId) +
      '. This is not a verified answer for your review.';
    $('quote').textContent = text.slice(p.start, p.end);
    document
      .querySelectorAll('.repeat-quote')
      .forEach((n) => (n.textContent = text.slice(p.start, p.end)));
    const mark = node('mark', text.slice(p.start, p.end));
    mark.id = 'source-span';
    $('context').replaceChildren(
      document.createTextNode(text.slice(0, p.start)),
      mark,
      document.createTextNode(text.slice(p.end)),
    );
    $('identity-evidence').textContent = p.identityEvidence;
    $('passage-context').textContent = p.context;
    options($('person'), peopleOptions, d.person);
    $('expected-quote').value = d.quote;
    $('claim-decision').value = d.decision;
    $('notes').value = d.notes;
    $('reviewer').value = d.reviewer;
    ['check-source', 'check-claims', 'check-actions', 'check-independent'].forEach(
      (id, i) => ($(id).checked = d.checks[i]),
    );
    renderClaims();
    renderActions();
    updateSummary();
    $('previous').disabled = index === 0;
    $('next').disabled = index === dataset.cases.length - 1;
    $('technical').textContent =
      'Frozen dataset ' +
      dataset.id +
      ' · corpus fingerprint ' +
      dataset.corpusHash +
      ' · ' +
      c.group +
      ' · ' +
      c.split +
      '. These identifiers are preserved automatically.';
    showStep(step, false);
  }
  function updateSummary() {
    const d = drafts[index],
      c = dataset.cases[index];
    $('review-summary').replaceChildren(
      ...[
        'Speaker: ' + personName(d.person),
        'Passage: ' +
          (d.quote.length ? d.quote.length + ' characters recorded' : 'not yet verified'),
        'Statements: ' +
          d.claims.length +
          ' card(s); decision: ' +
          ({ yes: 'eligible statement found', no: 'no eligible statement', unsure: 'not sure' }[
            d.decision
          ] ?? 'not yet answered'),
        'Actions: ' +
          d.pairs.length +
          ' review(s). Missing or unreviewed evidence is not assumed correct.',
      ].map((text) => node('p', text)),
    );
    $('case-status').textContent =
      c.status === 'human_reviewed'
        ? 'Human-reviewed by ' + c.reviewer + ' at ' + c.reviewedAt + '.'
        : 'This case is ' +
          c.status.replace('_', ' ') +
          '. It does not count as independent reviewed evidence yet.';
    $('progress').textContent =
      dataset.cases.filter((c) => c.status === 'human_reviewed').length +
      ' / ' +
      dataset.cases.length +
      ' human-reviewed';
  }
  function showStep(next, scroll = true) {
    step = next;
    document
      .querySelectorAll('[data-panel]')
      .forEach((n) => (n.hidden = Number(n.dataset.panel) !== step));
    document.querySelectorAll('[data-step]').forEach((n) => {
      if (Number(n.dataset.step) === step) n.setAttribute('aria-current', 'step');
      else n.removeAttribute('aria-current');
    });
    $('step-back').disabled = step === 0;
    $('step-next').hidden = step === 3;
    if (step === 3) updateSummary();
    if (scroll)
      document.querySelector('.step-nav').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  function hasChoices(d) {
    return (
      d.claims.every((c) => c.targetId && c.type && c.stance && c.sentiment) &&
      d.pairs.every(
        (p) => p.relevant && p.actionKind && p.expectedVote && p.expectedDate && p.chronology,
      )
    );
  }
  const lines = (text) =>
    text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  function materialize(i) {
    const d = drafts[i],
      c = structuredClone(dataset.cases[i]);
    c.expectedPersonId = d.person || null;
    c.expectedQuote = normalized(d.quote);
    c.notes = d.notes;
    c.reviewer = d.reviewer;
    // Incomplete cards remain in the private draft extension, never guessed labels.
    c.expectedClaims = d.claims
      .filter((c) => c.targetId && c.type && c.stance && c.sentiment)
      .map((c) => ({
        targetId: c.targetId === 'none' ? null : c.targetId,
        type: c.type,
        stance: c.stance,
        sentiment: c.sentiment,
        conditions: lines(c.conditions),
        qualifiers: lines(c.qualifiers),
      }));
    c.pairs = d.pairs
      .filter((p) => p.relevant && p.actionKind && p.expectedVote && p.expectedDate && p.chronology)
      .map((p) => ({
        actionId: p.actionId,
        relevant: p.relevant === 'yes',
        actionKind: p.actionKind,
        expectedPersonId: p.expectedPersonId || null,
        expectedVote: p.expectedVote,
        expectedDate: p.expectedDate,
        expectedTime: p.expectedTime || null,
        chronology: p.chronology,
        acceptableAssessments: p.acceptableAssessments,
      }));
    return c;
  }
  // Validate the embedded Zod-generated JSON schema offline before accepting data.
  function validate(value, schema, path = 'file') {
    if (Array.isArray(schema.type)) {
      return validate(value, { anyOf: schema.type.map((type) => ({ ...schema, type })) }, path);
    }
    if (schema.anyOf) {
      if (
        !schema.anyOf.some((s) => {
          try {
            validate(value, s, path);
            return true;
          } catch {
            return false;
          }
        })
      )
        throw Error(path + ': invalid value.');
      return;
    }
    if (schema.const !== undefined && value !== schema.const)
      throw Error(path + ': wrong fixed value.');
    if (schema.enum && !schema.enum.includes(value))
      throw Error(path + ': choose an allowed value.');
    const type = schema.type;
    if (type === 'null') {
      if (value !== null) throw Error(path + ': expected null.');
      return;
    }
    if (type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error(path + ': expected an object.');
      for (const key of schema.required ?? [])
        if (!(key in value)) throw Error(path + ': missing ' + key);
      for (const [key, s] of Object.entries(schema.properties ?? {}))
        if (key in value) validate(value[key], s, path + '.' + key);
    } else if (type === 'array') {
      if (!Array.isArray(value)) throw Error(path + ': expected a list.');
      value.forEach((v, i) => validate(v, schema.items, path + '[' + i + ']'));
    } else if (type && typeof value !== type) throw Error(path + ': expected ' + type + '.');
    if (typeof value === 'string') {
      if (schema.pattern && !new RegExp(schema.pattern).test(value))
        throw Error(path + ': invalid text format.');
      if (schema.minLength && value.length < schema.minLength)
        throw Error(path + ': text is too short.');
      if (['date', 'date-time'].includes(schema.format) && !Number.isFinite(Date.parse(value)))
        throw Error(path + ': invalid date/time.');
    }
  }
  function validateSet(next) {
    validate(next, packet.schema);
    for (const key of ['formatVersion', 'id', 'corpusHash', 'createdAt', 'splitSeed'])
      if (next[key] !== packet.dataset[key])
        throw Error('That file belongs to a different frozen dataset.');
    if (next.cases.length !== dataset.cases.length)
      throw Error('The file must preserve every case.');
    next.cases.forEach((c, i) => {
      for (const key of ['passageId', 'sourceHash', 'group', 'split'])
        if (c[key] !== packet.dataset.cases[i][key])
          throw Error('Case identifiers, order and split must not change.');
      const checkPerson = (id) => {
        if (id !== null && !corpus.people.some((p) => p.id === id))
          throw Error('Unknown person in review.');
      };
      checkPerson(c.expectedPersonId);
      if (
        c.status === 'human_reviewed' &&
        (!c.reviewer.trim() || !c.expectedQuote || !c.reviewedAt)
      )
        throw Error('Human-reviewed cases require a reviewer, time and quotation.');
      c.expectedClaims.forEach((claim) => {
        if (claim.targetId !== null && !corpus.measures.some((m) => m.id === claim.targetId))
          throw Error('Unknown target in review.');
      });
      if (new Set(c.pairs.map((p) => p.actionId)).size !== c.pairs.length)
        throw Error('Duplicate action review.');
      c.pairs.forEach((pair) => {
        if (!corpus.actions.some((a) => a.id === pair.actionId))
          throw Error('Unknown action in review.');
        checkPerson(pair.expectedPersonId);
      });
    });
  }
  function complete() {
    capture();
    const d = drafts[index];
    try {
      if (!d.checks.every(Boolean))
        throw Error(
          'Please finish the source, meaning, action and independent-review checkboxes before marking this reviewed. You can always keep it pending.',
        );
      if (!d.reviewer.trim() || !d.quote.trim())
        throw Error('Add your reviewer name and the exact verified passage.');
      if (!['yes', 'no'].includes(d.decision))
        throw Error('Decide whether there is an eligible statement, or keep the case pending.');
      if (d.decision === 'yes' && (!d.person || !d.claims.length))
        throw Error(
          'An eligible statement needs an established speaker and at least one statement card.',
        );
      if (d.decision === 'no' && (d.claims.length || !d.notes.trim()))
        throw Error(
          'For no eligible statement, remove statement cards and explain the exclusion in your notes.',
        );
      if (!hasChoices(d))
        throw Error(
          'Some statement or action fields are unanswered. Complete them or leave the case pending.',
        );
      if (
        d.pairs.some((p) =>
          p.relevant === 'yes' ? !p.acceptableAssessments.length : p.acceptableAssessments.length,
        )
      )
        throw Error(
          'Choose a defensible conclusion for each relevant action; leave conclusions unchecked for irrelevant actions.',
        );
      const c = materialize(index),
        next = structuredClone(dataset);
      c.status = 'human_reviewed';
      c.reviewedAt = new Date().toISOString();
      next.cases[index] = c;
      validateSet(next);
      dataset = next;
      dirty = true;
      updateSummary();
      message(
        'Case marked human-reviewed. Download your progress to save it. This does not publish a finding.',
      );
    } catch (e) {
      message(e.message, true);
      $('message').scrollIntoView({ block: 'center' });
    }
  }
  function navigate(next) {
    capture();
    index = next;
    step = 0;
    renderCase();
    $('workspace').scrollIntoView({ block: 'start' });
  }
  function validateDrafts(input, imported) {
    if (!Array.isArray(input) || input.length !== imported.cases.length)
      throw Error('Invalid saved worksheet drafts.');
    input.forEach((d, i) => {
      if (
        !d ||
        !['person', 'quote', 'decision', 'notes', 'reviewer'].every(
          (k) => typeof d[k] === 'string',
        ) ||
        !Array.isArray(d.claims) ||
        !Array.isArray(d.pairs) ||
        !Array.isArray(d.checks) ||
        d.checks.length !== 4 ||
        !d.checks.every((v) => typeof v === 'boolean')
      )
        throw Error('Invalid draft fields.');
      if (
        !['', 'yes', 'no', 'unsure'].includes(d.decision) ||
        !peopleOptions.some(([id]) => id === d.person)
      )
        throw Error('Invalid saved draft choice.');
      d.claims.forEach((c) => {
        if (
          !c ||
          !['targetId', 'type', 'stance', 'sentiment', 'conditions', 'qualifiers'].every(
            (k) => typeof c[k] === 'string',
          )
        )
          throw Error('Invalid statement draft.');
        for (const key of ['type', 'stance', 'sentiment'])
          if (c[key] && !choices[key].some(([v]) => v === c[key]))
            throw Error('Unknown statement draft choice.');
        if (!targetOptions.some(([v]) => v === c.targetId)) throw Error('Unknown draft target.');
      });
      if (new Set(d.pairs.map((p) => p.actionId)).size !== d.pairs.length)
        throw Error('Duplicate action drafts.');
      d.pairs.forEach((p) => {
        if (
          !p ||
          ![
            'actionId',
            'relevant',
            'actionKind',
            'expectedPersonId',
            'expectedVote',
            'expectedDate',
            'expectedTime',
            'chronology',
          ].every((k) => typeof p[k] === 'string') ||
          !Array.isArray(p.acceptableAssessments) ||
          !p.acceptableAssessments.every((a) => choices.assessments.some(([v]) => v === a)) ||
          !corpus.actions.some((a) => a.id === p.actionId)
        )
          throw Error('Invalid action draft.');
        for (const [key, list] of [
          ['relevant', 'relevance'],
          ['actionKind', 'kind'],
          ['expectedVote', 'vote'],
          ['chronology', 'chronology'],
        ])
          if (p[key] && !choices[list].some(([v]) => v === p[key]))
            throw Error('Unknown draft action choice.');
        if (!peopleOptions.some(([id]) => id === p.expectedPersonId))
          throw Error('Unknown draft person.');
      });
      // Reviewed labels are canonical. Do not let a draft silently replace them.
      if (imported.cases[i].status !== 'pending') input[i] = fromAnnotation(imported.cases[i]);
    });
    return input;
  }
  $('start').onclick = () => {
    $('welcome').hidden = true;
    $('workspace').hidden = false;
    $('workspace').scrollIntoView({ block: 'start' });
  };
  $('back-intro').onclick = () => {
    capture();
    $('welcome').hidden = false;
    $('workspace').hidden = true;
    window.scrollTo(0, 0);
  };
  $('use-quote').onclick = () => {
    $('expected-quote').value = $('quote').textContent;
    changed();
    message(
      'Passage copied as a starting point. Check the boundaries and speaker before confirming your review.',
    );
  };
  $('jump-span').onclick = () => $('source-span').scrollIntoView({ block: 'center' });
  $('claim-decision').onchange = () => {
    changed();
    renderClaims();
  };
  $('add-claim').onclick = () => {
    capture();
    drafts[index].claims.push({
      targetId: '',
      type: '',
      stance: '',
      sentiment: '',
      conditions: '',
      qualifiers: '',
    });
    renderClaims();
    changed();
  };
  $('workspace').addEventListener('input', (e) => {
    if (e.target.matches('input:not([type=file]),textarea,select') && e.target.id !== 'case')
      changed();
  });
  // Some browser/select interactions dispatch change but not input.
  $('workspace').addEventListener('change', (e) => {
    if (e.target.matches('select,input[type=checkbox]') && e.target.id !== 'case') changed();
  });
  document.querySelectorAll('[data-step]').forEach(
    (n) =>
      (n.onclick = () => {
        capture();
        showStep(Number(n.dataset.step));
      }),
  );
  $('step-back').onclick = () => {
    capture();
    showStep(step - 1);
  };
  $('step-next').onclick = () => {
    capture();
    showStep(step + 1);
  };
  $('previous').onclick = () => navigate(index - 1);
  $('next').onclick = () => navigate(index + 1);
  $('case').onchange = (e) => navigate(Number(e.target.value));
  $('pending').onclick = () => {
    capture();
    dataset.cases[index].status = 'pending';
    dataset.cases[index].reviewedAt = null;
    dirty = true;
    updateSummary();
    message('Kept pending. Your notes and unfinished answers will be included in the download.');
  };
  $('complete').onclick = complete;
  $('download').onclick = () => {
    try {
      capture();
      const next = {
        ...dataset,
        cases: dataset.cases.map((c, i) => (c.status === 'pending' ? materialize(i) : c)),
      };
      validateSet(next);
      const saved = { ...next, _worksheet: { version: 1, drafts } };
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }),
        ),
        a = node('a');
      a.href = url;
      a.download = dataset.id + '-annotations.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message(
        'Download requested. Check your Downloads folder. Pending answers and unfinished cards are included; resume with this file.',
      );
      // Keep unload warning: requesting a download cannot prove the user saved it.
    } catch (e) {
      message(e.message, true);
    }
  };
  $('import').onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10_000_000) throw Error('Saved review file is too large.');
      const next = JSON.parse(await file.text());
      validateSet(next);
      const resumed = next._worksheet
        ? (() => {
            if (next._worksheet.version !== 1) throw Error('Unsupported worksheet draft version.');
            return validateDrafts(next._worksheet.drafts, next);
          })()
        : next.cases.map(fromAnnotation);
      if (
        dirty &&
        !confirm(
          'Replace this tab’s unsaved edits with the selected file? Download first if you want to keep both.',
        )
      )
        return;
      delete next._worksheet;
      dataset = next;
      drafts = resumed;
      dirty = false;
      renderCase();
      message(
        'Saved review loaded. Existing human labels are preserved; pending drafts are ready to continue.',
      );
    } catch (error) {
      message(error.message, true);
    } finally {
      e.target.value = '';
    }
  };
  dataset.cases.forEach((c, i) => {
    const p = corpus.passages.find((p) => p.id === c.passageId),
      o = node('option', i + 1 + ' · ' + personName(p.personId) + ' · ' + p.eventDate);
    o.value = String(i);
    $('case').append(o);
  });
  $('scope-summary').textContent =
    corpus.scope.title +
    '. The collection window is ' +
    corpus.scope.from +
    ' through ' +
    corpus.scope.through +
    '. ' +
    corpus.scope.eligibility;
  $('measure-summary').textContent =
    'Available legislation: ' +
    corpus.measures.map((m) => m.title).join('; ') +
    '. Read the archived text below when deciding what the proposal actually says; you do not need to know this bill beforehand.';
  [
    [dataset.cases.length, 'passages to review'],
    [corpus.people.length, 'people in the roster'],
    [corpus.actions.length, 'individual/scoped actions'],
    [corpus.measures.length, 'bill or measure record(s)'],
  ].forEach(([count, label]) => {
    const div = node('div');
    div.append(node('strong', String(count)), node('span', label));
    $('counts').append(div);
  });
  const groups = new Set(dataset.cases.map((c) => c.group)).size,
    held = dataset.cases.filter((c) => c.split === 'held_out').length;
  $('benchmark-limit').textContent =
    'This packet has ' +
    groups +
    ' independent bill/day group(s) and ' +
    held +
    ' held-out passages. “Held-out” means reserved for testing rather than tuning the system. ' +
    (held === 0
      ? 'These cases are development examples, not the final accuracy test. '
      : 'Keep the fixed testing split unchanged. ') +
    'The full benchmark still needs at least 200 human-reviewed cases across independent bill/day groups, with development and held-out examples. Reviewing this pilot does not by itself establish an accuracy score.';
  corpus.measures.forEach((m) => {
    const section = node('section');
    section.append(node('h3', m.title));
    m.versions.forEach((v) => {
      const s = sourceFor(v.sourceId);
      section.append(
        node(
          'p',
          'Available version: ' +
            v.id +
            ' · issued ' +
            v.issued +
            '. This is not automatically the version voted on.',
          'notice',
        ),
      );
      externalLink(section, s.url, 'Open original bill text ↗');
      details(section, 'Read full saved bill text', s.text);
    });
    $('measures').append(section);
  });
  $('guide').textContent = packet.guide;
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  renderCase();
})();
