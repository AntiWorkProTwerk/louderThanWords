<script lang="ts">
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    analyzePaycheck,
    paycheckSelection,
    paycheckRegions,
    indexedPaycheck,
  } from '$lib/civic/paycheck';
  import PaycheckChart from '$lib/civic/PaycheckChart.svelte';
  let { data } = $props();
  let reduced = $state(true),
    limit = $state(24),
    notice = $state('');
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.paycheck?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const config = $derived(dataset ? paycheckSelection(dataset, params) : null),
    metric = $derived(
      params.get('metric') === 'employment'
        ? 'employment'
        : params.get('metric') === 'nominal'
          ? 'nominal'
          : 'real',
    );
  const computed = $derived.by(() => {
    if (!dataset || !config) return { result: null, regions: [], error: '' };
    try {
      return {
        result: analyzePaycheck(dataset, config),
        regions: paycheckRegions(dataset, config),
        error: '',
      };
    } catch (e) {
      return {
        result: null,
        regions: [],
        error:
          e instanceof Error && e.name !== 'ZodError'
            ? e.message
            : 'Choose valid months and a collected state.',
      };
    }
  });
  const result = $derived(computed.result),
    search = $derived(params.get('q') ?? ''),
    regions = $derived(
      computed.regions
        .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    );
  const signed = (n: number | null) =>
    n === null ? 'Unavailable' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  const number = (n: number | null) =>
    n === null ? 'Missing' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const dollars = (n: number | null) => (n === null ? 'Missing' : `$${n.toFixed(2)}`);
  $effect(() => {
    void config;
    limit = 24;
  });
  async function navigate(changes: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    if (data.paycheck && !Object.hasOwn(changes, 'release'))
      url.searchParams.set('release', data.paycheck.release);
    await goto(url, { noScroll: true, keepFocus: true });
  }
  async function share() {
    if (!result || !data.paycheck) return;
    await navigate(result.configuration);
    try {
      await navigator.clipboard.writeText(page.url.href);
      notice = 'Copied a link to this calculation and frozen source snapshot.';
    } catch {
      notice = 'The address bar now contains your frozen calculation link. Copy it to share.';
    }
  }
  function download() {
    if (!result || !data.paycheck) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              formatVersion: 1,
              release: data.paycheck.release,
              datasetHash: data.paycheck.dataHash,
              configuration: result.configuration,
              result,
              regions: computed.regions,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paycheck-comparison.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<svelte:head
  ><title>The Economy vs. Your Paycheck · Louder Than Words</title><meta
    name="description"
    content="Compare state and national earnings, inflation and private payroll jobs with reproducible BLS evidence."
  /></svelte:head
>
<div class="evidence-page paycheck-page">
  <div class="paycheck-kicker">
    <span>34 / Work & purchasing power</span><a href={`${base}/records/charts/`}>Chart check ↗</a>
  </div>
  <header>
    <p class="eyebrow">One economy. Different experiences.</p>
    <h2>The headline.<br /><em>Your paycheck.</em></h2>
    <p>
      Compare average private-sector hourly earnings and payroll jobs across states. Then ask how
      much of the wage change remains after a common inflation adjustment.
    </p>
  </header>
  {#if !dataset || !config}<div class="paycheck-empty" role="alert">
      <h3>Snapshot unavailable</h3>
      <p>{data.paycheckError}</p>
      <a href={page.url.pathname}>Load the latest collection</a>
    </div>{:else}
    <div class="paycheck-coverage">
      <span></span><strong>BLS source snapshot</strong><span
        >Observed {dataset.observedAt.slice(0, 10)}</span
      ><span>{dataset.states.length} states / D.C. · {dataset.from}–{dataset.through}</span>
    </div>
    <details class="paycheck-method">
      <summary>Read this before interpreting “your paycheck”</summary>
      <p>
        These are <strong>average hourly earnings across private nonfarm payroll jobs</strong>, not
        an individual’s pay, median wages, household income or take-home pay. Industry and workforce
        composition can move the average even when nobody receives a raise. Employment is a count of
        payroll jobs by workplace, in thousands—not unique people, resident employment or the
        unemployment rate.
      </p>
      <p>
        Every series here is not seasonally adjusted. Compare the same calendar month across years;
        the intervening monthly paths still include seasonal variation. The CPI-U U.S. city average
        is a common national price-change reference. It is not state-specific inflation, a
        comparison of living costs between states, or your personal spending basket. No ZIP-code
        inflation is inferred.
      </p>
      <p>
        “Inflation-adjusted” means hourly earnings × CPI at the end month ÷ CPI at that
        observation’s month. Percent changes use exact endpoints. Missing endpoints prevent the
        affected comparison; missing intermediate months break the chart. We never fill missing
        data, adjust employment for inflation, or add up state estimates to manufacture a national
        estimate.
      </p>
      <p>
        National and state CES are separately produced estimates. The U.S. line uses BLS national
        data. Differences are descriptive, not a causal explanation, political score or
        statistical-significance test. National improvement can coexist with weaker regional
        outcomes without either record being false.
      </p>
      <p>
        {dataset.series.length} series · {dataset.series.reduce(
          (n, s) => n + s.points.filter((p) => p.value === null).length,
          0,
        )} missing monthly values · {dataset.revisions.length} revisions detected against the previous
        local capture. Data can be revised; a historical observation date is not the date the value was
        originally published.
      </p>
      <a href={`${base}/data/paycheck/releases/${data.paycheck?.release}/data.json`} download
        >Download the frozen source dataset ↧</a
      >
      <p>
        Collection: {dataset.plan.id}. This regional implementation does not claim
        occupation-specific results.
      </p>
    </details>
    <form class="paycheck-controls" onsubmit={(e) => e.preventDefault()}>
      <label
        >Start month<input
          aria-label="Start month"
          type="month"
          min={dataset.from}
          max={dataset.through}
          value={config.from}
          onchange={(e) => navigate({ from: e.currentTarget.value })}
        /></label
      ><label
        >End month<input
          aria-label="End month"
          type="month"
          min={dataset.from}
          max={dataset.through}
          value={config.through}
          onchange={(e) => navigate({ through: e.currentTarget.value })}
        /></label
      ><label class="paycheck-wide"
        >Compare a geography<select
          aria-label="Compare a geography"
          value={config.state}
          onchange={(e) => navigate({ state: e.currentTarget.value })}
          ><option value="">United States</option>{#each dataset.states as state}<option
              value={state.code}>{state.name}</option
            >{/each}</select
        ></label
      >
    </form>
    {#if computed.error}<div class="paycheck-empty" role="alert">
        <h3>Choose a comparable window.</h3>
        <p>{computed.error}</p>
      </div>{/if}
    {#if result}
      {#key `${result.configuration.state}:${config.from}:${config.through}`}<section
          class="paycheck-summary"
          in:fly={{ y: reduced ? 0 : 8, duration: reduced ? 0 : 160 }}
        >
          <p class="eyebrow">{result.selected.name} · {config.from} → {config.through}</p>
          <div class="paycheck-stats">
            <div>
              <strong>{signed(result.selected.nominal)}</strong><span>Nominal hourly earnings</span>
            </div>
            <div>
              <strong>{signed(result.selected.real)}</strong><span
                >After national CPI adjustment</span
              >
            </div>
            <div>
              <strong>{signed(result.selected.employment)}</strong><span>Private payroll jobs</span>
            </div>
          </div>
          <p>
            National consumer prices changed <strong>{signed(result.inflation)}</strong> in this window.
          </p>
          {#if config.state}<p class="paycheck-reading">
              {#if result.gap === null}An endpoint needed for the state-to-U.S. real-earnings
                comparison is missing.{:else}The state’s inflation-adjusted earnings change is {Math.abs(
                  result.gap,
                ).toFixed(2)} percentage points {result.gap >= 0 ? 'above' : 'below'} the national change
                of {signed(result.national.real)}. This is a difference between changes—not a
                wage-level gap.{/if}
            </p>{/if}
        </section>{/key}
      <nav class="paycheck-tabs" aria-label="Paycheck measure">
        {#each [['real', 'Inflation-adjusted pay'], ['nominal', 'Nominal pay'], ['employment', 'Payroll jobs']] as [id, label]}<button
            aria-pressed={metric === id}
            onclick={() => navigate({ metric: id })}>{label}</button
          >{/each}
      </nav>
      <PaycheckChart
        local={indexedPaycheck(result.selected.points, metric)}
        national={indexedPaycheck(result.national.points, metric)}
        from={config.from}
        through={config.through}
        label={metric === 'employment'
          ? 'Private payroll jobs'
          : metric === 'nominal'
            ? 'Average hourly earnings'
            : 'Hourly earnings · common national CPI adjustment'}
      />
      <p class="paycheck-note">
        Indexing shows change, not dollar or job-count levels. If a starting value is missing, that
        line cannot be indexed. {metric === 'real'
          ? `Underlying real amounts use ${config.through} dollars; that does not make them local cost-of-living estimates.`
          : ''}
      </p>
      <div class="paycheck-actions">
        <button onclick={share}>Copy frozen comparison</button><button onclick={download}
          >Download calculation ↧</button
        ><button
          onclick={async () => {
            await navigate({ release: null });
            await invalidateAll();
            notice = 'Loaded the latest available local publication.';
          }}>Check latest snapshot</button
        >
      </div>
      <p role="status">{notice}</p>
      <details class="paycheck-evidence">
        <summary>Check the amounts, monthly values and source series</summary>
        <div class="paycheck-levels">
          <span
            >Nominal hourly pay <strong
              >{dollars(result.selected.startNominal)} → {dollars(
                result.selected.endNominal,
              )}</strong
            ></span
          ><span
            >Real hourly pay ({config.through} dollars)<strong
              >{dollars(result.selected.startReal)} → {dollars(result.selected.endReal)}</strong
            ></span
          ><span
            >Payroll jobs (thousands)<strong
              >{number(result.selected.startJobs)} → {number(result.selected.endJobs)}</strong
            ></span
          >
        </div>
        <p>
          {#each [result.selected.earningsSeriesId, result.selected.employmentSeriesId, result.national.earningsSeriesId, result.national.employmentSeriesId, 'CUUR0000SA0'].filter((v, i, a) => a.indexOf(v) === i) as id}<a
              href={`https://data.bls.gov/timeseries/${id}`}
              target="_blank"
              rel="noreferrer">{id} ↗</a
            >{' '}{/each}
        </p>
        <div class="paycheck-table-scroll">
          <table>
            <caption>Selected geography · unrounded source values remain in the download</caption
            ><thead
              ><tr
                ><th>Month</th><th>Nominal $/hr</th><th>Real $/hr</th><th>Jobs (000s)</th><th
                  >Source notes</th
                ></tr
              ></thead
            ><tbody
              >{#each result.selected.points.slice(0, limit) as p}<tr
                  ><th>{p.month}</th><td>{number(p.nominal)}</td><td>{number(p.real)}</td><td
                    >{number(p.employment)}</td
                  ><td>{p.footnotes.join('; ') || '—'}</td></tr
                >{/each}</tbody
            >
          </table>
        </div>
        {#if result.selected.points.length > limit}<button onclick={() => (limit += 24)}
            >Show 24 more months</button
          >{/if}
      </details>
      <div class="paycheck-related">
        <h3>Put this beside another record</h3>
        <a href={`${base}/records/enforcement/${config.state ? `?state=${config.state}` : ''}`}
          >Explore environmental enforcement in this state →</a
        >
        <p>
          EPA facility records supply geographic context, not evidence that environmental compliance
          caused a change in statewide earnings. The collection covers selected cities only.
        </p>
        <a href={`${base}/records/insiders/${config.state ? `?state=${config.state}` : ''}`}
          >Explore insider disclosures by issuer business state →</a
        >
        <p>
          These SEC filings use the issuer’s separately captured business-address state, not the
          reporting person’s home or trade location. They do not explain changes in statewide pay or
          employment.
        </p>
        <a href={`${base}/records/holdings/${config.state ? `?state=${config.state}` : ''}`}
          >Explore quarterly holdings by reporting-manager state →</a
        >
        <p>
          SEC cover-page business states connect these views geographically, not causally. Reported
          portfolio changes do not explain statewide wage changes.
        </p>
        <a href={`${base}/records/shared-investors/${config.state ? `?state=${config.state}` : ''}`}>Explore shared investors by company business state →</a>
        <p>Selected public companies, located by captured business-address state. Shared holdings do not explain local pay or employment changes.</p>
        <a href={`${base}/records/major-stakes/${config.state ? `?state=${config.state}` : ''}`}>Explore major-stake disclosures by company business state →</a>
        <p>Regional context only. Ownership disclosures do not establish causes of local wage or employment changes.</p>
        <a href={`${base}/records/nursing/${config.state ? `?state=${config.state}` : ''}`}
          >Explore nursing facilities in this state →</a
        >
        <p>
          CMS facility ownership and staffing use their own reporting periods and collected states.
          These statewide earnings are context, not a facility’s wages or evidence of an ownership
          effect.
        </p>
        <a href={`${base}/records/wages/${config.state ? `?state=${config.state}` : ''}`}
          >Federal wage cases in this geography ↗</a
        >
        <p>
          The wage ledger covers its own industries and findings dates. It is a separate enforcement
          record, not an explanation of regional pay changes.
        </p>
        <a href={`${base}/records/complaints/${config.state ? `?state=${config.state}` : ''}`}
          >Consumer complaints in this geography ↗</a
        >
        <p>
          The radar covers its own disclosed companies, product and dates. A shared state is
          context, not evidence that wage changes caused complaints.
        </p>
        <a
          href={`${base}/records/charts/?metric=unemployment${config.state ? `&state=${config.state}` : ''}&from=${config.from}&through=${config.through}`}
          >Unemployment in the same geography and window ↗</a
        >
        <p>
          Chart Check uses a separately captured, seasonally adjusted series based on residence. It
          is context, not the same population or a direct identity with these payroll jobs.
        </p>
        {#if config.state}<a href={`${base}/records/research/?state=${config.state}`}
            >NIH-funded organizations reported in {config.state} ↗</a
          >
          <p>
            A shared state is geographic context only. It does not establish that these grants
            caused a wage or employment change.
          </p>{/if}
      </div>
      <h3 class="paycheck-region-heading">How does each state compare?</h3>
      <label class="paycheck-search"
        >Find a state<input
          type="search"
          aria-label="Find a state"
          value={search}
          oninput={(e) => navigate({ q: e.currentTarget.value })}
        /></label
      >
      <div class="paycheck-regions">
        {#each regions as region}<button
            class="paycheck-region"
            onclick={() => navigate({ state: region.code })}
            ><strong>{region.name}</strong><span
              >{signed(region.real)}<small>Real hourly earnings</small></span
            ><span>{signed(region.employment)}<small>Payroll jobs</small></span></button
          >{/each}
      </div>
      {#if !regions.length}<p>No states match this search.</p>{/if}
    {/if}
    <footer>Source-backed comparisons, not a judgment about your personal finances.</footer>
  {/if}
</div>

<style>
  .paycheck-page {
    --ink: #433c30;
    --accent: #a66016;
    color: var(--ink);
  }
  .paycheck-page a {
    color: #885317;
  }
  .paycheck-kicker,
  .paycheck-coverage {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 11px;
  }
  .paycheck-kicker {
    justify-content: space-between;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 25px;
  }
  .paycheck-page header h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(48px, 5vw, 76px);
    line-height: 0.94;
    margin: 12px 0 18px;
  }
  .paycheck-page header em {
    font-style: normal;
    color: var(--accent);
  }
  .paycheck-page header > p:last-child {
    font-size: 14px;
    line-height: 1.6;
    max-width: 60ch;
  }
  .paycheck-coverage {
    padding: 14px 0;
    margin-top: 18px;
    border-top: 1px solid #e1d9cd;
  }
  .paycheck-coverage > span:first-child {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  .paycheck-method,
  .paycheck-evidence {
    border: 1px solid #e0d8cb;
    border-radius: 8px;
    background: #faf8f2;
    padding: 14px;
    font-size: 12px;
    line-height: 1.7;
  }
  .paycheck-page summary {
    cursor: pointer;
    font-weight: 650;
  }
  .paycheck-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 13px;
    margin: 22px 0;
  }
  .paycheck-controls label,
  .paycheck-search {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    font-weight: 650;
  }
  .paycheck-wide {
    grid-column: 1/-1;
  }
  .paycheck-page input,
  .paycheck-page select {
    width: 100%;
    min-width: 0;
    border: 1px solid #d6cebf;
    background: #fff;
    border-radius: 6px;
    padding: 11px;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
  }
  .paycheck-summary {
    padding: 18px 0;
  }
  .paycheck-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin: 16px 0;
  }
  .paycheck-stats strong {
    display: block;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 38px;
    color: var(--accent);
  }
  .paycheck-stats span {
    font-size: 11px;
    line-height: 1.5;
    display: block;
  }
  .paycheck-summary > p {
    font-size: 13px;
    line-height: 1.6;
  }
  .paycheck-reading {
    border-left: 3px solid #b17c2e;
    padding: 12px;
    background: #f6f0df;
  }
  .paycheck-tabs,
  .paycheck-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .paycheck-page button {
    font: inherit;
    cursor: pointer;
  }
  .paycheck-tabs button,
  .paycheck-actions button,
  .paycheck-evidence > button {
    background: #fff;
    border: 1px solid #d6cebf;
    border-radius: 6px;
    padding: 10px 12px;
    color: var(--ink);
    font-size: 12px;
  }
  .paycheck-tabs button[aria-pressed='true'] {
    background: var(--ink);
    color: #fff;
  }
  .paycheck-note {
    font-size: 12px;
    line-height: 1.6;
    color: #706754;
  }
  .paycheck-page [role='status'] {
    font-size: 12px;
  }
  .paycheck-levels {
    display: grid;
    gap: 10px;
    margin: 16px 0;
  }
  .paycheck-levels strong {
    display: block;
  }
  .paycheck-table-scroll {
    max-width: 100%;
    overflow: auto;
  }
  .paycheck-page table {
    border-collapse: collapse;
    width: 100%;
    font-size: 11px;
    min-width: 460px;
  }
  .paycheck-page caption {
    text-align: left;
    margin: 10px 0;
  }
  .paycheck-page th,
  .paycheck-page td {
    padding: 8px;
    text-align: left;
    border-bottom: 1px solid #e2dbcf;
  }
  .paycheck-related {
    margin: 24px 0;
    padding: 18px;
    background: #f1f5f5;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.7;
  }
  .paycheck-related h3 {
    font-size: 16px;
    margin-top: 0;
  }
  .paycheck-region-heading {
    margin-top: 30px;
  }
  .paycheck-search {
    margin-bottom: 16px;
  }
  .paycheck-regions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .paycheck-region {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 15px;
    text-align: left;
    color: var(--ink);
    border: 1px solid #e0d8cb;
    border-radius: 8px;
    background: linear-gradient(135deg, #fff, #fcf9f2);
    transition:
      transform 0.16s ease,
      border-color 0.16s ease;
  }
  .paycheck-region:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }
  .paycheck-region > strong {
    grid-column: 1/-1;
    font-size: 14px;
  }
  .paycheck-region > span {
    font-size: 18px;
    color: var(--accent);
    font-weight: 650;
  }
  .paycheck-region small {
    display: block;
    font-size: 10px;
    line-height: 1.5;
    font-weight: 400;
    color: #6c6250;
  }
  .paycheck-empty {
    border: 1px dashed #c9b28e;
    padding: 20px;
    margin: 20px 0;
    font-size: 13px;
    line-height: 1.6;
  }
  .paycheck-page footer {
    font-size: 11px;
    line-height: 1.5;
    color: #706754;
    margin: 24px 0;
  }
  .paycheck-page button:focus-visible,
  .paycheck-page a:focus-visible,
  .paycheck-page input:focus-visible,
  .paycheck-page select:focus-visible {
    outline: 3px solid #488dab;
    outline-offset: 3px;
  }
  @media (max-width: 550px) {
    .paycheck-stats {
      grid-template-columns: 1fr 1fr;
    }
    .paycheck-stats > div:last-child {
      grid-column: 1/-1;
    }
    .paycheck-regions {
      grid-template-columns: 1fr;
    }
    .paycheck-stats strong {
      font-size: 34px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .paycheck-region {
      transition: none;
    }
    .paycheck-region:hover {
      transform: none;
    }
  }
</style>
