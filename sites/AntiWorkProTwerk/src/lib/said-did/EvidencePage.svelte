<script lang="ts">
  import { browser, dev } from '$app/environment';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { createQuery } from '@tanstack/svelte-query';
  import type { loadEvidence } from './load';
  import { assessmentLabels, actionLabels, assessments } from './schema';
  import { evidenceRepository } from './repository';
  import EvidenceCard from './EvidenceCard.svelte';
  let { evidence }: { evidence: Awaited<ReturnType<typeof loadEvidence>>['evidence'] } = $props();
  const repository = evidenceRepository(base);
  const isDemo = $derived(
    evidence.comparison
      ? evidence.comparison.person.fictional
      : evidence.manifest.scope.mode === 'demo',
  );
  let reduced = $state(false),
    copyStatus = $state(''),
    correction = $state(''),
    correctionStatus = $state('');
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const query = $derived(params.get('q') ?? ''),
    stateFilter = $derived(params.get('state') ?? 'all'),
    assessment = $derived(params.get('assessment') ?? 'all'),
    policy = $derived(params.get('policy') ?? 'all'),
    action = $derived(params.get('action') ?? 'all'),
    chamber = $derived(params.get('chamber') ?? 'all'),
    from = $derived(params.get('from') ?? ''),
    through = $derived(params.get('through') ?? ''),
    strict = $derived(params.get('ordered') === 'true');
  const pageNumber = $derived(Math.max(1, Number(params.get('p')) || 1));
  const filtered = $derived(
    evidence.index.items
      .filter(
        (item) =>
          (evidence.kind !== 'members' || item.personId === evidence.person?.id) &&
          (evidence.kind !== 'measures' || item.measureId === evidence.measure?.id) &&
          (stateFilter === 'all' || item.state === stateFilter) &&
          (assessment === 'all' || item.assessment === assessment) &&
          (policy === 'all' || item.policy === policy) &&
          (action === 'all' || item.actionKind === action) &&
          (chamber === 'all' || item.chamber === chamber) &&
          (!from || item.actionDate >= from) &&
          (!through || item.actionDate <= through) &&
          (!strict || item.statementDate < item.actionDate) &&
          `${item.name} ${item.measureId} ${item.measureTitle} ${item.policy} ${item.quote}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) => b.actionDate.localeCompare(a.actionDate)),
  );
  const visible = $derived(filtered.slice((pageNumber - 1) * 12, pageNumber * 12));
  const title = $derived(
    evidence.kind === 'comparisons'
      ? `${evidence.comparison!.person.name}: ${evidence.comparison!.measure.title}`
      : evidence.kind === 'members'
        ? `${evidence.person!.name} · The record`
        : evidence.kind === 'measures'
          ? evidence.measure!.title
          : evidence.kind === 'methodology'
            ? 'Evidence, not a verdict'
            : 'The evidence ledger',
  );
  const description = $derived(
    evidence.comparison
      ? `${evidence.comparison.statement.eventDate} recorded statement; ${actionLabels[evidence.comparison.action.kind]} on ${evidence.comparison.action.date}. ${evidence.comparison.limitations.join(' ')}`
      : `Explore recorded statements and legislative actions with sources, chronology and context.${isDemo ? ' Fictional local demonstration; not findings about real politicians.' : ''}`,
  );
  const canonical = $derived(
    new URL(
      page.url.pathname.startsWith(import.meta.env.PUBLIC_SITE_PATH)
        ? page.url.pathname
        : `${import.meta.env.PUBLIC_SITE_PATH}${page.url.pathname}`,
      `https://${import.meta.env.PUBLIC_SITE_DOMAIN}`,
    ).href,
  );
  const manifestQuery = createQuery(() => ({
    queryKey: ['said-did-current-manifest'],
    queryFn: ({ signal }) => repository.manifest(signal),
    initialData: evidence.manifest,
    refetchInterval: 30000,
    staleTime: 0,
  }));
  const newRelease = $derived(manifestQuery.data?.release !== evidence.manifest.release);
  const c = $derived(evidence.comparison);
  const statementTerm = $derived(
    c?.person.terms.find(
      (term) => term.from <= c.statement.eventDate && term.to >= c.statement.eventDate,
    ),
  );
  const timeline = $derived(
    c
      ? [
          {
            date: c.statement.eventDate,
            title: 'Position entered in the record',
            text: c.statement.kind.replaceAll('_', ' '),
            source: 'statement',
          },
          {
            date: c.measure.versions.find((v) => v.id === c.action.versionId)?.issued ?? '',
            title: 'Operative text identified',
            text:
              c.action.operativeText === 'changed'
                ? 'Text changed; the comparison remains context dependent.'
                : (c.action.versionId ?? ''),
            source: 'provision',
          },
          {
            date: c.action.date,
            title: `${actionLabels[c.action.kind]}: ${c.action.vote}`,
            text: c.action.question,
            source: 'action',
          },
        ].sort((a, b) => a.date.localeCompare(b.date))
      : [],
  );
  const changedSinceLoad = $derived(newRelease && !!c);
  async function setFilter(key: string, value: string, replace = false) {
    const url = new URL(page.url);
    if (value && value !== 'all') url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    if (key !== 'p') url.searchParams.delete('p');
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
  }
  async function copyComparison() {
    if (!c) return;
    const text = `${c.person.name} — ${c.person.fictional ? 'FICTIONAL DEMO. ' : ''}${c.statement.eventDate}: “${c.claim.quote}”\n${c.action.date}: ${actionLabels[c.action.kind]} — ${c.action.question}; ${c.action.vote}.\n${c.chronology === 'same_day_order_unknown' ? 'Same day; order not established.\n' : ''}${c.limitations.join(' ')}\nSources and full context: ${window.location.href}`;
    try {
      await navigator.clipboard.writeText(text);
      copyStatus = 'Copied with dates, source link and qualifications.';
    } catch {
      copyStatus = 'Clipboard unavailable. Use your browser’s copy link action.';
    }
  }
  function downloadCorrection() {
    if (!c || correction.trim().length < 10) {
      correctionStatus = 'Please describe the issue in at least 10 characters.';
      return;
    }
    const request = {
      comparisonId: c.id,
      version: c.version,
      release: evidence.manifest.release,
      note: correction.trim(),
      createdAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(request, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `correction-${c.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    correctionStatus =
      'Correction file downloaded. It has not been sent anywhere; give it to your local reviewer.';
  }
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reduced = media.matches;
    const change = () => (reduced = media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  });
</script>

<svelte:head
  ><title>{title} · Said / Did · Louder Than Words</title><meta
    name="description"
    content={description}
  /><link rel="canonical" href={canonical} /><meta
    property="og:title"
    content={`${title} · Said / Did`}
  /><meta property="og:description" content={description} /><meta
    property="og:url"
    content={canonical}
  /><meta property="og:type" content="article" /><meta
    name="twitter:card"
    content="summary"
  /></svelte:head
>

<div class="evidence-page">
  <nav class="evidence-nav" aria-label="Evidence">
    <a href={`${base}/said-vs-did/`} class:active={evidence.kind === 'explore'}>Explore</a><a
      href={`${base}/said-vs-did/methodology/`}
      class:active={evidence.kind === 'methodology'}>Methodology & coverage</a
    >{#if dev}<a href={`${base}/said-vs-did/review/`}>Local review <span>↗</span></a>{/if}
  </nav>
  <div class="evidence-demo">
    <span>{isDemo ? 'LOCAL PILOT' : 'LOCAL DATASET'}</span>{isDemo
      ? 'Fictional people & records. No findings about real politicians.'
      : 'Reviewed evidence within the declared coverage window. Not a career-wide score.'}
  </div>
  {#if newRelease}<div class="evidence-notice" role="status">
      A new evidence release is available. {#if c}Refresh before relying on this assessment.{/if}<button
        onclick={() => invalidateAll()}>Load current evidence ↻</button
      >
    </div>{/if}
  {#if manifestQuery.isError}<p role="status">
      Could not check publication freshness. Showing the saved release.
    </p>{/if}
  {#key `${evidence.kind}-${c?.id ?? evidence.person?.id ?? evidence.measure?.id ?? ''}`}
    <div in:fly={{ y: reduced ? 0 : 12, duration: reduced ? 0 : 220 }}>
      <header class="evidence-heading">
        <p class="eyebrow">
          {evidence.kind === 'comparisons'
            ? 'A source-backed comparison'
            : evidence.kind === 'members'
              ? 'Member timeline'
              : evidence.kind === 'measures'
                ? 'Policy & measure timeline'
                : 'Follow the evidence'}
        </p>
        <h2>{title}</h2>
        {#if evidence.kind === 'explore'}<p>
            What was said. What was done.<br /><strong>The context that connects them.</strong>
          </p>
        {:else if evidence.kind === 'members'}<p>
            {evidence.person?.terms
              .map(
                (t) =>
                  `${t.party} · ${t.state}-${t.district} · ${t.chamber} · ${t.from} to ${t.to}`,
              )
              .join(' / ')}<br />{evidence.person?.fictional ? 'Fictional member. ' : ''}This
            timeline covers the sample below, not an entire career.
          </p>
        {:else if evidence.kind === 'measures'}<p>{evidence.measure?.policyDefinition}</p>{/if}
      </header>
      {#if evidence.kind === 'methodology'}
        <section class="methodology-grid">
          <article>
            <span>01 / SOURCE FACT</span>
            <h3>What the record contains</h3>
            <p>
              Exact saved passages and the individual vote on the official question. Recorded
              material is not automatically spoken floor debate. Inserted statements are labeled;
              third-party text is excluded.
            </p>
          </article>
          <article>
            <span>02 / CONNECTION</span>
            <h3>Why the records relate</h3>
            <p>
              Explicit measure references first. Debate context and narrowly defined policy
              connections need supporting evidence. Similar sentiment alone never establishes the
              same proposition.
            </p>
          </article>
          <article>
            <span>03 / INTERPRETATION</span>
            <h3>What can be concluded</h3>
            <p>
              Every assessment requires a facts pass and a later contrary-context pass. Conditions,
              procedural votes, changed text and uncertain chronology stay visible. No honesty
              score. No inference of motive.
            </p>
          </article>
        </section>
        <section class="coverage-panel">
          <h3>What this dataset covers</h3>
          <p>{evidence.manifest.scope.eligibility}</p>
          <dl>
            <div>
              <dt>Action window</dt>
              <dd>{evidence.manifest.scope.from} — {evidence.manifest.scope.through}</dd>
            </div>
            <div>
              <dt>Statement lookback</dt>
              <dd>{evidence.manifest.scope.lookbackDays} days</dd>
            </div>
            <div>
              <dt>Sources / passages / actions</dt>
              <dd>
                {evidence.manifest.counts.sources} / {evidence.manifest.counts.passages} / {evidence
                  .manifest.counts.actions}
              </dd>
            </div>
            <div>
              <dt>Last source event</dt>
              <dd>{evidence.manifest.lastSourceDate}</dd>
            </div>
            <div>
              <dt>Published release</dt>
              <dd>{evidence.manifest.publishedAt.slice(0, 10)} · {evidence.manifest.release}</dd>
            </div>
          </dl>
          <h4>Exclusions and gaps</h4>
          {#each evidence.manifest.scope.exclusions as exclusion}<p>{exclusion.reason}</p>{/each}
          <p>
            {evidence.manifest.counts.unmatched} unmatched candidate; {evidence.manifest.counts
              .needsEvidence} candidates with publication blockers. “No match in this dataset” never means
            “did nothing.”
          </p>
        </section>
        <section class="coverage-panel">
          <h3>Local processing, deliberate publication</h3>
          <p>
            Input files → archived source versions → validated claims → candidates → review
            decisions → immutable public snapshots. Browsing never calls a model or government API.
            Unreviewed candidates and raw model output stay on disk, outside the public folder.
          </p>
          <p>
            The demo uses transparent deterministic extraction. External AI extraction files can
            propose meaning, stance and sentiment, but cannot approve or publish. Sentiment is not
            voting intent.
          </p>
          <p>
            The nine synthetic evaluation cases are regression tests, not a 95% real-world accuracy
            claim. Real source verification, held-out evaluation and physical-phone performance
            measurements are still required before a real evidence release.
          </p>
        </section>
      {:else if c}
        <div class="comparison-person">
          <a href={`${base}/said-vs-did/members/${c.person.id}/`}
            ><span class="member-initials"
              >{c.person.name
                .split(' ')
                .map((n) => n[0])
                .join('')}</span
            ><span
              ><strong>{c.person.name}</strong><small
                >{c.party} · {c.state}-{c.district} · {c.chamber} at the action date</small
              ></span
            ></a
          ><a href={`${base}/said-vs-did/measures/${c.measure.id}/`}
            >{c.measure.id.toUpperCase()} ↗</a
          >
        </div>
        {#if c.status !== 'published' || evidence.archived || changedSinceLoad}<div
            class="evidence-notice"
            role="status"
          >
            <strong
              >{evidence.archived
                ? 'Archived revision — not the current finding'
                : c.status === 'withdrawn'
                  ? 'Withdrawn comparison'
                  : 'Review required'}</strong
            >
            <p>
              Do not rely on this as a current assessment. {evidence.archived
                ? `Current status: ${evidence.currentStatus}.`
                : ''}
            </p>
          </div>{/if}
        <div class="comparison-columns">
          <article class="said-column">
            <div class="column-label">
              <span>01</span>
              <h3>
                {c.statement.kind === 'inserted_statement'
                  ? 'Inserted statement'
                  : c.statement.kind === 'floor_verified'
                    ? 'Verified floor statement'
                    : 'Recorded statement'}
              </h3>
            </div>
            <time datetime={c.statement.eventDate}>{c.statement.eventDate}</time>
            {#if statementTerm}<p class="source-provenance">
                {statementTerm.party} · {statementTerm.state}-{statementTerm.district} at the statement
                date
              </p>{/if}
            <blockquote>“{c.claim.quote}”</blockquote>
            {#if c.statement.mediaUrl}<a
                class="source-reference"
                href={c.statement.mediaUrl}
                target="_blank"
                rel="noreferrer">Floor audio/video evidence ↗</a
              >{/if}
            <a class="source-reference" href="#evidence-statement"
              >Saved statement · exact passage ↗</a
            >{#if c.claim.conditions.length}<p class="visible-qualification">
                <strong>Conditional position</strong>Read the complete qualification above.
              </p>{/if}
          </article>
          <article class="did-column">
            <div class="column-label">
              <span>02</span>
              <h3>Legislative action</h3>
            </div>
            <time datetime={c.action.date}>{c.action.date}</time><strong class="vote-choice"
              >{c.action.vote}</strong
            >
            <h4>{actionLabels[c.action.kind]}</h4>
            <p class="official-question">{c.action.question}</p>
            <p>
              {c.action.chamber} · Congress {c.action.congress} · Session {c.action.session}{c
                .action.roll
                ? ` · Roll ${c.action.roll}`
                : ''}
            </p>
            <a class="source-reference" href="#evidence-action">Saved individual action ↗</a>
          </article>
        </div>
        <section class="comparison-reading">
          <div>
            <span class={`assessment ${c.assessment}`}
              >{c.status === 'published' && !evidence.archived && !changedSinceLoad
                ? assessmentLabels[c.assessment]
                : 'Assessment not current'}</span
            ><span class="review-label"
              >{c.reviewMode === 'demo'
                ? 'Demo review fixture'
                : c.reviewMode === 'independent'
                  ? 'Independently reviewed'
                  : 'Two passes · one reviewer'}</span
            >
          </div>
          <h3>Why these are linked</h3>
          <p>
            {c.status === 'published' && !evidence.archived && !changedSinceLoad
              ? c.explanation
              : 'The earlier interpretation is withheld here until you open the current reviewed version.'}
          </p>
          <a href="#evidence-provision">{c.basis.replaceAll('_', ' ')} · operative provision ↗</a>
          <div class="material-context">
            <h4>Context that matters</h4>
            {#each c.limitations as limitation}<p>{limitation}</p>{/each}
            <p>
              {c.chronology === 'same_day_order_unknown'
                ? 'Same day; order not established. This does not demonstrate a subsequent reversal.'
                : 'The supplied statement date precedes the action date.'}
            </p>
          </div>
        </section>
        <section class="record-timeline">
          <h3>The sequence</h3>
          <ol>
            {#each timeline as event}<li>
                <time>{event.date}</time><strong>{event.title}</strong>
                <p>
                  {event.text} · <a href={`#evidence-${event.source}`}>{event.source} source</a>
                </p>
              </li>{/each}
          </ol>
        </section>
        <section class="evidence-sources">
          <h3>Open the evidence</h3>
          <p>
            Saved source excerpts, version hashes and provenance. Fixture documents are local
            examples, not official records.
          </p>
          {#each c.evidence as source}<details id={`evidence-${source.role}`}>
              <summary><span>{source.role.toUpperCase()}</span>{source.title}<b>+</b></summary>
              <div>
                <p class="source-provenance">{source.provider} · {source.date} · {source.page}</p>
                <blockquote>{source.excerpt}</blockquote>
                {#if source.url}<a href={source.url} target="_blank" rel="noreferrer"
                    >Open original document ↗</a
                  >{:else}<p>Local authored fixture · no official original</p>{/if}
                <dl>
                  <div>
                    <dt>Source SHA-256</dt>
                    <dd>{source.hash}</dd>
                  </div>
                  <div>
                    <dt>Saved span</dt>
                    <dd>{source.normalizedStart}–{source.normalizedEnd} · newline-only-v1</dd>
                  </div>
                  <div>
                    <dt>Fetched / modified</dt>
                    <dd>{source.fetchedAt} / {source.modifiedAt}</dd>
                  </div>
                </dl>
              </div>
            </details>{/each}
        </section>
        <section class="comparison-tools">
          <a
            class="evidence-json-download"
            href={`${base}/data/said-did/releases/${evidence.recordRelease}/comparisons/${c.id}.json`}
            download>Download structured evidence JSON ↓</a
          >
          <button class="evidence-primary" onclick={copyComparison}>Copy with context ↗</button
          ><span role="status">{copyStatus}</span>
          <details>
            <summary>Correction history & report an issue</summary>
            <p>
              Version {c.version} · reviewed {c.reviewedAt.slice(0, 10)}. {c.history.length === 0
                ? 'No previous published revisions.'
                : ''}
            </p>
            {#each c.history as h}<p>
                <a href={`${base}/said-vs-did/comparisons/${c.id}/history/${h.release}/`}
                  >Open archived version {h.version} ↗</a
                >
                · {h.note}
              </p>{/each}<label for="correction-note">What should the reviewer check?</label
            ><textarea
              id="correction-note"
              bind:value={correction}
              placeholder="Describe the source, quotation, timing or context issue."
            ></textarea><button onclick={downloadCorrection}>Download correction request</button>
            <p role="status">
              {correctionStatus ||
                'Local only: this downloads a file; nothing is submitted to a service.'}
            </p>
          </details>
        </section>
      {:else}
        <div class="evidence-stats">
          <div>
            <strong>{evidence.manifest.counts.published.toString().padStart(2, '0')}</strong><span
              >Published examples</span
            >
          </div>
          <div>
            <strong
              >{Object.keys(evidence.manifest.states).length.toString().padStart(2, '0')}</strong
            ><span>States in sample</span>
          </div>
          <div>
            <strong>{evidence.manifest.counts.needsEvidence.toString().padStart(2, '0')}</strong
            ><span>Held for evidence</span>
          </div>
        </div>
        {#if evidence.kind === 'measures'}<details class="measure-versions">
            <summary>Measure versions & operative provisions</summary
            >{#each evidence.measure!.versions as v}<p><strong>{v.id}</strong> · {v.issued}</p>
              <blockquote>{v.provision}</blockquote>{/each}
            <p>Version provenance is available in each linked comparison.</p>
          </details>{/if}
        <form class="evidence-filters" onsubmit={(e) => e.preventDefault()}>
          <label class="evidence-search"
            ><span>Search the record</span><input
              type="search"
              placeholder="A person, a bill, a phrase…"
              value={query}
              oninput={(e) => setFilter('q', e.currentTarget.value, true)}
            /></label
          >
          <div class="evidence-filter-row">
            <label
              >State<select
                value={stateFilter}
                onchange={(e) => setFilter('state', e.currentTarget.value)}
                ><option value="all">All states</option
                >{#each Object.keys(evidence.manifest.states).sort() as code}<option value={code}
                    >{code}</option
                  >{/each}{#if stateFilter !== 'all' && !evidence.manifest.states[stateFilter]}<option
                    value={stateFilter}>{stateFilter} · no sample</option
                  >{/if}</select
              ></label
            ><label
              >Assessment<select
                value={assessment}
                onchange={(e) => setFilter('assessment', e.currentTarget.value)}
                ><option value="all">All assessments</option>{#each assessments as a}<option
                    value={a}>{assessmentLabels[a]}</option
                  >{/each}</select
              ></label
            ><label
              >Policy<select
                value={policy}
                onchange={(e) => setFilter('policy', e.currentTarget.value)}
                ><option value="all">All policies</option
                >{#each [...new Set(evidence.index.items.map((i) => i.policy))] as p}<option
                    value={p}>{p}</option
                  >{/each}</select
              ></label
            >
            <details class="more-filters">
              <summary>More filters +</summary>
              <div>
                <label
                  >Action<select
                    value={action}
                    onchange={(e) => setFilter('action', e.currentTarget.value)}
                    ><option value="all">All actions</option
                    >{#each Object.entries(actionLabels) as [key, label]}<option value={key}
                        >{label}</option
                      >{/each}</select
                  ></label
                ><label
                  >Chamber<select
                    value={chamber}
                    onchange={(e) => setFilter('chamber', e.currentTarget.value)}
                    ><option value="all">Both chambers</option><option>House</option><option
                      >Senate</option
                    ></select
                  ></label
                ><label
                  >Action from<input
                    type="date"
                    value={from}
                    onchange={(e) => setFilter('from', e.currentTarget.value)}
                  /></label
                ><label
                  >Through<input
                    type="date"
                    value={through}
                    onchange={(e) => setFilter('through', e.currentTarget.value)}
                  /></label
                ><label class="checkbox-label"
                  ><input
                    type="checkbox"
                    checked={strict}
                    onchange={(e) => setFilter('ordered', e.currentTarget.checked ? 'true' : '')}
                  />Only statements on an earlier date</label
                >
              </div>
            </details>
          </div>
        </form>
        <div class="evidence-results-heading">
          <span
            >{filtered.length}
            {filtered.length === 1 ? 'comparison' : 'comparisons'}
            {stateFilter !== 'all' ? `in ${stateFilter}` : 'in this sample'}</span
          ><span>Latest action first</span>
        </div>
        <div class="evidence-results" aria-live="polite">
          {#each visible as item (item.id)}<EvidenceCard
              {item}
              fictional={evidence.index.people.find((p) => p.id === item.personId)?.fictional}
            />{:else}<div class="evidence-empty">
              <span>∅</span>
              <h3>No matching published evidence</h3>
              <p>
                No matching action was found in this dataset through {evidence.manifest.scope
                  .through}. This does not mean the person did nothing.
              </p>
              <a href={`${base}/said-vs-did/`}>Clear filters and explore the sample ↗</a>
            </div>{/each}
        </div>
        {#if filtered.length > 12}<nav class="evidence-pagination" aria-label="Evidence pages">
            <button
              disabled={pageNumber === 1}
              onclick={() => setFilter('p', String(pageNumber - 1))}>Previous</button
            ><span>Page {pageNumber}</span><button
              disabled={pageNumber * 12 >= filtered.length}
              onclick={() => setFilter('p', String(pageNumber + 1))}>Next</button
            >
          </nav>{/if}
      {/if}
    </div>
  {/key}
  <footer class="evidence-footer">
    <span>Sources → context → understanding</span><a href={`${base}/said-vs-did/methodology/`}
      >Coverage through {evidence.manifest.scope.through} ↗</a
    >
  </footer>
</div>
