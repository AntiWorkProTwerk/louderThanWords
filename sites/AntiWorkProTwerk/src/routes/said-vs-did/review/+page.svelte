<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import {
    assessmentLabels,
    assessments,
    actionLabels,
    type Assessment,
    type Review,
  } from '$lib/said-did/schema';
  import type { Store } from '../../../../scripts/said-did/pipeline';
  import PipelineControls from '$lib/said-did/PipelineControls.svelte';
  import AiReviewPanel from '$lib/said-did/AiReviewPanel.svelte';
  let aiReview = $state<any>(null),
    pilotAiReview = $state<any>(null),
    pilotAvailable = $state(false);
  let model = $state<any>(null),
    evaluation = $state<any>(null),
    evaluationReport = $state<any>(null),
    acquisition = $state<any>(null);
  let store = $state<Store | null>(null),
    token = $state(''),
    message = $state(''),
    busy = $state(false),
    selectedId = $state('');
  let reviewer = $state(''),
    rationale = $state(''),
    explanation = $state(''),
    limitations = $state(''),
    assessment = $state<Assessment>('context_dependent');
  let checks = $state({
      identity: false,
      quote: false,
      action: false,
      text: false,
      chronology: false,
      qualifications: false,
      contraryEvidence: false,
    }),
    factsPassAt = $state(''),
    contextPassAt = $state('');
  const candidate = $derived(store?.candidates.find((c) => c.id === selectedId) ?? null);
  async function refresh() {
    const r = await fetch(`${base}/api/local-evidence`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Start the local Vite development server to use this workbench.');
    const result = await r.json();
    token = result.token;
    store = result.store;
    model = result.model;
    evaluation = result.evaluation;
    evaluationReport = result.evaluationReport;
    acquisition = result.acquisition;
    aiReview = result.aiReview;
    pilotAiReview = result.pilotAiReview;
    pilotAvailable = result.pilotAvailable;
    if (!selectedId && store?.candidates[0]) selectCandidate(store.candidates[0].id);
  }
  function selectCandidate(id: string) {
    selectedId = id;
    const c = store?.candidates.find((c) => c.id === id);
    assessment = c?.suggestedAssessment ?? 'context_dependent';
    explanation = '';
    limitations = c?.cautions.join('\n') ?? '';
    rationale = '';
    checks = {
      identity: false,
      quote: false,
      action: false,
      text: false,
      chronology: false,
      qualifications: false,
      contraryEvidence: false,
    };
    factsPassAt = '';
    contextPassAt = '';
  }
  async function operate(body: unknown) {
    busy = true;
    message = '';
    try {
      const r = await fetch(`${base}/api/local-evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LTW-Local-Review': token },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await refresh();
      message = 'Saved locally. Only approved comparisons enter the published snapshot.';
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  async function ingest(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Use the CLI for inputs over 5 MB.');
      const corpus = JSON.parse(await file.text());
      await operate({ operation: 'ingest', corpus });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
  }
  async function submit(decision: Review['decision']) {
    if (!candidate) return;
    const now = new Date().toISOString();
    await operate({
      operation: 'review',
      review: {
        id: `review-${crypto.randomUUID()}`,
        candidateId: candidate.id,
        fingerprint: candidate.fingerprint,
        reviewer,
        rationale,
        assessment,
        explanation,
        limitations: limitations
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        decision,
        reviewedAt: now,
        factsPassAt: factsPassAt || now,
        contextPassAt: contextPassAt || now,
        independentReview: false,
        checks,
      },
    });
  }
  onMount(() => {
    refresh().catch((e) => (message = e.message));
    const poll = setInterval(() => {
      refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(poll);
  });
</script>

<svelte:head
  ><title>Local review workbench · Said / Did</title><meta
    name="robots"
    content="noindex,nofollow"
  /></svelte:head
>
<div class="evidence-page review-page">
  <nav class="evidence-nav">
    <a href={`${base}/said-vs-did/`}>← Published ledger</a><span>LOCAL DEVELOPMENT ONLY</span>
  </nav>
  <header class="evidence-heading">
    <p class="eyebrow">Private files. Deliberate publication.</p>
    <h2>The review desk</h2>
    <p>Establish the facts. Then look for the context that could change the reading.</p>
  </header>
  <div class="evidence-notice">
    This workbench is served only by the loopback development server. Files and reviews stay local.
    Optional Luna extraction and second-pass review send saved evidence through your existing Codex
    account; neither approves publication.
  </div>
  <AiReviewPanel working={aiReview} pilot={pilotAiReview} {pilotAvailable} {busy} {operate} />
  <PipelineControls {model} {evaluation} {evaluationReport} {acquisition} {busy} {operate} />
  <div class="review-file">
    <label for="corpus-upload"
      >Provide a corpus JSON file<input
        id="corpus-upload"
        type="file"
        accept="application/json,.json"
        onchange={ingest}
        disabled={busy}
      /></label
    >
    <p>
      Import archives and validates your input, generates candidates, and marks changed published
      evidence for re-review. It never approves new comparisons.
    </p>
  </div>
  {#if !store}<button disabled={busy} onclick={() => operate({ operation: 'seed' })}
      >Initialize fictional demo workspace</button
    >{:else}
    <p>
      {store.candidates.length} candidates · {store.reviews.length} recorded decisions · {store.runs
        .length} completed runs
    </p>
    <div class="review-actions">
      <button disabled={busy} onclick={() => operate({ operation: 'publish' })}
        >Publish approved snapshot ↗</button
      ><button disabled={busy} onclick={() => refresh()}>Reload workspace</button>
    </div>
    <div class="review-candidates" aria-label="Candidates">
      {#each store.candidates as c}<button
          class:active={c.id === selectedId}
          onclick={() => selectCandidate(c.id)}
          >{c.person?.name ?? 'Unresolved'} · {c.blockers.length ? 'Held' : 'Reviewable'} · {c
            .action?.roll ?? 'No match'}</button
        >{/each}
    </div>
    {#if candidate}
      <h3>
        {candidate.person?.name ?? 'Unresolved person'} / {candidate.measure?.title ??
          'Unresolved target'}
      </h3>
      {#if candidate.blockers.length}<div class="evidence-notice">
          <strong>Publication blocked</strong>{#each candidate.blockers as reason}<p>
              {reason}
            </p>{/each}
        </div>{/if}
      <div class="comparison-columns">
        <article class="said-column">
          <h3>Whole attributable passage</h3>
          <p>{candidate.passage.eventDate} · {candidate.passage.kind.replaceAll('_', ' ')}</p>
          <blockquote>{candidate.claim.quote}</blockquote>
          <p>{candidate.passage.context}</p>
          <p>{candidate.passage.identityEvidence}</p>
        </article>
        <article class="did-column">
          <h3>Action & operative context</h3>
          {#if candidate.action}<p>
              {actionLabels[candidate.action.kind]} · {candidate.action.date}
            </p>
            <strong class="vote-choice">{candidate.action.vote}</strong>
            <p>{candidate.action.question}</p>
            <p>{candidate.action.context}</p>
            <p>
              Text: {candidate.action.operativeText}. Conditions: {candidate.action.conditionsMet}.
            </p>{:else}<p>No matching action in this input.</p>{/if}
        </article>
      </div>
      <details>
        <summary>Original source text, surrounding context & provisions</summary
        >{#each store.corpus.sources.filter((s) => candidate.sourceHashes[s.id]) as source}<h4>
            {source.title}
          </h4>
          <div class="review-source">{source.text}</div>
          <p class="review-audit">
            {candidate.sourceHashes[source.id]} · {source.url ?? 'Local fixture'}
          </p>{/each}
      </details>
      <div class="material-context">
        <details>
          <summary>Extraction proposal — not an editorial finding</summary>
          <p>
            Type: {candidate.claim.type} · stance: {candidate.claim.stance} · sentiment: {candidate
              .claim.sentiment}
          </p>
          <p>{candidate.claim.meaning}</p>
          <p>
            Model meaning and sentiment stay in the local queue, not the public projection. Verify
            the exact target, negation and qualifications against the source.
          </p>
        </details>
        {#each candidate.cautions as caution}<p>{caution}</p>{/each}
        <p>
          Chronology: {candidate.chronology.replaceAll('_', ' ')}. Connection: {candidate.basis.replaceAll(
            '_',
            ' ',
          )}.
        </p>
      </div>
      <label>Reviewer name<input bind:value={reviewer} autocomplete="name" /></label>
      <div class="review-checks">
        {#each Object.keys(checks) as key}<label
            ><input
              type="checkbox"
              bind:checked={checks[key as keyof typeof checks]}
            />{key.replace(/([A-Z])/g, ' $1')}</label
          >{/each}
      </div>
      <div class="review-actions">
        <button
          disabled={!checks.identity || !checks.quote || !checks.action || !checks.text}
          onclick={() => {
            factsPassAt = new Date().toISOString();
            contextPassAt = '';
          }}>Record facts pass</button
        ><button
          disabled={!factsPassAt ||
            !checks.chronology ||
            !checks.qualifications ||
            !checks.contraryEvidence}
          onclick={() => (contextPassAt = new Date().toISOString())}
          >Record later context pass</button
        >
      </div>
      <p class="review-audit">
        Facts: {factsPassAt || 'not recorded'} · Context: {contextPassAt || 'not recorded'} · Single reviewer,
        not independent review.
      </p>
      <label
        >Assessment<select bind:value={assessment}
          >{#each assessments as value}<option {value}>{assessmentLabels[value]}</option
            >{/each}</select
        ></label
      >
      <label
        >Why these are linked — public explanation<textarea bind:value={explanation}
        ></textarea></label
      >
      <label
        >Material limitations — one per line<textarea bind:value={limitations}></textarea></label
      >
      <label
        >Editorial rationale — private audit trail<textarea bind:value={rationale}
        ></textarea></label
      >
      <div class="review-actions">
        <button
          class="evidence-primary"
          disabled={busy || !!candidate.blockers.length || !contextPassAt}
          onclick={() => submit('approved')}>Approve this version</button
        ><button disabled={busy} onclick={() => submit('needs_evidence')}>Request evidence</button
        ><button disabled={busy} onclick={() => submit('rejected')}>Reject connection</button
        ><button disabled={busy} onclick={() => submit('withdrawn')}>Withdraw</button>
      </div>
      <details>
        <summary>Review history</summary>{#each store.reviews
          .filter((r) => r.candidateId === candidate.id)
          .toReversed() as review}<p class="review-audit">
            {review.reviewedAt} · {review.reviewer} · {review.decision}<br />{review.rationale}<br
            />{review.fingerprint === candidate.fingerprint
              ? 'Current input version'
              : 'Stale: source or extraction changed'}
          </p>{/each}
      </details>
    {/if}
  {/if}
  <p role="status" class="evidence-notice">
    {busy ? 'Processing locally…' : message || 'No changes submitted.'}
  </p>
</div>
