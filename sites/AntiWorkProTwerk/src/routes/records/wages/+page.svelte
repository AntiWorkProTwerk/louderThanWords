<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    wageSelection,
    filterWages,
    wageEmployers,
    wageTotals,
    wageMoney,
    type WageCase,
  } from '$lib/civic/wages';
  import { createWageDetailReader } from '$lib/civic/wages-repository';
  let { data } = $props();
  let reduced = $state(true),
    limit = $state(24);
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.wages?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams()),
    filterKey = $derived(JSON.stringify(wageSelection(params))),
    filters = $derived(JSON.parse(filterKey) as ReturnType<typeof wageSelection>);
  const view = $derived(
    params.get('view') === 'cases'
      ? 'cases'
      : params.get('view') === 'changes'
        ? 'changes'
        : 'employers',
  );
  const records = $derived(dataset ? filterWages(dataset, filters) : []),
    totals = $derived(wageTotals(records));
  const repeated = $derived(params.get('repeated') === 'yes'),
    employerGroups = $derived(wageEmployers(records)),
    employers = $derived(repeated ? employerGroups.filter((g) => g.cases > 1) : employerGroups);
  const years = $derived(
    dataset ? [...new Set(dataset.records.map((r) => r.end.slice(0, 4)))].sort() : [],
  );
  const requestedCase = $derived(params.get('case') ?? '');
  const readDetail = createWageDetailReader(fetch, base);
  let loadedCase = $state<WageCase | null>(null),
    loadedRelease = $state(''),
    detailFailure = $state<{ id: string; message: string } | null>(null),
    retryDetail = $state(0);
  const selected = $derived(
    loadedCase?.id === requestedCase && loadedRelease === data.wages?.manifest.release
      ? loadedCase
      : null,
  );
  const detailError = $derived(detailFailure?.id === requestedCase ? detailFailure.message : '');
  $effect(() => {
    const bundle = data.wages,
      id = requestedCase;
    void retryDetail;
    loadedCase = null;
    detailFailure = null;
    if (!bundle || !id) return;
    const controller = new AbortController();
    readDetail(bundle, id, controller.signal)
      .then((record) => {
        if (!controller.signal.aborted) {
          loadedCase = record;
          loadedRelease = bundle.manifest.release;
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          detailFailure = {
            id,
            message: bundle.data.records.some((r) => r.id === id)
              ? 'Case evidence could not load or failed its integrity check. Retry to request the source-backed record again.'
              : 'This case is not in the loaded collection.',
          };
      });
    return () => controller.abort();
  });
  const selectedEmployer = $derived(
    filters.employer ? records.find((r) => r.employerKey === filters.employer) : null,
  );
  const byYear = $derived(
    years.map((year) => ({ year, ...wageTotals(records.filter((r) => r.end.startsWith(year))) })),
  );
  const maxYear = $derived(Math.max(1, ...byYear.map((y) => y.cases)));
  const timeline = $derived(
    [...records].sort((a, b) => a.end.localeCompare(b.end) || Number(a.id) - Number(b.id)),
  );
  const fieldLabel = (field: string) =>
    dataset?.dictionary.find((d) => d.field === field)?.description ?? field;
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
  const repeatLabel = (code: string | null) =>
    code === 'R'
      ? 'Repeat'
      : code === 'W'
        ? 'Willful'
        : code === 'RW'
          ? 'Repeat and willful'
          : (code ?? 'Not reported');
</script>

<svelte:head
  ><title>Wage-Violations Ledger · Louder Than Words</title><meta
    name="description"
    content="Search concluded federal wage investigations, disclosed employer names, back wages agreed to pay and civil penalties, with source records and clear limits."
  /></svelte:head
>
<div class="evidence-page wage-page">
  <div class="wage-kicker">
    <span>29 / The record of work</span><a
      href={`${base}/records/paycheck/${filters.state ? `?state=${filters.state}` : ''}`}
      >Regional pay context ↗</a
    >
  </div>
  <header>
    <p class="eyebrow">Concluded investigations. Open evidence.</p>
    <h2>Work has<br /><em>a record.</em></h2>
    <p>
      Look up an employer. Follow the case, the reported findings and the money agreed to pay. Keep
      the legal names—and the limits—visible.
    </p>
  </header>
  {#if !dataset}<div role="alert" class="wage-empty">
      <h3>Wage ledger unavailable</h3>
      <p>{data.wagesError}</p>
      <a href={page.url.pathname}>Reload ↻</a>
    </div>{:else}
    <div class="wage-coverage">
      <span class="wage-dot"></span><strong>U.S. Department of Labor · WHD</strong><span
        >Observed {dataset.observedAt.slice(0, 10)}</span
      >
    </div>
    <p class="wage-scope">
      {dataset.plan.title} · {dataset.records.length.toLocaleString()} cases in this collection
    </p>
    <div class="wage-caution">
      <strong>Agreed to pay is not proof of payment.</strong> This is a defined subset of concluded federal
      investigations, including cases with zero recorded violations. It is not an employer safety score
      or a complete history of every business.
    </div>
    <details class="wage-method">
      <summary>Read this before comparing employers</summary>
      <p>
        The full official ZIP was scanned: {dataset.coverage.scannedRows.toLocaleString()} source rows
        across {dataset.coverage.members.length} CSV files. This collection selects findings ending {dataset
          .plan.from}–{dataset.plan.through}{dataset.plan.industryPrefixes.length
          ? `, industry-code prefixes ${dataset.plan.industryPrefixes.join(', ')}`
          : ''}{dataset.plan.states.length ? `, states ${dataset.plan.states.join(', ')}` : ''}. No
        case-close dates are provided by this source.
      </p>
      <p>
        <strong>Findings dates are not investigation dates.</strong> They describe the period where WHD
        determined findings occurred, including findings of no violation. They do not establish when a
        case opened, closed or became public.
      </p>
      <p>
        <strong>Groups match exact reported legal names only.</strong> No punctuation, case, franchise
        or parent-company merging is applied. Names are not unique corporate identifiers. Different entities
        can share a name, and a single entity can appear under several spellings. Cases without a legal
        name stay separate. Multiple cases in a group do not by themselves establish the statutory repeat-violator
        designation.
      </p>
      <p>
        Back wages are the source’s total agreed-to-pay amount, not verified recoveries or today’s
        outstanding balance. Penalties use the source’s total monetary-assessment field, not a sum
        of overlapping statute amounts. Employees agreed to pay and employees employed in violation
        are different counts; adding case counts does not deduplicate people across investigations.
      </p>
      <p>
        DOL changed violation-count collection on October 1, 2025. Counts from cases loaded before
        and after that date are not directly comparable. The load date is an internal source
        field—not the case-close date. We show case-level counts, but do not rank employers or plot
        trends by summed violation counts.
      </p>
      <p>
        Map counts use reported employer states and state-label anchors, not geocoded workplaces or
        employee homes. Territories/unmapped states remain in totals. Regional pay links share
        geography only; they do not explain enforcement or demonstrate causation. Source street
        addresses and ZIP codes are not republished here.
      </p>
      <p>
        Source quality: {dataset.coverage.missingFindingsEnd.toLocaleString()} full-archive rows have
        no findings-end date and cannot enter a date-defined slice; {dataset.coverage
          .futureFindingsEnd} have findings-end dates after capture. Any reversed date ranges within the
        slice are disclosed on their case cards. Missing money/counts remain unknown, not zero.
      </p>
      <a href="https://data.dol.gov/datasets/10362" target="_blank" rel="noreferrer"
        >Official dataset and field definitions ↗</a
      >
      <a href={`${base}/data/wages/releases/${data.wages?.manifest.release}/data.json`} download
        >Download this source-backed collection ↧</a
      >
    </details>
    <form class="wage-filters" onsubmit={(e) => e.preventDefault()}>
      <label class="wage-wide"
        >Search employer or case<input
          type="search"
          aria-label="Search employer or case"
          placeholder="Legal name, trading name, city or case ID"
          value={filters.q}
          oninput={(e) => navigate({ q: e.currentTarget.value, case: null }, true)}
        /></label
      >
      <label
        >Findings-end year<select
          aria-label="Findings-end year"
          value={filters.year}
          onchange={(e) => navigate({ year: e.currentTarget.value, case: null })}
          ><option value="">All captured years</option>{#each years as year}<option value={year}
              >{year}</option
            >{/each}</select
        ></label
      >
      <label
        >Recorded case violations<select
          aria-label="Recorded case violations"
          value={filters.outcome}
          onchange={(e) => navigate({ outcome: e.currentTarget.value, case: null })}
          ><option value="all">All concluded cases</option><option value="positive"
            >Positive recorded count</option
          ><option value="zero">Zero recorded count</option></select
        ></label
      >
    </form>
    {#if filters.q || filters.state || filters.employer || filters.year || filters.outcome !== 'all'}<div
        class="wage-filter-note"
      >
        <span
          >Filtered{filters.state ? ` · ${filters.state}` : ''}{selectedEmployer
            ? ` · ${selectedEmployer.legalName ?? selectedEmployer.name}`
            : ''}</span
        ><button
          onclick={() =>
            navigate({
              q: null,
              state: null,
              employer: null,
              year: null,
              outcome: null,
              case: null,
            })}>Clear filters</button
        >
      </div>{/if}
    <div class="wage-stats">
      <div>
        <strong>{totals.cases.toLocaleString()}</strong><span>Concluded cases in this slice</span>
      </div>
      <div>
        <strong>{wageMoney(totals.backWages.known)}</strong><span
          >Back wages agreed{totals.backWages.missing
            ? ` · known subtotal, ${totals.backWages.missing} missing`
            : ''}</span
        >
      </div>
      <div>
        <strong>{totals.employeesAgreed.known.toLocaleString()}</strong><span
          >Employees agreed to pay · case-sum{totals.employeesAgreed.missing
            ? ` · ${totals.employeesAgreed.missing} missing`
            : ''}</span
        >
      </div>
      <div>
        <strong>{wageMoney(totals.penalties.known)}</strong><span
          >Civil penalties assessed{totals.penalties.missing
            ? ` · known subtotal, ${totals.penalties.missing} missing`
            : ''}</span
        >
      </div>
    </div>
    <figure class="wage-years">
      <figcaption>
        Cases by findings-end year · not closure or enforcement activity by year
      </figcaption>
      <div>
        {#each byYear as year}<div>
            <strong>{year.cases}</strong><span style={`height:${(year.cases / maxYear) * 60}px`}
            ></span><small>{year.year}</small>
          </div>{/each}
      </div>
    </figure>
    <nav class="wage-tabs" aria-label="Wage ledger views">
      {#each [['employers', 'Employer name groups'], ['cases', 'Case records'], ['changes', 'Capture changes']] as [id, label]}<button
          aria-pressed={view === id}
          onclick={() => navigate({ view: id, case: null })}>{label}</button
        >{/each}
    </nav>
    {#if requestedCase && !selected}<div class="wage-empty" role={detailError ? 'alert' : 'status'}>
        {#if detailError}<p>{detailError}</p>
          <button onclick={() => retryDetail++}>Retry case evidence</button>{:else}<p>
            Loading verified case evidence…
          </p>{/if}
        <button onclick={() => navigate({ case: null })}>Close case ×</button>
      </div>{/if}
    {#if selected}{#key selected.id}<article
          class="wage-detail"
          in:fly={{ y: reduced ? 0 : 12, duration: reduced ? 0 : 180 }}
        >
          <button class="wage-close" onclick={() => navigate({ case: null })}>Close case ×</button>
          <p class="eyebrow">WHD case {selected.id}</p>
          <h3>{selected.name}</h3>
          <p class="wage-legal">
            Reported legal name: <strong>{selected.legalName ?? 'Not supplied'}</strong>
          </p>
          <dl>
            <dt>Reported employer location</dt>
            <dd>
              {selected.city ?? 'City not reported'} · {selected.reportedState ??
                'State not reported'}{!selected.state ? ' · not mapped' : ''}
            </dd>
            <dt>Industry code / description</dt>
            <dd>
              {selected.industry ?? 'Unknown'} · {selected.industryDescription ?? 'Not reported'}
            </dd>
            <dt>Findings period, not case duration</dt>
            <dd>{selected.start ?? 'Start unknown'} → {selected.end}</dd>
            <dt>Back wages agreed to pay</dt>
            <dd>{wageMoney(selected.backWages)}</dd>
            <dt>Employees agreed to pay</dt>
            <dd>{selected.employeesAgreed?.toLocaleString() ?? 'Not reported'}</dd>
            <dt>Employees employed in violation</dt>
            <dd>{selected.employeesViolation?.toLocaleString() ?? 'Not reported'}</dd>
            <dt>Civil penalties assessed</dt>
            <dd>{wageMoney(selected.penalties)}</dd>
            <dt>Recorded case-violation count</dt>
            <dd>{selected.violations ?? 'Not reported'} · collection definitions may differ</dd>
            <dt>Source FLSA repeat/willful code</dt>
            <dd>{repeatLabel(selected.repeatCode)} · not inferred from this site’s groups</dd>
            <dt>Internal source load date</dt>
            <dd>{selected.loaded ?? 'Unknown'} · not case closure</dd>
          </dl>
          {#each selected.cautions as caution}<p class="wage-caution">{caution}</p>{/each}
          <details class="wage-facts">
            <summary>Nonzero source statute fields ({selected.facts.length})</summary>
            <p>
              Source fields are shown verbatim. Components can overlap; do not add them to the
              totals above. Omitted zero fields are not findings of compliance.
            </p>
            {#each selected.facts as fact}<div>
                <code>{fact.field}</code><strong>{fact.value}</strong>
                <p>{fieldLabel(fact.field)}</p>
              </div>{/each}
          </details>
          <div class="wage-source">
            <strong>Source locator</strong>
            <p>{selected.source.member}<br />Data row {selected.source.row} · case {selected.id}</p>
            <a href={dataset.source.url} target="_blank" rel="noreferrer"
              >Original DOL bulk file ↗</a
            ><a href="https://data.dol.gov/datasets/10362" target="_blank" rel="noreferrer"
              >Dataset and definitions ↗</a
            >
            <p>
              The portal does not provide a stable case-detail link. Use the case ID and CSV row to
              locate the original record.
            </p>
          </div>
          {#if selected.legalName}<button
              onclick={() =>
                navigate({ employer: selected.employerKey, view: 'cases', case: null, q: null })}
              >Explore this exact legal-name group ↗</button
            >{/if}
        </article>{/key}{/if}
    {#if view === 'changes'}<h3>Changes between captures</h3>
      <p>
        Tracking began {dataset.trackingStartedAt.slice(0, 10)}. This list is collection-wide,
        independent of state/employer filters. New-to-capture does not mean newly concluded.
      </p>
      {#if !dataset.changes.length}<div class="wage-empty">
          <h3>No capture changes yet.</h3>
          <p>Baseline capture, or unchanged source fields since the preceding capture.</p>
        </div>{:else}{#each dataset.changes.slice(0, limit) as change}<div class="wage-change">
            <strong>{change.id} · {change.kind.replaceAll('_', ' ')}</strong>
            <p>{change.detail}</p>
          </div>{/each}{#if dataset.changes.length > limit}<button
            class="wage-more"
            onclick={() => (limit += 24)}>Show 24 more changes</button
          >{/if}{/if}
    {:else if view === 'employers'}<div class="wage-group-head">
        <h3>Exact legal-name groups</h3>
        <label
          ><input
            type="checkbox"
            checked={params.get('repeated') === 'yes'}
            onchange={(e) => navigate({ repeated: e.currentTarget.checked ? 'yes' : null })}
          /> Groups with multiple cases</label
        >
      </div>
      <p class="wage-note">
        Name matches, not verified parent-company relationships. Ordered by case count, not
        wrongdoing or severity.
      </p>
      <div class="wage-groups">
        {#each employers.slice(0, limit) as employer}<button
            class="wage-group"
            onclick={() => navigate({ employer: employer.id, view: 'cases', case: null })}
            ><span
              >{employer.legalName
                ? 'Exact reported legal name'
                : 'No legal name · ungrouped case'}</span
            >
            <h3>{employer.name}</h3>
            <p>{employer.states.join(' · ')}</p>
            <div>
              <strong>{employer.cases} {employer.cases === 1 ? 'case' : 'cases'}</strong><strong
                >{wageMoney(employer.backWages.known)}</strong
              >
            </div>
            <small
              >Back wages agreed{employer.backWages.missing ? ' · known subtotal' : ''}; not
              confirmed paid</small
            ><b>Inspect the case records ↗</b></button
          >{/each}
      </div>
      {#if employers.length > limit}<button class="wage-more" onclick={() => (limit += 24)}
          >Show 24 more employer groups</button
        >{/if}{#if !employers.length}<div class="wage-empty">
          <h3>No employer groups in this slice.</h3>
          <p>Clear a filter or include single-case groups. Absence is not proof of compliance.</p>
        </div>{/if}
    {:else}<h3>
        {selectedEmployer ? (selectedEmployer.legalName ?? selectedEmployer.name) : 'Case records'}
      </h3>
      <p class="wage-note">
        {records.length.toLocaleString()} matching cases · showing {Math.min(limit, records.length)} ·
        findings-end order, not investigation order
      </p>
      <div class="wage-cases" class:wage-timeline={Boolean(filters.employer)}>
        {#each timeline.slice(0, limit) as record}<button
            class="wage-case"
            onclick={() => navigate({ case: record.id })}
            ><span>{record.end} · {record.reportedState ?? 'Unknown state'} · Case {record.id}</span
            >
            <h3>{record.name}</h3>
            <p>Legal: {record.legalName ?? 'Not reported'}</p>
            <div>
              <strong>{wageMoney(record.backWages)}</strong><span>back wages agreed</span><strong
                >{record.employeesAgreed ?? 'Unknown'}</strong
              ><span>employees agreed to pay</span>
            </div>
            <small
              >{record.violations === 0
                ? 'Zero recorded case violations'
                : record.violations === null
                  ? 'Case-violation count unknown'
                  : 'Positive recorded case-violation count'} · inspect source ↗</small
            ></button
          >{/each}
      </div>
      {#if records.length > limit}<button class="wage-more" onclick={() => (limit += 24)}
          >Show 24 more cases</button
        >{/if}{#if !records.length}<div class="wage-empty">
          <h3>No cases in this slice.</h3>
          <p>
            This collection is limited by industry and findings dates. No match is not a clean bill
            of health.
          </p>
        </div>{/if}
    {/if}
    <footer>
      Source: U.S. Department of Labor, Wage and Hour Division. Source records—not a verdict about
      an employer today.
    </footer>
  {/if}
</div>

<style>
  .wage-page {
    --ink: #422f28;
    --accent: #ad6141;
    color: var(--ink);
  }
  .wage-page a {
    color: #945135;
  }
  .wage-kicker,
  .wage-coverage,
  .wage-filter-note,
  .wage-group-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .wage-kicker,
  .wage-coverage {
    font-size: 11px;
    letter-spacing: 0.06em;
  }
  .wage-kicker {
    margin-bottom: 30px;
    text-transform: uppercase;
  }
  .wage-page header h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(56px, 6vw, 90px);
    line-height: 0.9;
    margin: 15px 0 22px;
    font-weight: 800;
  }
  .wage-page header h2 em {
    font-style: normal;
    color: var(--accent);
  }
  .wage-page header > p:last-child {
    max-width: 630px;
    font-size: 16px;
    line-height: 1.65;
    color: #72615b;
  }
  .wage-coverage {
    justify-content: flex-start;
    margin-top: 30px;
  }
  .wage-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ad6141;
  }
  .wage-scope {
    font-size: 12px;
    color: #75635c;
  }
  .wage-caution {
    background: #fcf5ef;
    border: 1px solid #ecdbce;
    border-left: 3px solid #ad6141;
    padding: 16px;
    font-size: 13px;
    line-height: 1.7;
    border-radius: 8px;
    margin: 20px 0;
  }
  .wage-method {
    border-bottom: 1px solid #e8ded5;
    padding: 16px 0;
    font-size: 13px;
    line-height: 1.75;
  }
  .wage-method summary,
  .wage-facts summary {
    cursor: pointer;
    font-weight: 700;
  }
  .wage-method a,
  .wage-source a {
    display: inline-block;
    margin: 8px 20px 8px 0;
  }
  .wage-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin: 26px 0;
  }
  .wage-wide {
    grid-column: 1/-1;
  }
  .wage-filters label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    min-width: 0;
  }
  .wage-filters input,
  .wage-filters select {
    padding: 12px;
    width: 100%;
    min-width: 0;
    border: 1px solid #d9ccc3;
    border-radius: 7px;
    background: #fff;
    color: var(--ink);
    font: inherit;
    font-weight: 400;
  }
  .wage-filter-note {
    font-size: 12px;
    background: #faf4ee;
    padding: 12px;
    border-radius: 8px;
    overflow-wrap: anywhere;
  }
  .wage-page button {
    font: inherit;
    cursor: pointer;
  }
  .wage-filter-note button,
  .wage-close,
  .wage-more,
  .wage-tabs button,
  .wage-detail > button:last-child {
    border: 1px solid #d9ccc3;
    background: #fff;
    color: var(--ink);
    padding: 11px 14px;
    border-radius: 7px;
  }
  .wage-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 23px 0;
  }
  .wage-stats > div {
    border: 1px solid #e8ded5;
    padding: 20px;
    background: #fffaf6;
    border-radius: 9px;
    min-width: 0;
  }
  .wage-stats strong {
    display: block;
    font-size: clamp(20px, 2.2vw, 30px);
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .wage-stats span {
    display: block;
    font-size: 11px;
    line-height: 1.5;
    color: #78685f;
    margin-top: 5px;
  }
  .wage-years {
    margin: 22px 0;
    padding: 16px;
    border: 1px solid #e8ded5;
    border-radius: 8px;
  }
  .wage-years figcaption {
    font-size: 11px;
    margin-bottom: 16px;
  }
  .wage-years > div {
    display: flex;
    gap: 20px;
    overflow-x: auto;
    align-items: end;
  }
  .wage-years > div > div {
    flex: 1;
    min-width: 45px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 12px;
    gap: 7px;
  }
  .wage-years span {
    background: #b57a59;
    min-height: 2px;
    width: 50px;
    max-width: 90%;
    border-radius: 3px 3px 0 0;
    transition: height 0.2s;
  }
  .wage-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 25px 0;
  }
  .wage-tabs button {
    font-size: 12px;
  }
  .wage-tabs button[aria-pressed='true'] {
    background: #563b30;
    border-color: #563b30;
    color: white;
  }
  .wage-page h3 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 25px;
    margin: 12px 0;
    line-height: 1.15;
  }
  .wage-group-head label {
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .wage-group-head input {
    width: 18px;
    height: 18px;
    accent-color: #945135;
  }
  .wage-note {
    font-size: 12px;
    line-height: 1.65;
    color: #74645d;
  }
  .wage-groups {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .wage-group,
  .wage-case {
    display: block;
    width: 100%;
    min-width: 0;
    text-align: left;
    padding: 22px;
    border: 1px solid #e1d4ca;
    background: #fffdfb;
    border-radius: 10px;
    transition:
      transform 0.18s,
      border-color 0.18s,
      box-shadow 0.18s;
    overflow-wrap: anywhere;
  }
  .wage-group:hover,
  .wage-case:hover {
    border-color: #b57a59;
    transform: translateY(-2px);
    box-shadow: 0 7px 20px #80604612;
  }
  .wage-group > span,
  .wage-case > span {
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #8e624a;
  }
  .wage-group p,
  .wage-case p {
    font-size: 12px;
    color: #75665e;
    line-height: 1.6;
  }
  .wage-group > div {
    display: flex;
    gap: 10px;
    justify-content: space-between;
    margin: 18px 0 8px;
    flex-wrap: wrap;
  }
  .wage-group b {
    display: block;
    font-size: 12px;
    margin-top: 20px;
  }
  .wage-group small,
  .wage-case small {
    font-size: 11px;
    line-height: 1.6;
    color: #75665e;
  }
  .wage-cases {
    display: grid;
    gap: 14px;
  }
  .wage-case > div {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 12px;
    margin: 15px 0;
    font-size: 12px;
    align-items: baseline;
  }
  .wage-timeline {
    border-left: 2px solid #dcb99f;
    padding-left: 20px;
  }
  .wage-timeline .wage-case {
    position: relative;
  }
  .wage-timeline .wage-case:before {
    content: '';
    position: absolute;
    left: -27px;
    top: 25px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ad6141;
    border: 2px solid white;
  }
  .wage-detail {
    padding: 25px;
    background: #fffaf6;
    border: 1px solid #dcb99f;
    border-top: 4px solid #ad6141;
    border-radius: 10px;
    margin: 20px 0;
    overflow-wrap: anywhere;
  }
  .wage-close {
    float: right;
    margin-left: 12px;
    font-size: 12px !important;
  }
  .wage-detail > h3 {
    font-size: 34px;
    clear: both;
    padding-top: 10px;
  }
  .wage-legal {
    font-size: 14px;
    line-height: 1.6;
  }
  .wage-detail dl {
    display: grid;
    grid-template-columns: 1fr 1.6fr;
    gap: 14px;
    font-size: 13px;
    margin: 24px 0;
    line-height: 1.6;
  }
  .wage-detail dt {
    color: #7b6659;
  }
  .wage-detail dd {
    margin: 0;
  }
  .wage-facts,
  .wage-source {
    border-top: 1px solid #e7d5c7;
    padding-top: 18px;
    margin-top: 20px;
    font-size: 12px;
    line-height: 1.7;
  }
  .wage-facts > div {
    padding: 14px 0;
    border-bottom: 1px solid #e7d5c7;
  }
  .wage-facts strong {
    margin-left: 18px;
  }
  .wage-facts code {
    overflow-wrap: anywhere;
  }
  .wage-source p {
    overflow-wrap: anywhere;
  }
  .wage-empty,
  .wage-change {
    border: 1px dashed #d9ccc3;
    padding: 22px;
    border-radius: 9px;
    margin: 16px 0;
    font-size: 13px;
    line-height: 1.7;
  }
  .wage-more {
    margin: 20px 0;
  }
  .wage-page footer {
    font-size: 11px;
    line-height: 1.6;
    color: #8b7a70;
    margin-top: 30px;
  }
  .wage-page :is(a, button, input, select, summary):focus-visible {
    outline: 3px solid #ae7549;
    outline-offset: 3px;
  }
  @media (max-width: 720px) {
    .wage-groups {
      grid-template-columns: 1fr;
    }
    .wage-filters {
      grid-template-columns: 1fr;
    }
    .wage-wide {
      grid-column: auto;
    }
    .wage-stats > div {
      padding: 14px;
    }
    .wage-detail {
      padding: 18px;
    }
    .wage-detail dl {
      grid-template-columns: 1fr;
      gap: 7px;
    }
    .wage-detail dd {
      margin-bottom: 13px;
    }
    .wage-detail > h3 {
      font-size: 29px;
    }
    .wage-timeline {
      padding-left: 15px;
    }
    .wage-timeline .wage-case:before {
      left: -22px;
    }
    .wage-close {
      float: none;
      margin: 0 0 15px;
    }
    .wage-kicker {
      font-size: 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .wage-group,
    .wage-case,
    .wage-years span {
      transition: none;
    }
    .wage-group:hover,
    .wage-case:hover {
      transform: none;
    }
  }
</style>
