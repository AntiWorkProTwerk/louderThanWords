<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { searchReceipts } from '$lib/civic/votes';
  import { actionKinds, actionLabels } from '$lib/said-did/schema';
  let { data } = $props();
  let reducedMotion = $state(true);
  let visibleCount = $state(30);
  onMount(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (reducedMotion = preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  });
  const dataset = $derived(data.votes?.data);
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const query = $derived(params.get('q') ?? '');
  const stateFilter = $derived(params.get('state') ?? '');
  const kind = $derived(params.get('kind') ?? '');
  const member = $derived(params.get('member') ?? '');
  const measure = $derived(params.get('measure') ?? '');
  const receipts = $derived(
    dataset ? searchReceipts(dataset, query, stateFilter, kind, member, measure) : [],
  );
  $effect(() => {
    void query;
    void stateFilter;
    void kind;
    void member;
    void measure;
    visibleCount = 30;
  });
  const selected = $derived(receipts.find((r) => r.id === params.get('receipt')) ?? null);
  const bill = $derived(dataset?.measures.find((m) => m.id === selected?.action.measureId));
  const billTitle = (title: string) => title.replace(/^\d+\s+[A-Z]+\s+\d+\s+[A-Z]+:\s*/, '');
  const establishedCount = $derived(
    dataset?.receipts.filter((r) => r.action.operativeText === 'established' && r.action.versionId)
      .length ?? 0,
  );
  const source = (id: string) => dataset?.sources.find((s) => s.id === id);
  const statements = $derived(
    dataset?.statements.filter((s) =>
      selected?.connections.some((c) => c.kind === 'statement' && c.id === s.id),
    ) ?? [],
  );
  async function filter(changes: Record<string, string | null>, replace = false) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
  }
</script>

<svelte:head
  ><title>Vote Receipts · Louder Than Words</title><meta
    name="description"
    content="Read the exact congressional vote question, inspect the source text, and connect recorded words with actions."
  /></svelte:head
>

<div class="evidence-page vote-page">
  <div class="vote-topline">
    <span>01 / Legislative records</span><a href={`${base}/said-vs-did/`}>Said / Did ledger ↗</a>
  </div>
  <header class="vote-heading">
    <p class="eyebrow">Follow the question. Open the evidence.</p>
    <h2>Every vote.<br /><em>With its receipt.</em></h2>
    <p>
      What was actually put to a vote? Search the available bill text, open a member’s receipt, then
      inspect their words on the same measure.
    </p>
  </header>
  {#if !dataset}
    <div role="alert" class="vote-empty">
      <h3>Receipts unavailable</h3>
      <p>{data.votesError}</p>
      <a href={page.url.pathname}>Reload receipts ↻</a>
    </div>
  {:else}
    <div class="vote-coverage">
      <span class="vote-dot"></span><strong
        >{dataset.scope.mode === 'real'
          ? 'Official-source pilot'
          : 'Fictional demonstration'}</strong
      >
      <span>{dataset.scope.from} → {dataset.scope.through}</span><span
        >{dataset.receipts.length} receipts · {dataset.measures.length} measure(s)</span
      >
    </div>
    <details class="vote-method">
      <summary>Where this data comes from—and what it does not tell you</summary>
      <p>{dataset.scope.eligibility}</p>
      <p>
        Votes come from official roll calls; text and statements come from GovInfo. A vote on an
        entire bill is not a separate vote on each clause. Search matches can also come from
        contextual versions that were not the version put to the vote.
      </p>
      <p>
        Map dots group receipts by the member’s state at the time, not where the vote occurred.
        Empty states mean no records in this sample, not no activity. Connections identify shared
        people and measures, not agreement or causation.
      </p>
      <p>
        Published {data.votes?.manifest.publishedAt.slice(0, 10)} · This is a dated snapshot, not a live
        congressional feed.
      </p>
      <p>
        {establishedCount} receipts have an established text-version binding. Other receipts remain explicitly
        unresolved. A House engrossed-text binding requires the matching measure, a successful passage
        vote, and House certification on the same date.
      </p>
      <a href={`${base}/data/votes/releases/${data.votes?.manifest.release}/data.json`} download
        >Download the complete source-linked JSON ↧</a
      >
      <details>
        <summary>Acquisition exclusions ({dataset.excluded.length})</summary>
        <ul>
          {#each dataset.excluded as exclusion}<li>{exclusion.id}: {exclusion.reason}</li>{/each}
        </ul>
      </details>
    </details>
    <form class="vote-filters" onsubmit={(e) => e.preventDefault()}>
      <label class="vote-search"
        >Search an issue, provision, bill or member<input
          type="search"
          value={query}
          placeholder="Try detention, Laken Riley, or a name"
          oninput={(e) => filter({ q: e.currentTarget.value, receipt: null }, true)}
        /></label
      >
      <label
        >Decision type<select
          value={kind}
          onchange={(e) => filter({ kind: e.currentTarget.value, receipt: null })}
          ><option value="">All vote types</option
          >{#each actionKinds.filter((k) => k !== 'sponsorship') as k}<option value={k}
              >{actionLabels[k]}</option
            >{/each}</select
        ></label
      >
    </form>
    <div class="vote-results-bar" aria-live="polite">
      <strong
        >{receipts.length} receipts {stateFilter
          ? `in ${stateFilter}`
          : 'across the sample'}</strong
      >{#if stateFilter || query || kind || member || measure}<button
          onclick={() => goto(`${base}/records/votes/`, { noScroll: true })}
          >Clear filters · All states</button
        >{/if}
    </div>
    {#if selected && bill}
      <section
        class="vote-detail"
        aria-label="Selected vote receipt"
        in:fly={{ y: 10, duration: reducedMotion ? 0 : 220 }}
      >
        <button class="vote-back" onclick={() => filter({ receipt: null })}
          >← All matching receipts</button
        >
        <p class="eyebrow">
          {selected.action.chamber} · Roll {selected.action.roll ?? 'not recorded'} · {selected
            .action.date}
        </p>
        <h3>
          {selected.person?.name ?? 'Chamber action'}
          <span class="vote-choice">{selected.action.rawVote}</span>
        </h3>
        <div class="vote-question">
          <small>The exact recorded question</small>
          <blockquote>“{selected.action.question}”</blockquote>
          <p>{billTitle(bill.title)}</p>
          {#if data.votes?.data.scope.mode === 'real' && ['hr', 's'].includes(bill.type)}
            <p><a href={`${base}/records/graveyard/?bill=${bill.id}`}>Look up this bill’s recorded progress →</a></p>
          {/if}
          <span>Chamber result: {selected.action.result || 'Not supplied'}</span>
        </div>
        <div class="vote-cautions">
          {#each selected.cautions as caution}<p>{caution}</p>{/each}
        </div>
        {#if selected.person}<p class="vote-provenance">
            Recorded representation: {selected.state} · Bioguide {selected.person.bioguideId ??
              'fictional'} · Names follow the source display label unless a dated full-name record was
            supplied.
          </p>{/if}
        {#if selected.action.operativeText === 'established'}<details class="vote-text">
            <summary>Why this text is linked to this vote</summary>
            <p>{selected.action.context}</p>
          </details>{/if}
        {#if source(selected.action.sourceId)?.url}<a
            class="vote-source"
            href={source(selected.action.sourceId)!.url!}
            target="_blank"
            rel="noreferrer">Open original roll call ↗</a
          >{/if}
        <div class="vote-connections">
          <span>Connected by primary-record IDs</span>
          {#if selected.person}<button
              onclick={() => filter({ member: selected.person!.id, receipt: null })}
              >{selected.person.name} → member receipts</button
            >{/if}
          <button
            onclick={() =>
              filter({
                measure: bill!.id,
                state: null,
                member: null,
                receipt: null,
                q: null,
                kind: null,
              })}>{bill.id.toUpperCase()} → all member votes</button
          >
          <a href="#related-statements">{statements.length} related recorded statements ↓</a>
        </div>
        <h4>Legislative text, version by version</h4>
        {#each bill.versions as version}<details class="vote-text">
            <summary
              >{version.id} · {version.issued}<span
                >{selected.action.operativeText === 'established' &&
                selected.action.versionId === version.id
                  ? 'Verified vote-text binding'
                  : 'Context only · vote-text binding unverified'}</span
              ></summary
            >
            <blockquote>{version.provision}</blockquote>
            {#if source(version.sourceId)?.url}<a
                href={source(version.sourceId)!.url!}
                target="_blank"
                rel="noreferrer">Open original legislative text ↗</a
              >{/if}
            <p class="vote-provenance">
              Source fetched {source(version.sourceId)?.fetchedAt.slice(0, 10)} · {source(
                version.sourceId,
              )?.provenance?.parserVersion ?? 'Supplied corpus'}
            </p>
          </details>{/each}
        <section id="related-statements">
          <h4>Same person. Same measure. Their recorded words.</h4>
          <p>
            These are linked records, not an AI verdict. Same-day statements are not assumed to
            precede the vote. The separate Said / Did ledger still uses demo comparisons.
          </p>
          {#each statements as statement}<details class="vote-text">
              <summary>{statement.date} · Recorded statement</summary>
              <blockquote>{statement.text}</blockquote>
              {#if source(statement.sourceId)?.url}<a
                  href={source(statement.sourceId)!.url!}
                  target="_blank"
                  rel="noreferrer">Read the full Congressional Record context ↗</a
                >{/if}
            </details>{:else}<p>
              No attributable statement connected to this member and measure in this sample.
            </p>{/each}
        </section>
      </section>
    {:else if receipts.length}
      <div class="vote-list">
        {#each receipts.slice(0, visibleCount) as receipt (receipt.id)}{@const measureRecord =
            dataset.measures.find((m) => m.id === receipt.action.measureId)!}
          <button class="vote-card" onclick={() => filter({ receipt: receipt.id })}>
            <span class="vote-card-meta"
              >{receipt.action.date} / {receipt.action.chamber} / {receipt.state ??
                'Chamber-wide'}</span
            >
            <span class="vote-card-person"
              >{receipt.person?.name ?? 'Chamber action'}<b class="vote-choice"
                >{receipt.action.rawVote}</b
              ></span
            >
            <strong>{receipt.action.question}</strong><span>{billTitle(measureRecord.title)}</span>
            <span class="vote-card-foot"
              >{actionLabels[receipt.action.kind]}<span>Open receipt ↗</span></span
            >
          </button>
        {/each}
      </div>
      {#if receipts.length > visibleCount}<button onclick={() => (visibleCount += 30)}
          >Show 30 more receipts · {receipts.length - visibleCount} remaining</button
        >{/if}
    {:else}
      <div class="vote-empty">
        <h3>No receipts in this slice.</h3>
        <p>
          This is a bounded pilot, not the full congressional record. Try another state or clear the
          filters.
        </p>
        <button onclick={() => goto(`${base}/records/votes/`, { noScroll: true })}
          >Explore all collected receipts ↗</button
        >
      </div>
    {/if}
  {/if}
</div>

<style>
  .vote-page {
    --receipt-ink: #143650;
  }
  .vote-topline,
  .vote-coverage,
  .vote-results-bar,
  .vote-card-foot,
  .vote-card-person {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .vote-topline {
    font-size: 10px;
    color: #496d92;
    letter-spacing: 1px;
  }
  .vote-heading {
    margin: 28px 0 24px;
    max-width: 630px;
  }
  .vote-heading h2 {
    font: 700 clamp(42px, 5vw, 74px)/0.98 var(--condensed);
    letter-spacing: -1px;
    margin: 12px 0 20px;
    text-transform: uppercase;
  }
  .vote-heading em {
    color: var(--blue);
    font-style: normal;
  }
  .vote-heading > p:last-child {
    max-width: 520px;
    color: #496580;
  }
  .vote-coverage {
    justify-content: flex-start;
    padding: 13px 16px;
    background: #eaf3fd;
    border: 1px solid #d5e4f2;
    border-radius: 6px;
    font-size: 11px;
  }
  .vote-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--blue);
    box-shadow: 0 0 0 5px #0867fc13;
  }
  .vote-method {
    margin: 14px 0 25px;
    font-size: 11px;
    color: #476483;
  }
  .vote-method summary,
  .vote-text summary {
    cursor: pointer;
    padding: 8px 0;
  }
  .vote-method ul {
    max-height: 240px;
    overflow: auto;
    padding-left: 20px;
  }
  .vote-filters {
    display: grid;
    grid-template-columns: 1fr 180px;
    gap: 12px;
  }
  .vote-filters label {
    display: grid;
    gap: 5px;
    font-size: 10px;
    color: #4c6680;
  }
  .vote-filters input,
  .vote-filters select {
    width: 100%;
    min-width: 0;
    padding: 12px;
    border: 1px solid #ccddec;
    border-radius: 6px;
    background: white;
    color: var(--receipt-ink);
  }
  .vote-results-bar {
    margin: 18px 0 12px;
    font-size: 11px;
  }
  .vote-results-bar button {
    font-size: 10px;
  }
  .vote-list {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .vote-page .vote-card {
    display: flex;
    flex-direction: column;
    text-align: left;
    align-items: stretch;
    gap: 10px;
    background: linear-gradient(130deg, #fff, #f4f8fc);
    border: 1px solid #d6e3ee;
    padding: 19px;
    color: var(--receipt-ink);
    transition:
      transform 0.2s,
      box-shadow 0.2s,
      border-color 0.2s;
  }
  .vote-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 25px #183b6110;
    border-color: #78a9e3;
  }
  .vote-card-meta {
    font-size: 9px;
    color: #597a9c;
    letter-spacing: 1px;
  }
  .vote-card-person {
    font: 600 25px/1.1 var(--condensed);
    flex-wrap: nowrap;
  }
  .vote-choice {
    font: 600 13px/1.2 var(--sans, sans-serif);
    padding: 6px 9px;
    background: #e7eff9;
    border-radius: 4px;
    color: #244c7a;
    white-space: nowrap;
  }
  .vote-card > strong {
    font-size: 13px;
  }
  .vote-card > span:not([class]) {
    font-size: 11px;
    color: #57718a;
  }
  .vote-card-foot {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #e1eaf3;
    font-size: 9px;
    color: #50799f;
  }
  .vote-card-foot > span {
    color: var(--blue);
  }
  .vote-empty {
    padding: 32px;
    background: #edf4fb;
    border: 1px dashed #aac6df;
    border-radius: 8px;
  }
  .vote-detail {
    border-top: 2px solid var(--blue);
    padding-top: 18px;
  }
  .vote-detail > .eyebrow {
    margin-top: 24px;
  }
  .vote-detail h3 {
    font: 600 38px/1.1 var(--condensed);
    margin: 8px 0 20px;
    display: flex;
    align-items: center;
    gap: 15px;
  }
  .vote-question {
    padding: 20px;
    border-left: 3px solid var(--blue);
    background: #edf5fd;
  }
  .vote-question small {
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #456889;
  }
  .vote-question blockquote {
    font: 600 30px var(--condensed);
    margin: 10px 0;
  }
  .vote-question span {
    font-size: 11px;
  }
  .vote-cautions {
    border: 1px solid #dfcf9d;
    background: #fffaf0;
    padding: 3px 16px;
    margin: 18px 0;
    color: #665323;
    font-size: 12px;
  }
  .vote-source {
    display: inline-block;
    padding: 10px 0;
    font-weight: 600;
  }
  .vote-connections {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 18px 0 28px;
  }
  .vote-connections > span {
    width: 100%;
    font-size: 10px;
    letter-spacing: 1px;
    color: #577393;
  }
  .vote-connections button,
  .vote-connections a {
    font-size: 11px;
    border: 1px solid #cedfed;
    padding: 9px 12px;
    border-radius: 5px;
  }
  .vote-detail h4 {
    font: 600 24px var(--condensed);
    margin: 25px 0 10px;
  }
  .vote-text {
    border-bottom: 1px solid #d5e3ef;
    padding: 10px 0;
  }
  .vote-text summary {
    font-weight: 600;
  }
  .vote-text summary span {
    display: block;
    font-size: 10px;
    font-weight: 400;
    color: #856323;
  }
  .vote-text blockquote {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 12px 0;
    padding: 16px;
    background: white;
    border-left: 2px solid #b5d0e7;
    font-size: 12px;
    line-height: 1.85;
  }
  .vote-provenance {
    font-size: 10px;
    color: #607891;
  }
  #related-statements > p {
    color: #566d84;
    font-size: 12px;
  }
  @media (max-width: 1050px) {
    .vote-list {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 600px) {
    .vote-filters {
      grid-template-columns: 1fr;
    }
    .vote-heading h2 {
      font-size: 44px;
    }
    .vote-topline {
      font-size: 9px;
    }
    .vote-coverage {
      gap: 8px;
    }
    .vote-detail h3 {
      font-size: 30px;
      flex-wrap: wrap;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .vote-card {
      transition: none !important;
      transform: none !important;
    }
  }
</style>
