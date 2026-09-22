<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import {
    analyzeChart,
    alternativeWindows,
    chartSelection,
    chartConfigSchema,
    monthSchema,
    shiftMonth,
    stateUnemployment,
  } from '$lib/civic/economy';
  import WindowChart from '$lib/civic/WindowChart.svelte';
  let { data } = $props();
  const dataset = $derived(data.economy?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const selection = $derived(dataset ? chartSelection(dataset, params) : null);
  const presetEnd = $derived(
    monthSchema.safeParse(selection?.config.through).success
      ? selection!.config.through
      : (dataset?.through ?? '2025-12'),
  );
  const computed = $derived.by(() => {
    if (!dataset || !selection) return { result: null, alternatives: [], error: '' };
    try {
      const config = chartConfigSchema.parse(selection.config);
      return {
        result: analyzeChart(dataset, config),
        alternatives: alternativeWindows(dataset, config),
        error: '',
      };
    } catch (e) {
      return {
        result: null,
        alternatives: [],
        error:
          e instanceof Error && e.name !== 'ZodError'
            ? e.message
            : 'Choose valid months, a supported measure and display settings.',
      };
    }
  });
  const result = $derived(computed.result),
    stateRows = $derived(
      dataset && selection
        ? stateUnemployment(dataset, selection.config.from, selection.config.through)
        : [],
    );
  let reduced = $state(true),
    showTable = $state(false),
    tableLimit = $state(24),
    notice = $state('');
  onMount(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  });
  $effect(() => {
    void selection;
    tableLimit = 24;
  });
  async function navigate(changes: Record<string, string | null>, replace = false) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    if (data.economy && !Object.hasOwn(changes, 'release'))
      url.searchParams.set('release', data.economy.release);
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
  }
  const signed = (value: number | null, digits = 2) =>
    value === null ? 'Not calculable' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
  const number = (value: number | null) =>
    value === null ? 'Missing' : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  function download(value: unknown, name: string) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function share() {
    if (!result || !data.economy) return;
    const url = new URL(page.url);
    url.searchParams.set('release', data.economy.release);
    for (const [k, v] of Object.entries({
      from: result.configuration.from,
      through: result.configuration.through,
      metric: selection!.metric,
      adjustment: result.configuration.adjustment,
      axis: result.configuration.axis,
    }))
      url.searchParams.set(k, v);
    await navigate(Object.fromEntries(url.searchParams), true);
    try {
      await navigator.clipboard.writeText(url.href);
      notice = 'Copied a link with the dates, calculation settings and frozen dataset version.';
    } catch {
      notice = 'The address bar now contains the frozen link. Copy it to share.';
    }
  }
  function exportCalculation() {
    if (!result || !data.economy) return;
    download(
      {
        formatVersion: 1,
        datasetHash: data.economy.dataHash,
        release: data.economy.release,
        configuration: result.configuration,
        result,
        alternatives: computed.alternatives,
      },
      'chart-calculation.json',
    );
  }
  async function latest() {
    await navigate({ release: null });
    await invalidateAll();
    notice =
      'Loaded the latest published snapshot. Acquisition runs separately through the local pipeline.';
  }
</script>

<svelte:head
  ><title>Chart Check · Louder Than Words</title><meta
    name="description"
    content="Change the dates. Check the scale. Compare nominal and inflation-adjusted earnings and regional unemployment with reproducible BLS data."
  /></svelte:head
>
<div class="evidence-page chart-page">
  <div class="chart-kicker">
    <span>39 / Put the frame in view</span><a href={`${base}/records/paycheck/`}>Regional paychecks ↗</a>
  </div>
  <header class="chart-heading">
    <p class="eyebrow">The numbers. And the window.</p>
    <h2>Same data.<br /><em>Different story?</em></h2>
    <p>
      A trend depends on where you start, where you stop, and what you measure. Change the frame and
      inspect the calculation—not a verdict about anyone’s intent.
    </p>
  </header>
  {#if !dataset || !selection}<section class="chart-empty" role="alert">
      <h3>Economic snapshot unavailable</h3>
      <p>{data.economyError}</p>
      <a href={`${base}/records/charts/`}>Open the latest published snapshot</a>
    </section>
  {:else}
    <div class="chart-coverage">
      <span></span><strong>BLS · captured {dataset.observedAt.slice(0, 10)}</strong><span
        >{dataset.from}–{dataset.through}</span
      ><span>{dataset.series.length} series</span>
    </div>
    <details class="chart-method">
      <summary>Know the scope before interpreting a trend</summary>
      <p>
        This is a captured historical dataset, not a live economic feed. All series are monthly and
        seasonally adjusted. We preserve BLS footnotes, missing values and later snapshot revisions.
        A missing month is not zero and is not interpolated.
      </p>
      <p>
        Average hourly earnings cover employees on private nonfarm payrolls. They are not median pay
        or the wage of the same workers over time; changes in the mix of jobs can change the
        average. CPI-U represents the U.S. city average for all urban consumers, not your
        household’s inflation or a state-specific price index.
      </p>
      <p>
        State unemployment refers to residents and is a percentage of the labor force. Differences
        are not causal estimates or judgments about elected officials. National and state series
        have different estimation methods; states are not averaged to manufacture a national rate.
        No statistical-significance or uncertainty claim is calculated here.
      </p>
      <p>
        Use earnings and CPI together for the explicit inflation adjustment below. Unemployment is
        not inflation-adjusted. Its change is measured in percentage points, not mislabeled as a
        percent change. Comparing dates demonstrates framing sensitivity, not proof of dishonest
        cherry-picking.
      </p>
      <p>
        {dataset.revisions.length} numeric revisions versus the previous published snapshot. This is the
        latest captured vintage for the chosen release, not a reconstruction of what people knew on each
        historical date.
      </p>
      <a href="https://www.bls.gov/news.release/realer.t01.htm" target="_blank" rel="noreferrer"
        >BLS earnings and CPI methodology ↗</a
      >
      ·
      <a href="https://www.bls.gov/lau/" target="_blank" rel="noreferrer"
        >BLS state unemployment program ↗</a
      >
    </details>
    <section class="chart-controls" aria-label="Chart settings">
      <label
        >Measure<select
          aria-label="Measure"
          value={selection.metric}
          onchange={(e) =>
            navigate({ metric: e.currentTarget.value, state: null, adjustment: 'nominal' })}
          ><option value="earnings">Average hourly earnings</option><option value="prices"
            >Consumer prices (CPI-U)</option
          ><option value="unemployment">Unemployment rate</option></select
        ></label
      >
      {#if selection.metric === 'unemployment'}<label
          >Geography<select
            aria-label="Geography"
            value={params.get('state') ?? ''}
            onchange={(e) => navigate({ state: e.currentTarget.value })}
            ><option value="">United States</option
            >{#each dataset.series.filter((s) => s.state) as series}<option value={series.state!}
                >{series.geography}</option
              >{/each}</select
          ></label
        >{:else}<div class="chart-geography">
          <span>Geography</span><strong>{selection.series?.geography}</strong><small
            >No state-level inflation inferred</small
          >
        </div>{/if}
      <label
        >Start month<input
          aria-label="Start month"
          type="month"
          min={dataset.from}
          max={dataset.through}
          value={selection.config.from}
          onchange={(e) => navigate({ from: e.currentTarget.value })}
        /></label
      ><label
        >End month<input
          aria-label="End month"
          type="month"
          min={dataset.from}
          max={dataset.through}
          value={selection.config.through}
          onchange={(e) => navigate({ through: e.currentTarget.value })}
        /></label
      >
      <label
        >Value basis<select
          aria-label="Value basis"
          value={selection.config.adjustment}
          disabled={selection.metric !== 'earnings'}
          onchange={(e) => navigate({ adjustment: e.currentTarget.value })}
          ><option value="nominal"
            >{selection.metric === 'earnings' ? 'Nominal dollars' : 'Published values'}</option
          >{#if selection.metric === 'earnings'}<option value="real"
              >Inflation-adjusted dollars</option
            >{/if}</select
        ></label
      >
      <label
        >Vertical scale<select
          aria-label="Vertical scale"
          value={selection.config.axis}
          onchange={(e) => navigate({ axis: e.currentTarget.value })}
          ><option value="zero">Start at zero</option><option value="fit"
            >Fit the selected values</option
          ></select
        ></label
      >
    </section>
    <div class="chart-presets">
      {#each [12, 36, 60] as months}<button
          onclick={() => navigate({ from: shiftMonth(presetEnd, -months) })}
          disabled={shiftMonth(presetEnd, -months) < dataset.from}>{months / 12}-year window</button
        >{/each}<button onclick={() => navigate({ from: dataset.from, through: dataset.through })}
        >Full captured history</button
      ><button
        onclick={() =>
          navigate({
            from: null,
            through: null,
            metric: null,
            state: null,
            adjustment: null,
            axis: null,
          })}>Reset view</button
      >
    </div>
    {#if computed.error}<section class="chart-empty" role="alert">
        <h3>This window cannot be calculated</h3>
        <p>{computed.error}</p>
        <p>
          Choose valid endpoints or reset the view. Missing dates never silently move to a different
          month.
        </p>
      </section>
    {:else if result}
      {#key `${result.seriesId}:${result.configuration.adjustment}`}<section
          class="chart-analysis"
          in:fly={{ y: 8, duration: reduced ? 0 : 180 }}
        >
          <p class="eyebrow">{result.geography} · {result.seasonality}</p>
          <h3>{result.label}</h3>
          <div class="chart-result">
            <div>
              <span>Selected-window change</span><strong
                >{signed(result.change)}<small
                  >{result.change === null
                    ? ''
                    : result.changeUnit === 'percent'
                      ? '%'
                      : ' pp'}</small
                ></strong
              >
            </div>
            <p>
              {result.configuration.from} → {result.configuration.through}<br
              />{result.elapsedMonths} elapsed months · {result.units}
            </p>
          </div>
          <p class="chart-endpoints">
            {number(result.startValue)} → {number(result.endValue)}
            {result.units.toLowerCase()}. {result.changeUnit === 'percentage points'
              ? '“pp” means percentage points.'
              : ''}
          </p>
          {#if result.change === null}<p class="chart-warning" role="status">
              An endpoint is missing or a percentage calculation is undefined. No change estimate is
              substituted.
            </p>{/if}
          {#if result.missingMonths.length}<p class="chart-warning">
              {result.missingMonths.length} missing month(s): {result.missingMonths.join(', ')}. The
              line breaks at each gap. An endpoint-to-endpoint change does not describe those
              missing observations.
            </p>{/if}
          <WindowChart
            points={result.points}
            context={result.context}
            from={result.configuration.from}
            through={result.configuration.through}
            axis={result.configuration.axis}
            units={result.units}
          />
          <section class="chart-alternatives">
            <p class="eyebrow">Hold the end date steady</p>
            <h4>What changes when you start somewhere else?</h4>
            <p>
              Same series, same endpoint, same calculation. These are total changes over different
              durations—not comparable annual growth rates.
            </p>
            <div>
              {#each computed.alternatives as window}<button
                  disabled={!window.result}
                  onclick={() => navigate({ from: window.from })}
                  ><span>{window.label}</span><strong
                    >{window.result ? signed(window.result.change) : 'Outside range'}<small
                      >{window.result ? (result.changeUnit === 'percent' ? '%' : ' pp') : ''}</small
                    ></strong
                  ><span>{window.from} → {window.through}</span></button
                >{/each}
            </div>
          </section>
          {#if selection.metric === 'earnings'}<section class="chart-formula">
              <h4>Nominal versus purchasing-power change</h4>
              <p>
                Inflation-adjusted earnings use the same month’s seasonally adjusted CPI-U,
                expressed in the selected end month’s prices. This is a reproducible calculation,
                not a separate official BLS earnings series.
              </p>
              <code>real(t) = earnings(t) × CPI(end) / CPI(t)</code><button
                onclick={() =>
                  navigate({
                    adjustment: result.configuration.adjustment === 'real' ? 'nominal' : 'real',
                  })}
                >{result.configuration.adjustment === 'real'
                  ? 'See nominal dollars'
                  : 'Apply inflation adjustment'}</button
              >
            </section>{/if}
          <details class="chart-method">
            <summary>Inspect this exact calculation</summary>
            <p><code>{result.formula}</code></p>
            <p>
              Start: {number(result.startValue)}. End: {number(result.endValue)}. Absolute change: {signed(
                result.absoluteChange,
                4,
              )}. {result.baseCpi
                ? `CPI base: ${result.baseCpi} (${result.configuration.through}).`
                : ''}
            </p>
            <p>
              No rounding is applied before calculations. Displayed values are rounded, and a zero
              start value cannot support a percent-change calculation.
            </p>
            <a href={selection.series!.sourceUrl} target="_blank" rel="noreferrer"
              >Original BLS series: {result.seriesId} ↗</a
            >{#if result.deflatorSeries}
              · <a
                href="https://data.bls.gov/timeseries/CUSR0000SA0"
                target="_blank"
                rel="noreferrer">CPI deflator series ↗</a
              >{/if}
          </details>
          <button
            class="chart-table-toggle"
            aria-expanded={showTable}
            onclick={() => (showTable = !showTable)}
            >{showTable ? 'Hide' : 'Show'} accessible data table</button
          >
          {#if showTable}<div class="chart-table-wrap">
              <table>
                <caption>Selected months, source inputs and calculated values</caption><thead
                  ><tr
                    ><th>Month</th><th>Source value</th>{#if result.deflatorSeries}<th>CPI</th
                      >{/if}<th>Chart value</th><th>Footnotes</th></tr
                  ></thead
                ><tbody
                  >{#each result.points.slice(0, tableLimit) as point}<tr
                      ><th>{point.month}</th><td>{number(point.nominal)}</td
                      >{#if result.deflatorSeries}<td>{number(point.cpi)}</td>{/if}<td
                        >{number(point.value)}</td
                      ><td>{point.footnotes.join('; ') || '—'}</td></tr
                    >{/each}</tbody
                >
              </table>
            </div>
            {#if result.points.length > tableLimit}<button
                class="chart-table-toggle"
                onclick={() => (tableLimit += 24)}>Show 24 more months</button
              >{/if}{/if}
        </section>{/key}
    {/if}
    {#if selection.metric === 'unemployment'}<section class="chart-regions">
        <p class="eyebrow">Same window. Other places.</p>
        <h4>Across the states</h4>
        <p>
          Rates at {selection.config.through}; changes since {selection.config.from}. Alphabetical,
          not a performance ranking. Map points are state label anchors, not locations of individual
          workers.
        </p>
        <div>
          {#each stateRows as state}<button
              class:active={params.get('state') === state.code}
              onclick={() => navigate({ state: state.code })}
              ><span>{state.name}</span><strong
                >{state.end === null ? 'Missing' : `${state.end.toFixed(1)}%`}</strong
              ><small>{signed(state.change, 1)}{state.change === null ? '' : ' pp'}</small></button
            >{/each}
        </div>
      </section>{:else}<section class="chart-regional-link">
        <h4>Does the same frame change a state’s story?</h4>
        <p>
          Explore unemployment for all 50 states and D.C. This uses regional BLS series—not a
          national value painted onto every state.
        </p>
        <button
          onclick={() => navigate({ metric: 'unemployment', state: null, adjustment: 'nominal' })}
          >Explore state unemployment on the map →</button
        >
      </section>{/if}
    <section class="chart-reproduce">
      <h4>Keep the evidence with the chart</h4>
      <p>
        Share settings and a frozen release, or download the calculation and rerun it locally. The
        series dates, data vintage, missing months and formulas travel with the result.
      </p>
      <div>
        <button disabled={!result} onclick={share}>Copy frozen chart link</button><button
          disabled={!result}
          onclick={exportCalculation}>Download calculation</button
        ><a href={`${base}/data/economy/releases/${data.economy!.release}/data.json`} download
          >Download source snapshot ↧</a
        ><button onclick={latest}>Load latest published snapshot</button>
      </div>
      <p class="chart-release">
        Release: {data.economy!.release}<br />SHA-256: {data.economy!.dataHash}
      </p>
      {#if notice}<p role="status">{notice}</p>{/if}
    </section>
    <footer class="chart-footer">
      <a
        href={`${base}/records/votes/${params.get('state') ? `?state=${params.get('state')}` : ''}`}
        >Explore this geography’s vote records ↗</a
      ><span
        >Geographic connection only. This chart does not attribute changes to a policy or
        politician.</span
      >
    </footer>
  {/if}
</div>

<style>
  .chart-page {
    --accent: #126983;
    --wash: #eaf4f7;
    color: #1e354a;
  }
  .chart-page a {
    color: var(--accent);
  }
  .chart-kicker {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    font-size: 10px;
    color: #638198;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .chart-heading {
    margin: 34px 0 26px;
    max-width: 620px;
  }
  .chart-heading h2 {
    font: 700 clamp(47px, 5vw, 76px)/0.96 var(--condensed);
    letter-spacing: -1px;
    margin: 12px 0 20px;
  }
  .chart-heading em {
    font-style: normal;
    color: var(--accent);
  }
  .chart-heading > p:not(.eyebrow) {
    font-size: 15px;
    line-height: 1.8;
    color: #5e768d;
    max-width: 540px;
  }
  .chart-coverage {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    border-block: 1px solid #d7e4ed;
    padding: 14px 0;
    font-size: 11px;
    color: #627b91;
  }
  .chart-coverage > span:first-child {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--wash);
  }
  .chart-method {
    margin: 18px 0;
    font-size: 12px;
    line-height: 1.8;
    color: #58718a;
  }
  .chart-method summary {
    cursor: pointer;
    color: var(--accent);
  }
  .chart-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding-top: 15px;
  }
  .chart-controls label {
    display: grid;
    gap: 7px;
    font-size: 11px;
    color: #607b91;
  }
  .chart-controls input,
  .chart-controls select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 12px;
    border: 1px solid #cddde8;
    border-radius: 4px;
    background: white;
    font: inherit;
    font-size: 13px;
    color: #1b415a;
  }
  .chart-geography {
    display: grid;
    gap: 4px;
    padding: 8px 14px;
    background: #f3f7fa;
  }
  .chart-geography span,
  .chart-geography small {
    font-size: 10px;
    color: #698499;
  }
  .chart-geography strong {
    font-size: 14px;
  }
  .chart-page button {
    cursor: pointer;
  }
  .chart-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 18px 0 28px;
  }
  .chart-presets button,
  .chart-table-toggle,
  .chart-formula button,
  .chart-regional-link button,
  .chart-reproduce button {
    border: 0;
    border-radius: 4px;
    background: var(--wash);
    color: var(--accent);
    padding: 11px 14px;
    font-size: 11px;
  }
  .chart-page button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .chart-analysis {
    border-top: 3px solid var(--accent);
    padding-top: 24px;
  }
  .chart-analysis > h3 {
    font: 600 33px/1.12 var(--condensed);
    margin: 10px 0 22px;
  }
  .chart-result {
    display: flex;
    gap: 24px;
    align-items: center;
    justify-content: space-between;
  }
  .chart-result > div > span {
    display: block;
    font-size: 10px;
    letter-spacing: 0.8px;
    color: #678298;
    text-transform: uppercase;
  }
  .chart-result strong {
    font: 700 68px/1.15 var(--condensed);
    color: var(--accent);
  }
  .chart-result strong small {
    font-size: 30px;
  }
  .chart-result > p {
    font-size: 11px;
    line-height: 1.8;
    max-width: 250px;
    color: #688094;
  }
  .chart-endpoints {
    font-size: 12px;
    color: #567389;
  }
  .chart-warning {
    background: #fff8e8;
    border-left: 2px solid #ad8645;
    padding: 14px 16px;
    font-size: 12px;
    line-height: 1.7;
    color: #75613f;
  }
  .chart-page h4 {
    font: 600 28px/1.15 var(--condensed);
    margin: 10px 0;
  }
  .chart-alternatives {
    margin: 30px 0;
  }
  .chart-alternatives > p:not(.eyebrow),
  .chart-regions > p,
  .chart-formula > p,
  .chart-regional-link > p,
  .chart-reproduce > p {
    font-size: 12px;
    line-height: 1.75;
    color: #647d93;
  }
  .chart-alternatives > div {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 18px;
  }
  .chart-alternatives button {
    display: grid;
    text-align: left;
    gap: 8px;
    border: 1px solid #d4e3eb;
    background: #fff;
    padding: 16px;
    border-radius: 4px;
    color: inherit;
    transition:
      transform 0.18s,
      background 0.18s;
  }
  .chart-alternatives button:hover:not(:disabled) {
    background: var(--wash);
    transform: translateY(-2px);
  }
  .chart-alternatives button > span {
    font-size: 10px;
    color: #688095;
  }
  .chart-alternatives strong {
    font: 600 31px var(--condensed);
    color: var(--accent);
  }
  .chart-alternatives strong small {
    font-size: 17px;
  }
  .chart-formula,
  .chart-regional-link {
    background: #f0f7f9;
    padding: 22px;
    border-left: 2px solid #8db9c6;
    margin: 28px 0;
  }
  .chart-formula code,
  .chart-method code {
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .chart-formula button {
    display: block;
    background: #fff;
    margin-top: 16px;
    border: 1px solid #c9dfe7;
  }
  .chart-table-wrap {
    overflow-x: auto;
    margin-top: 18px;
  }
  .chart-table-wrap table {
    border-collapse: collapse;
    width: 100%;
    font-size: 11px;
  }
  .chart-table-wrap caption {
    text-align: left;
    color: #6a8499;
    padding: 10px 0;
  }
  .chart-table-wrap th,
  .chart-table-wrap td {
    padding: 10px 12px;
    border-bottom: 1px solid #dce7ee;
    text-align: left;
    line-height: 1.6;
  }
  .chart-table-wrap th {
    color: #43677f;
  }
  .chart-regions {
    border-top: 1px solid #dce7ee;
    padding-top: 25px;
    margin: 30px 0;
  }
  .chart-regions > div {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .chart-regions button {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    text-align: left;
    padding: 12px;
    border: 1px solid #d6e5ed;
    border-radius: 4px;
    background: white;
    color: #3f627a;
  }
  .chart-regions button.active {
    background: var(--wash);
    border-color: var(--accent);
  }
  .chart-regions button span {
    font-size: 11px;
  }
  .chart-regions button strong {
    font-size: 15px;
  }
  .chart-regions button small {
    font-size: 10px;
    color: #718b9f;
    grid-column: 1/-1;
  }
  .chart-reproduce {
    margin-top: 30px;
    border-top: 1px solid #dce7ee;
    padding-top: 20px;
  }
  .chart-reproduce > div {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    font-size: 11px;
  }
  .chart-release {
    font-size: 10px !important;
    overflow-wrap: anywhere;
  }
  .chart-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    border-top: 1px solid #dce7ee;
    margin-top: 30px;
    padding-top: 20px;
    font-size: 10px;
    color: #678197;
    line-height: 1.6;
  }
  .chart-empty {
    padding: 24px;
    background: #f3f7fa;
    margin: 20px 0;
    font-size: 13px;
    line-height: 1.7;
  }
  .chart-empty h3 {
    font: 600 29px var(--condensed);
    margin: 0;
  }
  .chart-page :focus-visible {
    outline: 3px solid #63a8bf;
    outline-offset: 3px;
  }
  @media (max-width: 650px) {
    .chart-controls {
      gap: 12px;
    }
    .chart-controls input,
    .chart-controls select {
      font-size: 12px;
      padding: 10px;
    }
    .chart-result {
      display: block;
    }
    .chart-result strong {
      font-size: 58px;
    }
    .chart-result > p {
      max-width: none;
    }
    .chart-alternatives > div {
      grid-template-columns: 1fr 1fr;
    }
    .chart-regions > div {
      grid-template-columns: 1fr 1fr;
    }
    .chart-regions button {
      grid-template-columns: 1fr;
    }
    .chart-heading {
      margin-top: 24px;
    }
    .chart-heading h2 {
      font-size: 55px;
    }
    .chart-formula,
    .chart-regional-link {
      padding: 18px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chart-alternatives button {
      transition: none;
    }
    .chart-alternatives button:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
