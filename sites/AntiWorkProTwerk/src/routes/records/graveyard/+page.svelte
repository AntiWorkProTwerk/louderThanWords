<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    billLabel,
    billUrl,
    statusUrl,
    filterBills,
    furthestStage,
    stages,
    daysSinceAction,
    policyProgress,
    milestoneLabels,
    type BillDetail,
    type Milestone,
  } from '$lib/civic/graveyard';
  import { loadBillDetail } from '$lib/civic/graveyard-repository';
  let { data } = $props();
  let ready = $state(false),
    reduced = $state(true),
    limit = $state(24),
    actionLimit = $state(40),
    amendmentLimit = $state(30);
  let detail = $state<BillDetail | null>(null),
    detailError = $state(''),
    loading = $state(false),
    retry = $state(0),
    detailElement: HTMLElement | undefined = $state();
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.graveyard?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filterKey = $derived(
    JSON.stringify(
      ['q', 'state', 'congress', 'chamber', 'policy', 'stage', 'quiet'].map((k) => [
        k,
        params.get(k) ?? '',
      ]),
    ),
  );
  const filtered = $derived(
    dataset ? filterBills(dataset, new URLSearchParams(JSON.parse(filterKey))) : [],
  );
  const bills = $derived(
    [...filtered].sort(
      (a, b) => b.latest.date.localeCompare(a.latest.date) || a.id.localeCompare(b.id),
    ),
  );
  const policies = $derived([...new Set(dataset?.bills.map((b) => b.policy) ?? [])].sort());
  const groups = $derived(
    dataset ? policyProgress(dataset, new URLSearchParams(JSON.parse(filterKey))) : [],
  );
  const selected = $derived(dataset?.bills.find((b) => b.id === params.get('bill')));
  const counts = $derived({
    law: bills.filter((b) => b.milestones.law).length,
    passed: bills.filter((b) => b.milestones.house || b.milestones.senate).length,
    quiet: bills.filter(
      (b) => !b.milestones.law && dataset && daysSinceAction(b, dataset.observedAt) >= 180,
    ).length,
  });
  $effect(() => {
    void filterKey;
    limit = 24;
  });
  $effect(() => {
    const snapshot = data.graveyard,
      id = selected?.id;
    void retry;
    detail = null;
    detailError = '';
    loading = false;
    actionLimit = 40;
    amendmentLimit = 30;
    if (!browser || !snapshot || !id) return;
    const controller = new AbortController();
    let current = true;
    loading = true;
    loadBillDetail(snapshot, id, fetch, base, controller.signal)
      .then((value) => {
        if (current) detail = value;
      })
      .catch(() => {
        if (current)
          detailError = 'The detailed source record could not load or verify. Retry to try again.';
      })
      .finally(() => {
        if (current) loading = false;
      });
    return () => {
      current = false;
      controller.abort();
    };
  });
  async function navigate(changes: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [k, v] of Object.entries(changes))
      v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
    await goto(url, { noScroll: true, keepFocus: true });
    if (changes.bill) {
      await tick();
      detailElement?.focus({ preventScroll: true });
      detailElement?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    }
  }
  function submit(event: SubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    navigate({ q: String(form.get('q') ?? ''), bill: null });
  }
  const relatedUrl = (r: { congress: number; type: string; number: number }) =>
    `https://www.congress.gov/bill/${r.congress}/${r.type.toLowerCase()}/${r.number}`;
  const amendmentUrl = (a: { congress: number; type: string; number: number }) =>
    `https://www.congress.gov/amendment/${a.congress}th-congress/${a.type === 'HAMDT' ? 'house' : 'senate'}-amendment/${a.number}`;
  const safeVoteUrl = (url: string) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' &&
        ['clerk.house.gov', 'www.senate.gov', 'www.congress.gov'].includes(u.hostname)
        ? url
        : null;
    } catch {
      return null;
    }
  };
  const milestoneKeys = Object.keys(milestoneLabels) as Milestone[];
</script>

<svelte:head
  ><title>Bill Graveyard · Louder Than Words</title><meta
    name="description"
    content="Follow recorded legislative progress, inspect the last action, and preserve links to related laws. No invented causes for inactivity."
  /></svelte:head
>
<div class="evidence-page bill-page">
  <div class="kicker">
    <span>04 / The bill graveyard</span><a href={`${base}/records/votes/`}>Vote receipts ↗</a>
  </div>
  <header>
    <p class="eyebrow">Not every proposal reaches the finish.</p>
    <h2>Where did<br /><em>it get to?</em></h2>
    <p>
      Follow the recorded steps, not a story about who stopped them. A quiet bill number can still
      have a related measure that became law.
    </p>
  </header>
  {#if data.graveyardError}<p role="alert">{data.graveyardError}</p>{/if}
  {#if dataset && data.graveyard}
    <div class="capture">
      <span class="live-dot"></span>Official bill-status records · captured {dataset.observedAt.slice(
        0,
        10,
      )}
    </div>
    <details class="coverage">
      <summary
        >{dataset.bills.length} bills · {dataset.missing.length} reserved / unavailable numbers · read
        the scope</summary
      >
      <p>{dataset.plan.selection}</p>
      <p>
        {dataset.plan.title}. HTTP 404 means unavailable at capture, not a failed bill. Reserved
        numbers do not enter topic denominators. No AI judgment is used here.
      </p>
      <p>
        Map points are sponsor-state label anchors, not locations of legislative action or policy
        impact. Sponsorship does not establish a vote; “by request” may not mean support.
      </p>
      <ul>
        {#each dataset.missing as m}<li>
            <a href={m.url} target="_blank" rel="noreferrer">{m.id}</a> — {m.reason}
          </li>{/each}
      </ul>
      <p>
        Refresh comparison: {dataset.changes.baselineAt
          ? `${dataset.changes.added.length} added, ${dataset.changes.updated.length} source records changed, ${dataset.changes.notReturned.length} not returned since ${dataset.changes.baselineAt.slice(0, 10)}.`
          : 'First capture; no update comparison yet.'} Source changes are not necessarily new legislative
        actions.
      </p>
      <a
        href={`${base}/data/graveyard/releases/${data.graveyard.manifest.release}/data.json`}
        download>Download compact dataset</a
      >
      ·
      <a href={`${base}/data/graveyard/manifest.json`} download>Snapshot manifest + detail hashes</a
      >
    </details>
    <form class="search" onsubmit={submit}>
      <label for="bill-search">Find a proposal, sponsor, or subject</label>
      <div>
        <input
          id="bill-search"
          name="q"
          value={params.get('q') ?? ''}
          placeholder="Try immigration or H.R. 29"
        /><button disabled={!ready}>Search</button>
      </div>
    </form>
    <div class="filters">
      <label
        >Congress<select
          aria-label="Bill Congress"
          disabled={!ready}
          value={params.get('congress') ?? ''}
          onchange={(e) => navigate({ congress: e.currentTarget.value, bill: null })}
          ><option value="">All collected Congresses</option
          >{#each [...new Set(dataset.plan.ranges.map((r) => r.congress))] as c}<option value={c}
              >{c}th Congress</option
            >{/each}</select
        ></label
      >
      <label
        >Origin<select
          aria-label="Bill origin chamber"
          disabled={!ready}
          value={params.get('chamber') ?? ''}
          onchange={(e) => navigate({ chamber: e.currentTarget.value, bill: null })}
          ><option value="">Both chambers</option><option value="HR">House bills</option><option
            value="S">Senate bills</option
          ></select
        ></label
      >
      <label
        >Policy area<select
          aria-label="Bill policy area"
          disabled={!ready}
          value={params.get('policy') ?? ''}
          onchange={(e) => navigate({ policy: e.currentTarget.value, bill: null })}
          ><option value="">All assigned areas</option>{#each policies as p}<option>{p}</option
            >{/each}</select
        ></label
      >
      <label
        >Furthest recorded milestone<select
          aria-label="Bill progress"
          disabled={!ready}
          value={params.get('stage') ?? ''}
          onchange={(e) => navigate({ stage: e.currentTarget.value, bill: null })}
          ><option value="">All progress</option>{#each stages as stage}<option>{stage}</option
            >{/each}</select
        ></label
      >
      <label
        >Time since last action<select
          aria-label="Bill inactivity window"
          disabled={!ready}
          value={params.get('quiet') ?? ''}
          onchange={(e) => navigate({ quiet: e.currentTarget.value, bill: null })}
          ><option value="">Any time</option><option value="90">90+ days, not enacted</option
          ><option value="180">180+ days, not enacted</option><option value="365"
            >365+ days, not enacted</option
          ></select
        ></label
      >
      <a class="reset" href={`${base}/records/graveyard/`}>Clear all filters ↺</a>
    </div>
    <div class="totals" aria-live="polite">
      <div><strong>{bills.length}</strong><span>matching bills</span></div>
      <div><strong>{counts.passed}</strong><span>passed ≥1 chamber</span></div>
      <div><strong>{counts.law}</strong><span>became law</span></div>
      <div><strong>{counts.quiet}</strong><span>180+ quiet days*</span></div>
    </div>
    <p class="small">
      *No action recorded for 180+ days at capture, excluding enacted bills. An adjustable browsing
      threshold—not a legal status, failure rate, or finding about responsibility. Counts overlap.
    </p>

    {#if params.get('bill') && !selected}<p role="status" class="notice">
        This bill is reserved, unavailable, or outside the collected ranges. No outcome is inferred.
        Clear the selection or consult the official record.
      </p>{/if}
    {#if selected}
      <section
        class="bill-detail"
        tabindex="-1"
        bind:this={detailElement}
        aria-label="Selected bill evidence"
      >
        <div class="detail-top">
          <span>{billLabel(selected)} · {selected.congress}th Congress</span><button
            disabled={!ready}
            onclick={() => navigate({ bill: null })}>Close ×</button
          >
        </div>
        <h3>{selected.title}</h3>
        <p class="small">
          Introduced {selected.introduced} · source metadata updated {selected.updated.slice(0, 10)}
        </p>
        <div class="last-action">
          <p class="eyebrow">Last recorded action · {selected.latest.date}</p>
          <blockquote>{selected.latest.text}</blockquote>
          <p>
            {daysSinceAction(selected, dataset.observedAt)} days before this capture. This is the source’s
            latest action, not an inferred outcome.
          </p>
        </div>
        {#if selected.relatedLaw.length}<div class="notice">
            <strong>Do not stop at this bill number.</strong>{#each selected.relatedLaw as r}<p>
                The source labels {r.id} “{r.relationship}” — {r.title}. Read the relationship
                below; this does not make the two texts interchangeable.
              </p>{/each}
          </div>{/if}
        <ol class="milestones" aria-label="Recorded legislative milestones">
          {#each milestoneKeys as k}<li class:reached={!!selected.milestones[k]}>
              <i></i><span>{milestoneLabels[k]}</span><small
                >{selected.milestones[k] ?? 'Not established here'}</small
              >
            </li>{/each}
        </ol>
        <p class="small">
          Observed milestones, not mandatory steps or a complete state machine. Referral alone is
          not committee consideration. Unknown codes remain in the full source history. No action
          after a date proves neither a cause nor that related legislation failed.
        </p>
        <p class="sponsors">
          {#each selected.sponsors as s}<span
              >{s.name}{s.byRequest === 'Y' ? ' · introduced by request' : ''}</span
            >{/each}
        </p>
        <div class="links">
          <a href={billUrl(selected)} target="_blank" rel="noreferrer">Congress.gov record ↗</a><a
            href={statusUrl(selected)}
            target="_blank"
            rel="noreferrer">Source XML ↗</a
          ><a href={`${base}/records/votes/?measure=${selected.id}`}
            >Look up this exact bill in Vote Receipts →</a
          >
        </div>
        <p class="small">
          The vote lookup may have no collected receipts. A matching bill ID is not proof of
          matching text versions or positions.
        </p>
        {#if loading}<p role="status">Loading and verifying the detailed record…</p>{/if}
        {#if detailError}<p role="alert">{detailError}</p>
          <button onclick={() => retry++}>Retry bill details</button>{/if}
        {#if detail}
          <h4>Connections explicitly recorded</h4>
          {#if !detail.related.length}<p>No related bills listed in this capture.</p>{/if}
          <div class="related">
            {#each detail.related as r}<article>
                <span class="eyebrow">{r.id}</span><strong>{r.title}</strong
                >{#each r.relationships as relation}<p>
                    {relation.type} · identified by {relation.identifiedBy || 'not supplied'}
                  </p>{/each}{#if r.latest}<p class="small">
                    {r.latest.date} · {r.latest.text}
                  </p>{/if}
                <div class="links">
                  {#if dataset.bills.some((b) => b.id === r.id)}<button
                      disabled={!ready}
                      onclick={() => navigate({ bill: r.id })}>Follow collected bill →</button
                    >{/if}<a href={relatedUrl(r)} target="_blank" rel="noreferrer"
                    >Official relationship target ↗</a
                  >
                </div>
              </article>{/each}
          </div>
          {#if detail.laws.length}<p>
              {detail.laws.map((l) => `${l.type} ${l.number}`).join(' · ')}
            </p>{/if}
          <details>
            <summary>Committees · {detail.committees.length}</summary
            >{#each detail.committees as c}<article>
                <h4>{c.name} · {c.chamber}</h4>
                <ul>
                  {#each c.activities as a}<li>{a.date.slice(0, 10)} — {a.name}</li>{/each}
                </ul>
              </article>{/each}
          </details>
          <h4>Action history <span>{detail.actions.length} source entries</span></h4>
          <p class="small">
            Source order retained. Same-day entries may repeat an event under different recording
            systems; entry counts are not distinct decisions.
          </p>
          <ol class="history">
            {#each detail.actions.slice(0, actionLimit) as a}<li>
                <time>{a.date}</time>
                <p>{a.text || 'No action text supplied.'}</p>
                <small
                  >{a.type || 'Unclassified'} · {a.sourceName || 'Source system not named'}{a.code
                    ? ` · ${a.code}`
                    : ''}{a.time ? ` · raw time ${a.time}` : ''}</small
                >{#each a.votes as v}{#if safeVoteUrl(v.url)}<a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer">{v.chamber} roll {v.roll} · source vote ↗</a
                    >{/if}{/each}
              </li>{/each}
          </ol>
          {#if actionLimit < detail.actions.length}<button onclick={() => (actionLimit += 40)}
              >Show more actions</button
            >{/if}
          <details class="amendments">
            <summary>Amendments · {detail.amendments.length}</summary>
            <p>
              Submitted amendments are not necessarily offered, adopted, or incorporated. Their
              actions are separate from passage of the bill.
            </p>
            {#each detail.amendments.slice(0, amendmentLimit) as a}<article>
                <h4>{a.id}</h4>
                <p>{a.purpose || a.description || 'No purpose or description supplied.'}</p>
                {#if a.parentAmendment}<p class="small">
                    Amends {a.parentAmendment}; not a direct amendment to the base bill.
                  </p>{/if}{#if a.latest}<p>
                    Source latest action: {a.latest.date} — {a.latest.text}
                  </p>{/if}
                <ul>
                  {#each a.actions as action}<li>
                      {action.date} — {action.text || 'No action text supplied.'}
                      <small>({action.type || 'unclassified'})</small>
                    </li>{/each}
                </ul>
                <a href={amendmentUrl(a)} target="_blank" rel="noreferrer">Official amendment ↗</a>
              </article>{/each}{#if amendmentLimit < detail.amendments.length}<button
                onclick={() => (amendmentLimit += 30)}>Show more amendments</button
              >{/if}
          </details>
          <a
            class="download"
            href={`${base}/data/graveyard/releases/${data.graveyard.manifest.release}/bills/${selected.id}.json`}
            download>Download this verified bill record ↓</a
          >
        {/if}
      </section>
    {/if}

    <section class="comparison">
      <div class="section-head">
        <p class="eyebrow">Subject by subject</p>
        <h3>What moves in this sample?</h3>
      </div>
      <p class="small">
        Each row is one official policy area in one Congress. Counts show the denominator, not a
        national success rate. Progress, inactivity, and policy filters do not shrink this
        comparison’s denominator; search, sponsor state, origin, and Congress filters do. Different
        follow-up lengths prevent a like-for-like historical trend claim.
      </p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll this overflow region.) -->
      <div class="table-scroll" tabindex="0" role="region" aria-label="Policy progress comparison">
        <table>
          <thead
            ><tr
              ><th>Policy / Congress</th><th>Bills</th><th>Passed ≥1 chamber</th><th>Law</th><th
                >180+ quiet days*</th
              ></tr
            ></thead
          ><tbody
            >{#each groups as g}<tr
                ><th
                  ><button
                    disabled={!ready}
                    onclick={() =>
                      navigate({ policy: g.policy, congress: String(g.congress), bill: null })}
                    >{g.policy}<small>{g.congress}th Congress</small></button
                  ></th
                ><td>{g.total}</td><td
                  ><div class="ratio">
                    <span style={`width:${(100 * g.passed) / g.total}%`}></span>
                  </div>
                  {g.passed}/{g.total}</td
                ><td>{g.law}/{g.total}</td><td>{g.quiet}/{g.total}</td></tr
              >{/each}</tbody
          >
        </table>
      </div>
      {#if !groups.length}<p>No bills match this comparison’s scope.</p>{/if}
    </section>
    <div class="section-head">
      <p class="eyebrow">Open the evidence</p>
      <h3>Every proposal has a record.</h3>
    </div>
    <div class="bill-list">
      {#each bills.slice(0, limit) as b (b.id)}<button
          class="bill-card"
          disabled={!ready}
          onclick={() => navigate({ bill: b.id })}
          in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 180 }}
          ><div class="card-top">
            <span>{billLabel(b)} · {b.congress}</span><span>{furthestStage(b.milestones)}</span>
          </div>
          <h4>{b.title}</h4>
          <p>{b.latest.text}</p>
          <div class="card-bottom">
            <span>{b.latest.date} · {b.policy}</span><strong>Inspect →</strong>
          </div>
          {#if b.relatedLaw.length}<div class="related-flag">
              Related public-law pathway recorded
            </div>{/if}</button
        >{/each}
    </div>
    {#if !bills.length}<p role="status">
        No bills match these filters. This is a bounded collection, not an assertion that no such
        bills exist.
      </p>{/if}
    {#if limit < bills.length}<button class="more" onclick={() => (limit += 24)}
        >Show 24 more · {bills.length - limit} remaining</button
      >{/if}
    <footer>
      GovInfo BILLSTATUS · official House, Senate and Library of Congress records. Collection
      snapshot, not a live floor feed. <a
        href="https://github.com/usgpo/bill-status"
        target="_blank"
        rel="noreferrer">Source documentation ↗</a
      >
    </footer>
  {/if}
</div>

<style>
  .bill-page {
    --ink: #283c48;
    --accent: #9b673f;
    --muted: #667580;
    color: var(--ink);
  }
  .kicker,
  .capture,
  .detail-top,
  .card-top,
  .card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .kicker {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid #d9dfe1;
    padding-bottom: 16px;
  }
  .bill-page a {
    color: #7d5436;
    text-underline-offset: 4px;
  }
  .bill-page header {
    margin: 30px 0 22px;
  }
  .bill-page h2 {
    font-size: clamp(42px, 5vw, 72px);
    line-height: 0.92;
    letter-spacing: -0.03em;
    margin: 12px 0 20px;
  }
  .bill-page h2 em {
    color: var(--accent);
    font-style: normal;
  }
  .bill-page header > p:last-child {
    max-width: 57ch;
    line-height: 1.65;
  }
  .bill-page .eyebrow {
    color: #7c6657;
    font-size: 10px;
    letter-spacing: 0.13em;
  }
  .capture {
    justify-content: flex-start;
    font-size: 12px;
    padding: 13px 0;
  }
  .live-dot {
    width: 6px;
    height: 6px;
    background: #9b673f;
    border-radius: 50%;
    box-shadow: 0 0 0 5px #9b673f12;
  }
  .coverage {
    background: #f3f1ec;
    border: 1px solid #e4dfd6;
    padding: 14px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.6;
  }
  summary {
    cursor: pointer;
    font-weight: 650;
  }
  .coverage ul {
    max-height: 180px;
    overflow: auto;
  }
  .search {
    margin-top: 24px;
  }
  .search label,
  .filters label {
    display: block;
    font-size: 11px;
    font-weight: 650;
  }
  .search > div {
    display: flex;
    margin-top: 8px;
    gap: 8px;
  }
  .search input {
    min-width: 0;
    flex: 1;
  }
  .bill-page input,
  .bill-page select {
    font: inherit;
    font-size: 12px;
    padding: 11px;
    border: 1px solid #d6dce0;
    border-radius: 7px;
    background: #fff;
    color: var(--ink);
    width: 100%;
  }
  .bill-page button {
    font: inherit;
    font-size: 12px;
    color: var(--ink);
    border: 1px solid #d6dce0;
    background: #fff;
    border-radius: 7px;
    padding: 10px 13px;
    cursor: pointer;
  }
  .bill-page button:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  .bill-page button:focus-visible,
  .bill-page a:focus-visible {
    outline: 3px solid #bf9879;
    outline-offset: 3px;
  }
  .search button {
    background: var(--ink);
    color: white;
  }
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 16px 0;
  }
  .filters select {
    margin-top: 6px;
  }
  .reset {
    font-size: 12px;
    align-self: center;
  }
  .totals {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid #deddd8;
    border-bottom: 1px solid #deddd8;
    margin-top: 24px;
    padding: 18px 0;
    gap: 8px;
  }
  .totals strong {
    display: block;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 34px;
    line-height: 1.1;
  }
  .totals span {
    display: block;
    font-size: 10px;
    margin-top: 7px;
  }
  .small {
    font-size: 11px;
    line-height: 1.6;
    color: var(--muted);
  }
  .section-head {
    margin: 30px 0 14px;
  }
  .section-head h3 {
    font-size: 25px;
    margin: 8px 0;
  }
  .bill-list {
    display: grid;
    gap: 12px;
  }
  .bill-page .bill-card {
    text-align: left;
    padding: 18px;
    border-radius: 12px;
    transition:
      border-color 0.18s,
      transform 0.18s;
    overflow: hidden;
  }
  .bill-page .bill-card:hover {
    border-color: #a58062;
    transform: translateY(-2px);
  }
  .card-top {
    font-size: 10px;
    color: var(--muted);
  }
  .card-top > span:last-child {
    padding: 4px 7px;
    border-radius: 4px;
    background: #f2eee8;
    color: #765b43;
  }
  .bill-card h4 {
    font-size: 19px;
    margin: 13px 0;
  }
  .bill-card > p {
    font-size: 12px;
    line-height: 1.55;
    color: #52616c;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-bottom {
    font-size: 10px;
    margin-top: 18px;
  }
  .card-bottom strong {
    white-space: nowrap;
    color: #805938;
  }
  .related-flag {
    font-size: 10px;
    color: #775332;
    border-top: 1px solid #eee5da;
    margin-top: 12px;
    padding-top: 10px;
  }
  .bill-detail {
    scroll-margin-top: 15px;
    border: 1px solid #cbb9a8;
    border-radius: 14px;
    padding: 22px;
    background: linear-gradient(145deg, #fffaf3, #fff);
    margin: 26px 0;
    overflow-wrap: anywhere;
  }
  .detail-top {
    font-size: 12px;
    color: #7d5c42;
  }
  .bill-detail h3 {
    font-size: 30px;
    line-height: 1.15;
    margin: 20px 0 10px;
  }
  .last-action {
    padding: 16px;
    border-left: 3px solid #b78456;
    background: #f0e9df;
    margin: 20px 0;
  }
  .last-action blockquote {
    margin: 12px 0;
    font-size: 16px;
    line-height: 1.6;
  }
  .last-action > p:last-child {
    font-size: 11px;
    color: #685c51;
    line-height: 1.6;
  }
  .notice {
    padding: 14px;
    background: #e9eee9;
    border: 1px solid #c6d6c6;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.6;
  }
  .milestones {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 24px 0;
  }
  .milestones li {
    display: grid;
    grid-template-columns: 12px 1fr;
    gap: 4px 8px;
    color: #7a858d;
    font-size: 11px;
  }
  .milestones i {
    width: 8px;
    height: 8px;
    border: 1px solid #aeb5b8;
    border-radius: 50%;
    margin-top: 2px;
  }
  .milestones .reached {
    color: #765232;
  }
  .milestones .reached i {
    background: #a97648;
    border-color: #a97648;
  }
  .milestones small {
    grid-column: 2;
    font-size: 10px;
  }
  .sponsors span {
    display: block;
    font-size: 12px;
    line-height: 1.7;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 13px;
    font-size: 12px;
    line-height: 1.7;
  }
  .related {
    display: grid;
    gap: 10px;
  }
  .related article,
  .amendments article {
    border: 1px solid #deded6;
    border-radius: 8px;
    padding: 14px;
    font-size: 12px;
  }
  .related strong {
    display: block;
    margin-top: 8px;
  }
  .bill-detail h4 {
    font-size: 16px;
    margin: 24px 0 12px;
  }
  .bill-detail h4 > span {
    font-size: 11px;
    font-weight: 400;
  }
  .bill-detail details {
    margin: 20px 0;
    font-size: 12px;
    line-height: 1.6;
  }
  .history {
    list-style: none;
    padding: 0 0 0 14px;
    border-left: 1px solid #ccbda9;
  }
  .history li {
    position: relative;
    padding: 0 0 20px 8px;
  }
  .history li::before {
    content: '';
    position: absolute;
    left: -18px;
    top: 3px;
    width: 6px;
    height: 6px;
    background: #ae815d;
    border-radius: 50%;
  }
  .history time {
    font-size: 11px;
    font-weight: 650;
  }
  .history p {
    font-size: 12px;
    line-height: 1.6;
    margin: 7px 0;
  }
  .history small {
    font-size: 10px;
    color: var(--muted);
  }
  .history a {
    display: block;
    font-size: 11px;
    margin: 6px 0;
  }
  .amendments article {
    margin: 12px 0;
  }
  .amendments li {
    margin-bottom: 9px;
  }
  .download {
    display: inline-block;
    font-size: 12px;
    margin-top: 20px;
  }
  .table-scroll {
    max-height: 440px;
    overflow: auto;
    border: 1px solid #e0e0d8;
    border-radius: 9px;
  }
  .table-scroll table {
    border-collapse: collapse;
    width: 100%;
    font-size: 11px;
    min-width: 450px;
  }
  .table-scroll th,
  .table-scroll td {
    padding: 11px;
    border-bottom: 1px solid #e8e8e1;
    text-align: left;
  }
  .table-scroll thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #f5f3ec;
    font-size: 10px;
  }
  .table-scroll th button {
    padding: 0;
    border: 0;
    text-align: left;
    background: none;
    font-size: 11px;
  }
  .table-scroll th small {
    display: block;
    font-weight: 400;
    color: var(--muted);
    margin-top: 5px;
  }
  .ratio {
    height: 3px;
    width: 75px;
    background: #e7e5df;
    margin-bottom: 6px;
    border-radius: 2px;
    overflow: hidden;
  }
  .ratio span {
    display: block;
    height: 100%;
    background: #9e7957;
    transition: width 0.25s;
  }
  .more {
    margin-top: 18px;
    width: 100%;
  }
  footer {
    font-size: 10px;
    line-height: 1.8;
    color: var(--muted);
    margin-top: 28px;
    padding-top: 16px;
    border-top: 1px solid #ddd;
  }
  .bill-page :global(p) {
    overflow-wrap: anywhere;
  }
  @media (max-width: 650px) {
    .bill-detail {
      padding: 15px;
    }
    .totals {
      gap: 5px;
    }
    .totals span {
      font-size: 9px;
    }
    .kicker {
      font-size: 9px;
    }
    .filters {
      gap: 10px;
    }
    .bill-page h2 {
      font-size: 52px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bill-page .bill-card,
    .ratio span {
      transition: none;
    }
    .bill-page .bill-card:hover {
      transform: none;
    }
  }
</style>
