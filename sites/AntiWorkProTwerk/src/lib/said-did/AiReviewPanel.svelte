<script lang="ts">
  let {
    working,
    pilot,
    pilotAvailable,
    busy,
    operate,
  }: {
    working: any;
    pilot: any;
    pilotAvailable: boolean;
    busy: boolean;
    operate: (body: unknown) => Promise<void>;
  } = $props();
  let target = $state('real-pilot'),
    consent = $state(false),
    filter = $state('all');
  const selectedTarget = $derived(pilotAvailable ? target : 'working');
  const report = $derived(selectedTarget === 'real-pilot' ? pilot : working);
  const cases = $derived(
    report?.cases.filter((c: any) => filter === 'all' || c.extractionVerdict === filter) ?? [],
  );
  const verdictLabel: Record<string, string> = {
    supported: 'Extraction supported by reviewer',
    disputed: 'Reviewer disputes extraction',
    insufficient_evidence: 'Reviewer needs more evidence',
  };
  const conclusionLabel: Record<string, string> = {
    consistent: 'Consistent (AI opinion)',
    apparent_tension: 'Apparent tension (AI opinion)',
    context_dependent: 'Needs more context',
    not_comparable: 'Not comparable',
  };
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'said-did-ai-review.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<section class="ai-review-panel" aria-labelledby="ai-review-heading">
  <p class="eyebrow">AI CHECKING AI / LOCAL RESEARCH PREVIEW</p>
  <h2 id="ai-review-heading">Let Luna challenge the first pass.</h2>
  <p>
    A second Luna run reads the saved sources and challenges the extracted claims and proposed
    comparisons. You don’t need to fill in the annotation worksheet to continue development.
  </p>
  <p class="ai-review-warning">
    AI-reviewed, not human-verified. The same model can repeat its own mistakes. Agreement is not an
    accuracy score, and this review does not approve publication.
  </p>
  <div class="ai-review-controls">
    <label
      >Evidence to inspect<select
        value={selectedTarget}
        onchange={(event) => (target = event.currentTarget.value)}
        disabled={busy || !pilotAvailable}
      >
        {#if pilotAvailable}<option value="real-pilot"
            >Real-source pilot (separate from the demo)</option
          >{/if}
        <option value="working">Current working corpus</option>
      </select></label
    >
    <label class="ai-review-consent"
      ><input type="checkbox" bind:checked={consent} disabled={busy} />Send the saved source
      excerpts, bill text and AI proposals to OpenAI through my Codex account for a second-pass
      review.</label
    >
    <button
      disabled={busy || !consent}
      onclick={() =>
        operate({ operation: 'review-ai', target: selectedTarget, allowRemoteInference: true })}
      >{busy ? 'Pipeline busy…' : 'Run AI second-pass review'}</button
    >
  </div>
  {#if report}
    {#if report.complete === false}<p role="status" class="ai-review-warning">
        Incomplete audit: {report.counts.passages} of {report.totalPassages} passages have validated AI
        reviews. Remaining passages are pending, not assumed correct. This page checks for new results
        every 15 seconds.
      </p>{/if}
    {#if report.stale}<p role="status" class="ai-review-warning">
        Outdated review: the corpus, claims or review version changed. Rerun before using these
        diagnostics.
      </p>{/if}
    <div class="ai-review-stats">
      <span><strong>{report.counts.passages}</strong> passages checked</span>
      <span><strong>{report.counts.supported}</strong> extractions supported</span>
      <span><strong>{report.counts.disputed}</strong> extractions disputed</span>
      <span><strong>{report.counts.insufficientEvidence}</strong> need more evidence</span>
    </div>
    <p>
      Model: {report.model} · {report.effort} reasoning · {report.at.slice(0, 10)}. Includes
      passages where the first pass extracted no claim.
    </p>
    <div class="ai-review-controls">
      <label
        >Show<select bind:value={filter}
          ><option value="all">All passages</option><option value="disputed"
            >Disputed extractions</option
          ><option value="insufficient_evidence">Insufficient evidence</option><option
            value="supported">Supported extractions</option
          ></select
        ></label
      ><button onclick={download}>Download AI review report</button>
    </div>
    <p>
      “Supported” means the reviewer agrees with the extraction—not that the politician’s assertions
      are true or that a comparison is publishable. Open a passage for the reasons and evidence.
    </p>
    <div class="ai-review-results">
      {#each cases as item (item.passageId)}
        <details class="ai-review-case">
          <summary
            ><span>{item.personName} <small>{item.date}</small></span><span
              class:disputed={item.extractionVerdict === 'disputed'}
              >{verdictLabel[item.extractionVerdict]}</span
            ></summary
          >
          <p>{item.rationale}</p>
          {#if item.issues.length}<p class="ai-review-issues">
              Checks flagged: {item.issues.map((s: string) => s.replaceAll('_', ' ')).join(' · ')}
            </p>{/if}
          <details>
            <summary>Read the statement and first-pass interpretation</summary>
            <blockquote>{item.quote}</blockquote>
            {#each item.proposedClaims as claim}<p>
                <strong>{claim.type.replaceAll('_', ' ')} · {claim.stance}</strong> — {claim.meaning}
              </p>{/each}
            {#if !item.proposedClaims.length}<p>
                The first pass extracted no claim from this passage.
              </p>{/if}
          </details>
          <h3>Reviewer’s source citations</h3>
          {#each item.citations as citation}<blockquote>{citation.quote}</blockquote>
            {#if citation.url}<a href={citation.url} target="_blank" rel="noopener noreferrer"
                >Open original source ↗</a
              >{/if}{/each}
          {#each item.comparisons as comparison}<section class="ai-review-comparison">
              <h3>{conclusionLabel[comparison.conclusion]}</h3>
              {#if comparison.action}<p>
                  {comparison.action.question} · {comparison.action.vote} · {comparison.action.date}
                </p>{:else}<p>No matching individual action in the collected data.</p>{/if}
              <p>{comparison.rationale}</p>
              {#if comparison.blockers.length}<p>
                  <strong>Evidence still blocks publication:</strong>
                  {comparison.blockers.join(' ')}
                </p>{/if}
              {#if comparison.cautions.length}<p>Context: {comparison.cautions.join(' ')}</p>{/if}
            </section>{/each}
        </details>
      {/each}
      {#if !cases.length}<p>No passages match this filter.</p>{/if}
    </div>
  {:else}<p>
      No second-pass report for this corpus yet. Run it above; validated batches are cached for
      reuse. This does not replace the public demo or change the human-review queue.
    </p>{/if}
</section>

<style>
  .ai-review-panel {
    margin: 1.5rem 0;
    padding: 1.5rem;
    border: 1px solid #bdd0e5;
    border-radius: 14px;
    background: linear-gradient(135deg, #f2f7ff, #fff);
  }
  h2 {
    font-size: 1.8rem;
    margin: 0.25rem 0 0.75rem;
  }
  .ai-review-warning {
    padding: 0.8rem 1rem;
    border-left: 3px solid #d89c1d;
    background: #fff8e8;
    color: #725519;
  }
  .ai-review-controls {
    display: flex;
    gap: 1rem;
    align-items: end;
    flex-wrap: wrap;
    margin: 1rem 0;
  }
  label {
    display: grid;
    gap: 0.4rem;
    max-width: 100%;
    font-size: 0.9rem;
  }
  select,
  button {
    font: inherit;
    padding: 0.65rem;
    border: 1px solid #bdcfe1;
    border-radius: 6px;
    background: white;
    color: #203d62;
    max-width: 100%;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ai-review-consent {
    display: flex;
    align-items: start;
    max-width: 34rem;
  }
  .ai-review-consent input {
    margin-top: 0.3rem;
    flex-shrink: 0;
  }
  .ai-review-stats {
    display: flex;
    gap: 1.75rem;
    flex-wrap: wrap;
    border-block: 1px solid #dbe5ef;
    padding: 1rem 0;
  }
  .ai-review-stats strong {
    display: block;
    font-size: 1.8rem;
  }
  .ai-review-stats span {
    font-size: 0.85rem;
  }
  .ai-review-results {
    max-height: 65vh;
    overflow: auto;
  }
  .ai-review-case {
    background: #fff;
    border: 1px solid #dbe5ef;
    border-radius: 8px;
    margin: 0.65rem 0;
    padding: 1rem;
  }
  .ai-review-case > summary {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    cursor: pointer;
    font-weight: 650;
  }
  .ai-review-case small {
    display: block;
    font-weight: 400;
    color: #60738a;
  }
  .ai-review-case > summary > span:last-child {
    font-size: 0.8rem;
    color: #375e83;
  }
  .ai-review-case > summary > .disputed {
    color: #ac3131 !important;
  }
  blockquote {
    white-space: pre-wrap;
    font-size: 0.92rem;
    border-left: 2px solid #9fbce0;
    padding: 0.5rem 1rem;
    margin: 1rem 0;
    overflow-wrap: anywhere;
  }
  .ai-review-issues {
    color: #845a1a;
    font-size: 0.85rem;
  }
  .ai-review-comparison {
    margin: 1rem 0;
    padding: 1rem;
    background: #f5f8fc;
    border-radius: 6px;
  }
  h3 {
    font-size: 1rem;
  }
  .ai-review-comparison p {
    font-size: 0.9rem;
  }
  a {
    color: #125bb1;
  }
  @media (max-width: 600px) {
    .ai-review-panel {
      padding: 1rem;
    }
    .ai-review-case > summary {
      display: block;
    }
    .ai-review-controls {
      display: grid;
    }
    .ai-review-stats {
      gap: 1rem;
    }
    .ai-review-stats span {
      width: 43%;
    }
  }
</style>
