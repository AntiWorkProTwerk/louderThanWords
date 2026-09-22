<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    complaintSelection,
    complaintPeriods,
    complaintGroups,
    filterComplaints,
    complaintExamples,
  } from '$lib/civic/complaints';
  import { monthsBetween } from '$lib/civic/economy';
  let { data } = $props();
  let reduced = $state(true),
    limit = $state(24);
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.complaints?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams()),
    filters = $derived(dataset ? complaintSelection(dataset, params) : null);
  const view = $derived(
    ['all', 'records', 'changes'].includes(params.get('view') ?? '')
      ? params.get('view')!
      : 'rising',
  );
  const months = $derived(dataset ? monthsBetween(dataset.plan.from, dataset.plan.through) : []);
  const computed = $derived.by(() => {
    if (!dataset || !filters) return { periods: null, groups: [], error: '' };
    try {
      return {
        periods: complaintPeriods(dataset, filters.split),
        groups: complaintGroups(
          dataset,
          { state: filters.state, company: filters.company, q: filters.q },
          filters.split,
        ),
        error: '',
      };
    } catch {
      return {
        periods: null,
        groups: [],
        error: 'Choose a split month inside the captured range.',
      };
    }
  });
  const groups = $derived(
    computed.groups.filter((g) => view !== 'rising' || g.signal !== 'context'),
  );
  const allRecords = $derived(dataset && filters ? filterComplaints(dataset, filters) : []);
  const records = $derived(
    computed.periods && filters
      ? allRecords.filter(
          (r) =>
            filters.period === 'all' ||
            (filters.period === 'baseline'
              ? r.received < computed.periods!.after.from
              : r.received >= computed.periods!.after.from),
        )
      : [],
  );
  const examples = $derived(complaintExamples(records)),
    selected = $derived(dataset?.records.find((r) => r.id === params.get('complaint')));
  const selectedGroup = $derived(computed.groups.find((g) => g.id === filters?.cluster));
  const monthly = $derived(
      months.map((month) => ({
        month,
        count: allRecords.filter((r) => r.received.startsWith(month)).length,
      })),
    ),
    maxMonth = $derived(Math.max(1, ...monthly.map((m) => m.count)));
  const visibleChanges = $derived(
    dataset?.changes.filter((c) => !params.get('complaint') || c.id === params.get('complaint')) ??
      [],
  );
  const pct = (n: number | null) =>
    n === null ? 'No baseline' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  $effect(() => {
    void filters;
    void view;
    limit = 24;
  });
  async function navigate(changes: Record<string, string | null>, replace = false) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
  }
  const signalLabel = (signal: string) =>
    signal === 'rising'
      ? 'Rising daily volume'
      : signal === 'new_in_slice'
        ? 'New in this slice'
        : 'Context';
</script>

<svelte:head
  ><title>Consumer Problem Radar · Louder Than Words</title><meta
    name="description"
    content="Explore changing complaint categories and the public records behind them, without treating allegations as findings or raw counts as company rankings."
  /></svelte:head
>
<div class="evidence-page complaints-page">
  <div class="complaint-kicker">
    <span>30 / Everyday financial friction</span><a
      href={`${base}/records/paycheck/${filters?.state ? `?state=${filters.state}` : ''}`}
      >Regional context ↗</a
    >
  </div>
  <header>
    <p class="eyebrow">Patterns worth examining</p>
    <h2>Signals.<br /><em>Not verdicts.</em></h2>
    <p>
      Find growing groups of reported problems. See what changed, open the public records, and keep
      the limits of the evidence in view.
    </p>
  </header>
  {#if !dataset || !filters}<div class="complaint-empty" role="alert">
      <h3>Complaint snapshot unavailable</h3>
      <p>{data.complaintsError}</p>
      <a href={page.url.pathname}>Reload ↻</a>
    </div>{:else}
    <div class="complaint-coverage">
      <span></span><strong>CFPB public records</strong><span
        >Observed {dataset.observedAt.slice(0, 10)}</span
      >
    </div>
    <p class="complaint-scope">
      {dataset.plan.product} · {dataset.plan.from}–{dataset.plan.through} · {dataset.plan.companies.join(
        ' / ',
      )}
    </p>
    <div class="complaint-caution">
      <strong>Complaints are allegations, not findings.</strong> This is a defined collection, not a customer
      survey or a fair ranking of companies. Customer counts and market shares are not included.
    </div>
    <details class="complaint-method">
      <summary>How the radar works—and what is missing</summary>
      <p>
        Every configured month was collected in full against the API’s reported total. This includes
        only the named companies and product, not the whole market. Grouping uses the source’s exact
        product, sub-product, issue and sub-issue categories—not AI sentiment or guessed misconduct.
      </p>
      <p>
        “Rising” means at least five records in each period and a 25% or greater rise in records per
        calendar day. “New in this slice” means zero in the baseline and at least five in the recent
        period. These transparent display thresholds are not statistical significance tests. Small
        groups remain available under All categories.
      </p>
      <p>
        The periods may have different lengths, so daily volume is compared alongside raw counts and
        the category’s share of the currently filtered collection. Neither metric is a rate of
        problems per customer. Changes in reporting, awareness, products, issue labels and
        publication lag can affect the pattern.
      </p>
      <p>
        CFPB announced the end of routine narrative publication on August 14, 2026. The current API
        provides structured records, not the consumer’s written account. We do not generate
        replacement stories or silently restore withdrawn narrative text. <a
          href="https://www.consumerfinance.gov/about-us/newsroom/the-cfpb-to-cease-discretionary-publication-of-complaint-narratives-and-visualizations/"
          target="_blank"
          rel="noreferrer">Read the source notice ↗</a
        >
      </p>
      <p>
        Example cards are selected deterministically across the matching received-date order: first,
        middle and last. They illustrate the captured categories but are not a statistically
        representative sample. “Closed with explanation” and timely-response flags are
        company-response metadata, not proof that a problem was resolved or a legal obligation met.
      </p>
      <p>
        State means the reported consumer state, not the company’s headquarters. Map points are
        state label anchors. ZIP codes, demographic tags and personal addresses are not exposed
        here; unknown or unmapped states are retained in totals. Regional economic links are
        geographic context, not an explanation of complaint causes.
      </p>
      <ul>
        {#each dataset.coverage as month}<li>
            {month.month}: {month.total} records · complete query
          </li>{/each}
      </ul>
      <a
        href={`${base}/data/complaints/releases/${data.complaints?.manifest.release}/data.json`}
        download>Download this complete source-backed snapshot ↧</a
      >
    </details>
    <form class="complaint-filters" onsubmit={(e) => e.preventDefault()}>
      <label class="complaint-wide"
        >Company within this collection<select
          aria-label="Company within this collection"
          value={filters.company}
          onchange={(e) =>
            navigate({ company: e.currentTarget.value, complaint: null, cluster: null })}
          ><option value="">All collected companies</option
          >{#each dataset.plan.companies as company}<option value={company}>{company}</option
            >{/each}</select
        ></label
      ><label
        >Recent period begins<select
          aria-label="Recent period begins"
          value={filters.split}
          onchange={(e) => navigate({ split: e.currentTarget.value, complaint: null })}
          >{#each months.slice(1) as month}<option value={month}>{month}</option>{/each}</select
        ></label
      ><label
        >Records and map<select
          aria-label="Records and map"
          value={filters.period}
          onchange={(e) => navigate({ period: e.currentTarget.value, complaint: null })}
          ><option value="recent">Recent period</option><option value="baseline"
            >Baseline period</option
          ><option value="all">Both periods</option></select
        ></label
      ><label class="complaint-wide"
        >Search record fields<input
          type="search"
          aria-label="Search record fields"
          value={filters.q}
          placeholder="Issue, company or complaint ID"
          oninput={(e) => navigate({ q: e.currentTarget.value, complaint: null }, true)}
        /></label
      >
    </form>
    {#if filters.state || filters.company || filters.cluster || filters.q}<div
        class="complaint-filter-note"
      >
        <span
          >Filtered{filters.state ? ` · ${filters.state}` : ''}{selectedGroup
            ? ` · ${selectedGroup.issue}`
            : ''}</span
        ><button
          onclick={() =>
            navigate({ state: null, company: null, cluster: null, q: null, complaint: null })}
          >Clear filters</button
        >
      </div>{/if}
    {#if computed.error}<div class="complaint-empty" role="alert">
        {computed.error}
      </div>{:else if computed.periods}
      <div class="complaint-periods">
        <div>
          <span>Baseline · {computed.periods.before.days} days</span><strong
            >{computed.periods.before.from} → {computed.periods.before.through}</strong
          >
        </div>
        <div>
          <span>Recent · {computed.periods.after.days} days</span><strong
            >{computed.periods.after.from} → {computed.periods.after.through}</strong
          >
        </div>
      </div>
      <div class="complaint-stats">
        <div><strong>{records.length}</strong><span>Matching records · {filters.period}</span></div>
        <div>
          <strong>{computed.groups.filter((g) => g.signal !== 'context').length}</strong><span
            >Categories meeting display thresholds</span
          >
        </div>
        <div>
          <strong>{records.filter((r) => !r.state).length}</strong><span
            >Without a mapped state</span
          >
        </div>
      </div>
      <figure class="complaint-months">
        <figcaption>Received-month counts in this filtered collection · both periods</figcaption>
        <div>
          {#each monthly as month}<div>
              <strong>{month.count}</strong><span
                class:recent={month.month >= filters.split}
                style={`height:${(month.count / maxMonth) * 76}px`}
              ></span><small>{month.month}</small>
            </div>{/each}
        </div>
      </figure>
      <nav class="complaint-tabs" aria-label="Complaint views">
        {#each [['rising', 'Rising categories'], ['all', 'All categories'], ['records', 'Complaint records'], ['changes', 'Capture changes']] as [id, label]}<button
            aria-pressed={view === id}
            onclick={() =>
              navigate({
                view: id,
                complaint: null,
                ...(id === 'rising' || id === 'all' ? { cluster: null } : {}),
              })}>{label}</button
          >{/each}
      </nav>
      {#if selected}{#key selected.id}<article
            class="complaint-detail"
            in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 180 }}
          >
            <button class="complaint-close" onclick={() => navigate({ complaint: null })}
              >Close record ×</button
            >
            <p class="eyebrow">Complaint {selected.id} · unverified allegation</p>
            <h3>{selected.issue}</h3>
            <p>{selected.subIssue ?? 'No sub-issue reported'}</p>
            <dl>
              <dt>Company</dt>
              <dd>{selected.company}</dd>
              <dt>Product</dt>
              <dd>{selected.product} / {selected.subProduct ?? 'Unspecified'}</dd>
              <dt>Received / sent to company</dt>
              <dd>{selected.received} / {selected.sent ?? 'Unknown'}</dd>
              <dt>Reported consumer state</dt>
              <dd>{selected.reportedState ?? 'Unknown'}{!selected.state ? ' · not mapped' : ''}</dd>
              <dt>Company response</dt>
              <dd>{selected.companyResponse ?? 'Not supplied'}</dd>
              <dt>Reported timely response</dt>
              <dd>{selected.timely}</dd>
              <dt>Company public response</dt>
              <dd>{selected.companyPublicResponse ?? 'Not supplied'}</dd>
            </dl>
            <p class="complaint-caution">
              The narrative is unavailable in the current API. These are the original structured
              categories and response fields, not a summary of the consumer’s story.
            </p>
            <a href={selected.source.url} target="_blank" rel="noreferrer"
              >Open original CFPB record ↗</a
            >
          </article>{/key}{/if}
      {#if view === 'changes'}<h3>Changes between local captures</h3>
        <p class="complaint-note">
          Tracking began {dataset.trackingStartedAt.slice(0, 10)}. A newly observed old complaint is
          not a newly submitted complaint. Changes are collection-wide, not restricted by the
          state/company filters.
        </p>
        {#if !visibleChanges.length}<div class="complaint-empty">
            <h3>No capture changes yet.</h3>
            <p>
              This is the baseline observation, or the source fields have not changed since the
              previous capture.
            </p>
          </div>{:else}{#each visibleChanges.slice(0, limit) as change}<div
              class="complaint-change"
            >
              <strong>{change.id} · {change.kind.replaceAll('_', ' ')}</strong>
              <p>{change.detail}</p>
            </div>{/each}{#if visibleChanges.length > limit}<button onclick={() => (limit += 24)}
              >Show 24 more changes</button
            >{/if}{/if}
      {:else if view === 'records'}
        {#if selectedGroup}<h3>{selectedGroup.issue}</h3>
          <p>
            {selectedGroup.subIssue ?? 'No sub-issue'} · {selectedGroup.subProduct ??
              'No sub-product'}
          </p>{/if}
        <details class="complaint-examples">
          <summary>Three examples from this slice</summary>
          <p>
            First, middle and last in received-date order. Illustrative, not statistically
            representative.
          </p>
          {#each examples as record}<button onclick={() => navigate({ complaint: record.id })}
              >{record.received} · {record.id} · {record.issue} ↗</button
            >{/each}
        </details>
        <p class="complaint-note">
          {records.length} matching public records · showing {Math.min(limit, records.length)}
        </p>
        <div class="complaint-records">
          {#each records.slice(0, limit) as record}<button
              class="complaint-card"
              onclick={() => navigate({ complaint: record.id })}
              ><span
                >{record.received} · {record.reportedState ?? 'Unknown state'} · {record.id}</span
              >
              <h3>{record.issue}</h3>
              <p>{record.subIssue ?? record.subProduct ?? 'No finer category supplied'}</p>
              <strong>{record.company}</strong><small
                >{record.companyResponse ?? 'No response field'} · allegation, not a finding ↗</small
              ></button
            >{/each}
        </div>
        {#if !records.length}<div class="complaint-empty">
            <h3>No records in this slice.</h3>
            <p>
              Try both periods or clear a filter. This is not evidence that no customers had
              problems.
            </p>
          </div>{/if}{#if records.length > limit}<button
            class="complaint-more"
            onclick={() => (limit += 24)}>Show 24 more complaints</button
          >{/if}
      {:else}<div class="complaint-groups">
          {#each groups.slice(0, limit) as group}<button
              class="complaint-group"
              onclick={() => navigate({ cluster: group.id, view: 'records', complaint: null })}
              ><span class="complaint-signal">{signalLabel(group.signal)}</span>
              <h3>{group.issue}</h3>
              <p>{group.subIssue ?? 'No sub-issue'} · {group.subProduct ?? 'No sub-product'}</p>
              <div class="complaint-group-stats">
                <span>Records<strong>{group.before} → {group.after}</strong></span><span
                  >Records / day<strong
                    >{group.beforePerDay.toFixed(2)} → {group.afterPerDay.toFixed(2)}</strong
                  ></span
                ><span>Daily-volume change<strong>{pct(group.growth)}</strong></span>
              </div>
              <small
                >Share of filtered collection: {group.beforeShare === null
                  ? 'undefined'
                  : `${group.beforeShare.toFixed(1)}%`} → {group.afterShare === null
                  ? 'undefined'
                  : `${group.afterShare.toFixed(1)}%`}{group.shareChange === null
                  ? ''
                  : ` (${group.shareChange > 0 ? '+' : ''}${group.shareChange.toFixed(1)} percentage points)`}</small
              ><b>Inspect source records ↗</b></button
            >{/each}
        </div>
        {#if !groups.length}<div class="complaint-empty">
            <h3>
              {view === 'rising'
                ? 'No categories meet these thresholds.'
                : 'No categories in this slice.'}
            </h3>
            <p>
              Inspect all categories or clear filters. Absence of a signal is not proof that
              customers are satisfied.
            </p>
          </div>{/if}{#if groups.length > limit}<button
            class="complaint-more"
            onclick={() => (limit += 24)}>Show 24 more categories</button
          >{/if}{/if}
    {/if}
    <footer>
      One reported experience is not every customer’s experience. Every displayed record links to
      the source.
    </footer>
  {/if}
</div>

<style>
  .complaints-page {
    --ink: #3e3045;
    --accent: #986378;
    color: var(--ink);
  }
  .complaints-page a {
    color: #805068;
  }
  .complaint-kicker,
  .complaint-coverage,
  .complaint-filter-note {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 11px;
  }
  .complaint-kicker {
    justify-content: space-between;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 24px;
  }
  .complaints-page header h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(50px, 5vw, 76px);
    line-height: 0.94;
    margin: 12px 0 18px;
  }
  .complaints-page header em {
    font-style: normal;
    color: var(--accent);
  }
  .complaints-page header > p:last-child {
    font-size: 14px;
    line-height: 1.6;
    max-width: 60ch;
  }
  .complaint-coverage {
    padding: 13px 0;
    margin-top: 18px;
    border-top: 1px solid #e7dfe4;
  }
  .complaint-coverage > span:first-child {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  .complaint-scope,
  .complaint-note {
    font-size: 12px;
    line-height: 1.6;
  }
  .complaint-caution {
    padding: 12px;
    background: #f7f0e7;
    border-left: 3px solid #b69767;
    font-size: 12px;
    line-height: 1.6;
    margin: 14px 0;
  }
  .complaint-method,
  .complaint-examples {
    border: 1px solid #e4dbe1;
    border-radius: 8px;
    background: #faf6f8;
    padding: 13px;
    font-size: 12px;
    line-height: 1.7;
  }
  .complaints-page summary {
    cursor: pointer;
    font-weight: 650;
  }
  .complaint-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 22px 0;
  }
  .complaint-filters label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
  }
  .complaint-wide {
    grid-column: 1/-1;
  }
  .complaint-filters input,
  .complaint-filters select {
    min-width: 0;
    width: 100%;
    padding: 11px;
    border: 1px solid #d7cbd3;
    border-radius: 6px;
    background: #fff;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
  }
  .complaint-filter-note {
    justify-content: space-between;
  }
  .complaint-periods {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 20px 0;
    font-size: 10px;
  }
  .complaint-periods strong {
    display: block;
    font-size: 12px;
    margin-top: 5px;
  }
  .complaint-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
    margin: 20px 0;
  }
  .complaint-stats strong {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 37px;
    display: block;
    color: var(--accent);
  }
  .complaint-stats span {
    font-size: 11px;
    line-height: 1.5;
    display: block;
  }
  .complaint-months {
    margin: 22px 0;
    padding: 16px;
    border: 1px solid #e7dde3;
    border-radius: 8px;
    background: #fcf9fb;
    overflow: auto;
  }
  .complaint-months figcaption {
    font-size: 11px;
    margin-bottom: 20px;
  }
  .complaint-months > div {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    min-width: max-content;
  }
  .complaint-months > div > div {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    min-width: 45px;
    gap: 7px;
    font-size: 12px;
  }
  .complaint-months span {
    width: 100%;
    max-width: 50px;
    background: #c9bfca;
    border-radius: 3px 3px 0 0;
    transition: height 0.2s ease;
  }
  .complaint-months span.recent {
    background: var(--accent);
  }
  .complaint-months small {
    font-size: 9px;
  }
  .complaint-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 22px 0;
  }
  .complaints-page button {
    cursor: pointer;
    font: inherit;
  }
  .complaint-tabs button,
  .complaint-filter-note button,
  .complaint-close,
  .complaint-more,
  .complaint-examples button {
    border: 1px solid #d8cdd5;
    background: #fff;
    border-radius: 6px;
    padding: 10px 12px;
    color: var(--ink);
    font-size: 12px;
  }
  .complaint-tabs button[aria-pressed='true'] {
    background: var(--ink);
    color: #fff;
  }
  .complaint-groups,
  .complaint-records {
    display: grid;
    gap: 13px;
  }
  .complaint-group,
  .complaint-card {
    width: 100%;
    text-align: left;
    padding: 18px;
    border: 1px solid #e0d5de;
    border-radius: 9px;
    background: linear-gradient(130deg, #fff, #faf5f8);
    color: var(--ink);
    transition:
      transform 0.16s ease,
      border-color 0.16s ease;
  }
  .complaint-group:hover,
  .complaint-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
  }
  .complaint-signal {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #82526a;
  }
  .complaint-group h3,
  .complaint-card h3 {
    font-size: 17px;
    line-height: 1.35;
  }
  .complaint-group p,
  .complaint-card p {
    font-size: 12px;
    line-height: 1.5;
  }
  .complaint-group-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin: 17px 0;
  }
  .complaint-group-stats span {
    font-size: 10px;
  }
  .complaint-group-stats strong {
    display: block;
    font-size: 16px;
    margin-top: 5px;
  }
  .complaint-group > small,
  .complaint-group > b {
    display: block;
    font-size: 11px;
    line-height: 1.6;
  }
  .complaint-group > b {
    margin-top: 15px;
  }
  .complaint-card > span,
  .complaint-card small {
    font-size: 10px;
    line-height: 1.5;
    display: block;
  }
  .complaint-card > strong {
    font-size: 11px;
    display: block;
    margin-bottom: 10px;
  }
  .complaint-detail {
    border: 1px solid #c9b0bf;
    border-top: 4px solid var(--accent);
    border-radius: 9px;
    padding: 20px;
    margin: 20px 0;
    background: #fcf8fa;
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .complaint-close {
    float: right;
    margin: 0 0 12px 12px;
  }
  .complaint-detail h3 {
    clear: both;
    font-size: 24px;
    line-height: 1.2;
  }
  .complaint-detail dl {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 10px;
    font-size: 12px;
  }
  .complaint-detail dt {
    color: #77667a;
  }
  .complaint-detail dd {
    margin: 0;
  }
  .complaint-examples {
    margin: 16px 0;
  }
  .complaint-examples button {
    display: block;
    text-align: left;
    margin: 8px 0;
    width: 100%;
  }
  .complaint-more {
    margin-top: 16px;
  }
  .complaint-empty {
    padding: 22px 14px;
    border: 1px dashed #cbb7c5;
    margin: 18px 0;
    font-size: 13px;
    line-height: 1.6;
  }
  .complaint-change {
    padding: 13px;
    border-bottom: 1px solid #ded5dc;
    font-size: 12px;
  }
  .complaints-page footer {
    margin: 26px 0 8px;
    font-size: 11px;
    line-height: 1.6;
    color: #756878;
  }
  .complaints-page button:focus-visible,
  .complaints-page a:focus-visible,
  .complaints-page input:focus-visible,
  .complaints-page select:focus-visible {
    outline: 3px solid #dbb94e;
    outline-offset: 3px;
  }
  @media (max-width: 550px) {
    .complaint-stats {
      grid-template-columns: 1fr 1fr;
    }
    .complaint-stats > div:last-child {
      grid-column: 1/-1;
    }
    .complaint-periods {
      grid-template-columns: 1fr;
    }
    .complaint-group-stats {
      grid-template-columns: 1fr 1fr;
    }
    .complaint-group-stats > span:last-child {
      grid-column: 1/-1;
    }
    .complaint-detail {
      padding: 14px;
    }
    .complaint-detail dl {
      grid-template-columns: 1fr;
    }
    .complaint-detail dd {
      margin-bottom: 8px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .complaint-group,
    .complaint-card,
    .complaint-months span {
      transition: none;
    }
    .complaint-group:hover,
    .complaint-card:hover {
      transform: none;
    }
  }
</style>
