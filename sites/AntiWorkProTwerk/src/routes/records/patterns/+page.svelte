<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { getContext, onMount } from 'svelte';
  import { mapFocusContext, type MapFocusContext } from '$lib/civic/map-focus';
  import {
    analyzePatterns,
    patternSelection,
    patternPairs,
    patternColor,
    patternLegend,
  } from '$lib/civic/patterns';
  import PatternPlot from '$lib/civic/PatternPlot.svelte';
  import PatternHistory from '$lib/civic/PatternHistory.svelte';
  import PatternDirections from '$lib/civic/PatternDirections.svelte';
  import { patternDirections } from '$lib/civic/pattern-directions';
  import { patternHistory } from '$lib/civic/pattern-history';
  import PatternStateComparison from '$lib/civic/PatternStateComparison.svelte';
  import { comparePatternStates } from '$lib/civic/pattern-comparison';
  let { data } = $props();
  const mapFocus = getContext<MapFocusContext>(mapFocusContext);
  let methodOpen = $state(false);
  let ready = $state(false),
    notice = $state('');
  onMount(() => {
    ready = true;
  });
  const dataset = $derived(data.patterns?.data);
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const comparisonKey = $derived(JSON.stringify(['year','pair'].filter(k => params.has(k)).map(k => [k,params.get(k)!])));
  const computed = $derived.by(() => {
    if (!dataset) return { result: null, error: '' };
    try {
      return { result: analyzePatterns(dataset, patternSelection(dataset, new URLSearchParams(JSON.parse(comparisonKey)))), error: '' };
    } catch (e) {
      return {
        result: null,
        error:
          e instanceof Error && e.name !== 'ZodError'
            ? e.message
            : 'Choose an available year and comparison.',
      };
    }
  });
  const result = $derived(computed.result);
  const pair = $derived(patternPairs[result?.config.pair ?? 'pay-jobs']);
  const stateCode = $derived(params.get('state') ?? 'TX');
  const selected = $derived(result?.rows.find((s) => s.code === stateCode));
  const peerCode = $derived(params.get('peer'));
  const compared = $derived(result ? comparePatternStates(result,stateCode,peerCode) : {comparison:null,error:''});
  const locked = $derived(params.get('scale') === 'all');
  const currentPair = $derived(result?.config.pair);
  const trajectory = $derived(
    dataset && currentPair
      ? dataset.years.map((year) => analyzePatterns(dataset, { year, pair: currentPair }))
      : [],
  );
  const allPoints = $derived(trajectory.flatMap((r) => r.points));
  const history = $derived(patternHistory(trajectory));
  const signed = (v: number | null, unit = '%') =>
    v === null ? 'Unavailable' : `${v > 0 ? '+' : ''}${v.toFixed(2)}${unit}`;
  async function navigate(changes: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [k, v] of Object.entries(changes))
      v === null ? url.searchParams.delete(k) : url.searchParams.set(k, v);
    if (data.patterns) url.searchParams.set('release', data.patterns.release);
    await goto(url, { noScroll: true, keepFocus: true });
  }
  async function share() {
    if (!result) return;
    await navigate({
      year: String(result.config.year),
      pair: result.config.pair,
      state: stateCode,
    });
    try {
      await navigator.clipboard.writeText(page.url.href);
      notice = 'Copied this year, comparison and frozen release.';
    } catch {
      notice = 'Copy the address bar to share this frozen comparison.';
    }
  }
  function download() {
    if (!result || !data.patterns) return;
    const payload = {
      formatVersion: 1,
      release: data.patterns.release,
      dataHash: data.patterns.dataHash,
      upstream: data.patterns.data.upstream,
      method:
        'Pearson r on one complete December-to-December change pair per region; equal region weights; no imputation, p-value or causal claim.',
      result,
      history,
      directionGroups: patternDirections(result),
      stateComparison: compared.comparison,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `state-patterns-${result.config.pair}-${result.config.year}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function sourceLink(kind: 'paycheck' | 'economy', code = stateCode) {
    if (!dataset || !result) return '#';
    const p = new URLSearchParams({
      state: code,
      from: result.from,
      through: result.through,
      release: dataset.upstream[kind].release,
    });
    p.set('metric', kind === 'paycheck' ? 'nominal' : 'unemployment');
    return `${base}/records/${kind === 'paycheck' ? 'paycheck' : 'charts'}/?${p}`;
  }
</script>

<svelte:head
  ><title>State patterns · Louder Than Words</title><meta
    name="description"
    content="Explore measured relationships between state-level pay, jobs and unemployment using frozen BLS records. A pattern is a question, not proof of cause."
  /></svelte:head
>
<div class="patterns-page">
  <div class="kicker">
    <span><i></i> THE PATTERN LAB</span><span>COMPARE → QUESTION → VERIFY</span>
  </div>
  <h2>Does the pattern<br /><em>hold together?</em></h2>
  <p class="intro">
    Put two measures beside each other. Follow a state through time. See the relationship—and the
    records behind it.
  </p>
  {#if !dataset}<div class="error" role="alert">
      <p>{data.patternsError}</p>
      <button onclick={() => invalidateAll()}>Retry frozen comparison</button>
    </div>
  {:else if computed.error}<div class="error" role="alert">
      <p>{computed.error}</p>
      <a href={`${base}/records/patterns/`}>Reset comparison →</a>
    </div>
  {:else if result}
    <div class="pair-tabs" aria-label="Compare measures">
      {#each Object.entries(patternPairs) as [key, item]}<button
          disabled={!ready}
          aria-pressed={result.config.pair === key}
          class:chosen={result.config.pair === key}
          onclick={() => navigate({ pair: key })}>{item.title}<span>↗</span></button
        >{/each}
    </div>
    <div class="year-control">
      <div><span>01 / CHOOSE A YEAR</span><strong>{result.config.year}</strong></div>
      <p>
        December {result.config.year - 1} → December {result.config.year}<small
          >Same calendar month. Changes, not raw levels.</small
        >
      </p>
    </div>
    <div class="year-track" aria-label="Comparison year">
      {#each dataset.years as year}<button
          disabled={!ready}
          class:chosen={year === result.config.year}
          aria-pressed={year === result.config.year}
          onclick={() => navigate({ year: String(year) })}>{year}<i></i></button
        >{/each}
    </div>
    <div class="measure-note">
      <b
        >{result.config.pair === 'pay-jobs'
          ? 'Two establishment-survey measures'
          : 'Two programs, different populations'}</b
      >
      <p>
        {result.config.pair === 'pay-jobs'
          ? 'Private-sector payroll jobs and average hourly earnings; both not seasonally adjusted. Earnings are nominal, not adjusted for inflation.'
          : 'Payroll earnings describe jobs at workplaces; unemployment describes residents. Earnings are not seasonally adjusted; unemployment is seasonally adjusted. These are not matched people or interchangeable populations.'}
      </p>
    </div>
    <div class="plot-heading">
      <span>02 / EXPLORE THE RELATIONSHIP</span><label
        ><input
          type="checkbox"
          checked={locked}
          disabled={!ready}
          onchange={(e) => navigate({ scale: e.currentTarget.checked ? 'all' : null })}
        /> Keep axes fixed across years</label
      >
    </div>
    <PatternPlot
      {result}
      selected={stateCode}
      comparison={compared.comparison?.secondary.code ?? null}
      onselect={(code) => navigate({ state: code })}
      {locked}
      lockedPoints={allPoints}
      {ready}
    />
    <div class="legend" aria-label="Map and dot colors">
      {#each patternLegend as item}<span><i style={`--tone:${item.color}`}></i>{item.label}</span>{/each}
    </div>
    <p class="small-note">
      Colors describe directions, not “good” or “bad.” {locked
        ? 'The same axis range is used for every available year.'
        : 'Axes fit this year; visual distances are not comparable across years.'} Map areas without a
      complete pair remain uncolored.
    </p>
    <div class="relationship">
      <div class="r-value">
        <span>PEARSON r</span><strong data-testid="pattern-r"
          >{result.r === null ? '—' : result.r.toFixed(2)}</strong
        ><small
          >{result.r === null
            ? 'Not enough variation or pairs'
            : 'Descriptive linear association'}</small
        >
      </div>
      <div>
        <h3>{result.points.length} region pairs. One year.</h3>
        <p>
          One dot per state or DC; every region gets equal weight. {result.excluded.length} excluded for
          missing endpoints or an unusable baseline. Selecting a state does not change this calculation.
        </p>
        <p class="r-limit">
          r runs from −1 to +1. Values near zero mean little linear association—not “no
          relationship.” This is not a causal effect, forecast, or significance test.
        </p>
      </div>
    </div>
    <PatternDirections {result} selected={stateCode} {ready} onselect={(code) => navigate({state:code})} />
    <PatternHistory {history} selectedYear={result.config.year} {ready} onselect={(year) => navigate({year:String(year)})} />
    <div class="section-heading">
      <span>03 / FOLLOW A STATE</span><button disabled={!ready} onclick={share}
        >Copy this view ↗</button
      >
    </div>
    <p class="feedback" role="status">{notice}</p>
    <label class="state-choice"
      >State or district<select
        aria-label="State or district"
        value={stateCode}
        disabled={!ready}
        onchange={(e) => navigate({ state: e.currentTarget.value })}
        >{#if !dataset.states.some((s) => s.code === stateCode)}<option value={stateCode}
            >Unknown region</option
          >{/if}{#each dataset.states as state}<option value={state.code}>{state.name}</option
          >{/each}</select
      ></label
    >
    <PatternStateComparison comparison={compared.comparison} error={compared.error} peer={peerCode}
      selectedName={selected?.name ?? stateCode} states={dataset.states} history={trajectory} {ready}
      onchange={(peer) => navigate({peer})} onswap={() => navigate({state:peerCode,peer:stateCode})}
      onchart={() => document.querySelector('.pattern-plot')?.scrollIntoView({block:'start',behavior:'instant'})}
      sources={{paycheck:sourceLink('paycheck',peerCode ?? stateCode),economy:sourceLink('economy',peerCode ?? stateCode)}} />
    {#if selected}<section class="state-detail" aria-label={`${selected.name} pattern evidence`}>
        <div class="state-top">
          <div>
            <span>THE SAME REGION · TWO MEASURES</span>
            <h3>{selected.name}</h3>
          </div>
          {#if mapFocus}<button disabled={!ready} onclick={() => mapFocus.focusState(selected.code)}
              >Locate on map ↗</button
            >{/if}
        </div>
        <div class="state-values">
          <div>
            <span>{pair.x}</span><strong>{signed(selected.x, pair.xUnit)}</strong><small
              >{selected.x0?.value ?? 'Missing'} → {selected.x1?.value ?? 'Missing'}
              {pair.xUnit === 'pp'
                ? '% of resident labor force'
                : 'thousand private payroll jobs'}</small
            >
          </div>
          <div>
            <span>Average hourly earnings</span><strong>{signed(selected.y)}</strong><small
              >${selected.y0?.value ?? 'Missing'} → ${selected.y1?.value ?? 'Missing'} per hour · nominal</small
            >
          </div>
        </div>
        {#if selected.reason}<p class="warning">{selected.reason}</p>{/if}
        <p class="small-note">
          Average earnings can rise because the mix of jobs changed. This does not measure the raise
          received by a typical worker.
        </p>
        <div class="state-history">
          <span
            >THE OTHER YEARS · PAY / {result.config.pair === 'pay-jobs'
              ? 'JOBS'
              : 'UNEMPLOYMENT'}</span
          >
          <div>
            {#each trajectory as year}{@const row = year.rows.find(
                (s) => s.code === stateCode,
              )}<button
                disabled={!ready}
                class:chosen={year.config.year === result.config.year}
                onclick={() => navigate({ year: String(year.config.year) })}
                ><b>{year.config.year}</b><i
                  style={`--tone:${row?.x != null && row.y != null ? patternColor(row.x, row.y) : '#d3dce1'}`}
                ></i><small>{row ? signed(row.y) : '—'}</small><small
                  >{row ? signed(row.x, pair.xUnit) : '—'}</small
                ></button
              >{/each}
          </div>
        </div>
        <div class="source-links">
          <a href={sourceLink('paycheck')}>Open pay + jobs source view ↗</a><a
            href={sourceLink('economy')}>Open resident unemployment ↗</a
          >
        </div>
        <details class="endpoints">
          <summary>Exact series, endpoint months and source receipts</summary>
          <p>
            {result.from} to {result.through}. The source view links preserve these dates, state and
            original release.
          </p>
          {#each [{ label: pair.x, id: selected.xSeriesId, first: selected.x0, last: selected.x1 }, { label: 'Average hourly earnings', id: selected.ySeriesId, first: selected.y0, last: selected.y1 }] as source}<div
            >
              <b>{source.label} · {source.id ?? 'No series'}</b
              >{#each [source.first, source.last] as point}<p>
                  {point?.month ?? 'Missing endpoint'} · {point?.value ?? 'Missing value'}<small
                    >Receipt: {point?.sourceHash ?? 'Unavailable'}</small
                  ><small>{point?.footnotes.join(' · ') || 'No endpoint footnotes supplied'}</small>
                </p>{/each}
            </div>{/each}
        </details>
      </section>{:else}<div class="error">
        That region is not included. Choose a collected state above.
      </div>{/if}
    <details class="method" bind:open={methodOpen}>
      <summary>How the comparison works · data table & limits</summary>
      <p>
        For each region, pay and job changes are (December value ÷ previous December value − 1) ×
        100. Unemployment change is the difference between the two rates in percentage points.
        Pearson r uses only complete pairs for the selected year, with no population weighting or
        imputation. At least three pairs and variation on both axes are required.
      </p>
      <p>
        These aggregates are not independent experimental observations. Shared economic shocks,
        commuting, job mix and regional differences may affect the pattern. LAUS also uses payroll
        information among its model inputs, so the programs are not wholly independent. We do not
        calculate a p-value or infer an individual-level relationship.
      </p>
      <p>
        <a href="https://www.bls.gov/lau/laumthd.htm" target="_blank" rel="noreferrer"
          >BLS unemployment methods ↗</a
        >
        ·
        <a href="https://www.bls.gov/news.release/realer.tn.htm" target="_blank" rel="noreferrer"
          >BLS earnings limits ↗</a
        >
        ·
        <a
          href="https://itl.nist.gov/div898/handbook/eda/section3/eda33q.htm"
          target="_blank"
          rel="noreferrer">NIST: what a scatter plot can tell you ↗</a
        >
      </p>
      {#if methodOpen}<div class="table-wrap">
        <table>
          <caption
            >All region pairs · December {result.config.year - 1} to December {result.config
              .year}</caption
          ><thead
            ><tr
              ><th>Region</th><th>{pair.x} ({pair.xUnit})</th><th>Hourly earnings (%)</th><th
                >Included</th
              ></tr
            ></thead
          ><tbody
            >{#each result.rows as row}<tr
                ><th
                  ><button disabled={!ready} onclick={() => navigate({ state: row.code })}
                    >{row.name}</button
                  ></th
                ><td>{signed(row.x, pair.xUnit)}</td><td>{signed(row.y)}</td><td
                  >{row.reason ? 'No — missing/unusable endpoint' : 'Yes'}</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>{/if}
      {#each Object.entries(dataset.upstream) as [kind, upstream]}<p class="release">
          {kind} · captured {upstream.observedAt.slice(0, 10)}<br />{upstream.release}<br /><a
            href={`${base}/data/${kind}/releases/${upstream.release}/data.json`}
            download>Frozen upstream data ↓</a
          >
        </p>{/each}
    </details>
    <div class="exports">
      <button disabled={!ready} onclick={download}>Download calculated pairs ↓</button><a
        href={`${base}/data/patterns/releases/${data.patterns!.release}/data.json`}
        download>Download frozen source projection ↓</a
      >
    </div>
  {/if}
</div>

<style>
  :global(.evidence-workspace:has(.patterns-page)) {
    background: #fbfdfe;
  }
  .patterns-page {
    color: #203c4b;
    padding: 24px 32px 32px;
    max-width: 1100px;
    margin: auto;
  }
  .kicker {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 8px;
    letter-spacing: 1.8px;
    color: #678793;
    font-weight: 700;
  }
  .kicker i {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #708c99;
    margin-right: 7px;
  }
  h2 {
    font:
      800 clamp(46px, 4.3vw, 72px)/0.97 'Barlow Condensed',
      sans-serif;
    letter-spacing: -1px;
    margin: 25px 0 17px;
  }
  h2 em {
    color: #62848c;
    font-style: normal;
  }
  .intro {
    font-size: 12px;
    color: #708894;
    line-height: 1.8;
    max-width: 590px;
    margin-bottom: 26px;
  }
  button,
  a,
  select,
  input {
    touch-action: manipulation;
  }
  button:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  button {
    cursor: pointer;
  }
  button,
  a {
    transition:
      background 0.16s,
      border-color 0.16s;
  }
  button:focus-visible,
  a:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 3px solid #628b99;
    outline-offset: 3px;
  }
  .pair-tabs {
    display: flex;
    gap: 10px;
  }
  .pair-tabs button {
    flex: 1;
    padding: 15px;
    border: 1px solid #d2e1e7;
    border-radius: 9px;
    background: white;
    color: #557480;
    font-size: 12px;
    text-align: left;
  }
  .pair-tabs button span {
    float: right;
    color: #8da3ac;
  }
  .pair-tabs button.chosen {
    border-color: #5d8792;
    background: #edf4f5;
    color: #234957;
  }
  .year-control {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 26px 0 13px;
  }
  .year-control > div > span {
    display: block;
    font-size: 8px;
    letter-spacing: 1.5px;
    color: #77909b;
  }
  .year-control strong {
    font:
      700 56px 'Barlow Condensed',
      sans-serif;
  }
  .year-control p {
    font-size: 12px;
    color: #557482;
  }
  .year-control small {
    display: block;
    font-size: 10px;
    color: #869aa4;
    margin-top: 7px;
  }
  .year-track {
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    gap: 5px;
  }
  .year-track button {
    position: relative;
    padding: 10px 2px 16px;
    background: #f0f5f7;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #76909d;
    font-size: 11px;
    min-height: 44px;
  }
  .year-track button.chosen {
    background: #284e60;
    color: white;
  }
  .year-track i {
    position: absolute;
    width: 3px;
    height: 3px;
    background: currentColor;
    bottom: 7px;
    left: calc(50% - 1px);
    border-radius: 50%;
  }
  .measure-note {
    margin: 20px 0 27px;
    padding-left: 13px;
    border-left: 2px solid #a5b9c1;
    color: #5c7a88;
  }
  .measure-note b {
    font-size: 11px;
  }
  .measure-note p {
    font-size: 10px;
    line-height: 1.8;
    margin: 5px 0 0;
  }
  .plot-heading,
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin: 20px 0 14px;
  }
  .plot-heading > span,
  .section-heading > span {
    font-size: 8px;
    letter-spacing: 1.5px;
    color: #5d7c89;
  }
  .plot-heading label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: #6d8792;
  }
  .plot-heading input {
    accent-color: #4c7884;
  }
  .legend {
    display: flex;
    gap: 10px 16px;
    flex-wrap: wrap;
    font-size: 9px;
    color: #6a8591;
    margin: 16px 0 10px;
  }
  .legend span {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .legend i,
  .state-history i {
    display: inline-block;
    background: var(--tone);
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .small-note {
    font-size: 10px;
    line-height: 1.8;
    color: #7b909b;
  }
  .relationship {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 25px;
    padding: 24px 0;
    border-top: 1px solid #d7e3e9;
    border-bottom: 1px solid #d7e3e9;
    margin: 23px 0 25px;
  }
  .r-value {
    border-right: 1px solid #dce7eb;
    padding-right: 20px;
  }
  .r-value > span {
    font-size: 8px;
    letter-spacing: 2px;
    color: #6b8894;
  }
  .r-value strong {
    display: block;
    font:
      700 52px 'Barlow Condensed',
      sans-serif;
    color: #416775;
  }
  .r-value small {
    font-size: 9px;
    color: #8096a1;
    line-height: 1.6;
    display: block;
  }
  .relationship h3 {
    font:
      700 25px 'Barlow Condensed',
      sans-serif;
    margin: 0 0 8px;
  }
  .relationship p {
    font-size: 11px;
    line-height: 1.8;
    color: #68838f;
    margin: 0 0 7px;
  }
  .relationship p.r-limit {
    font-size: 10px;
    color: #8597a0;
  }
  .section-heading button,
  .state-top button {
    padding: 10px 12px;
    border: 1px solid #cfdee5;
    border-radius: 7px;
    background: #fff;
    color: #527480;
    font-size: 10px;
    min-height: 40px;
  }
  .feedback {
    font-size: 10px;
    color: #60818d;
    min-height: 5px;
    margin: 0;
  }
  .state-choice {
    display: flex;
    align-items: center;
    gap: 15px;
    font-size: 11px;
    color: #688491;
    margin: 10px 0 17px;
  }
  .state-choice select {
    flex: 1;
    border: 1px solid #cadae3;
    border-radius: 7px;
    padding: 12px;
    background: white;
    color: #33586a;
    min-width: 0;
  }
  .state-detail {
    border: 1px solid #c9dce3;
    border-radius: 13px;
    padding: 22px;
    background: linear-gradient(130deg, #edf4f5, #fafcfd);
  }
  .state-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .state-top span {
    font-size: 7px;
    letter-spacing: 1.6px;
    color: #7a98a2;
  }
  .state-top h3 {
    font:
      700 39px 'Barlow Condensed',
      sans-serif;
    margin: 6px 0 0;
  }
  .state-values {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 25px 0 18px;
  }
  .state-values > div + div {
    border-left: 1px solid #ccdfe5;
    padding-left: 20px;
  }
  .state-values span {
    font-size: 10px;
    color: #77909a;
  }
  .state-values strong {
    display: block;
    font:
      700 34px 'Barlow Condensed',
      sans-serif;
    color: #3c6675;
    margin: 8px 0;
  }
  .state-values small {
    font-size: 9px;
    color: #7d949e;
    line-height: 1.6;
  }
  .state-history {
    border-top: 1px solid #d5e3e8;
    padding-top: 18px;
    margin-top: 20px;
  }
  .state-history > span {
    font-size: 8px;
    letter-spacing: 1px;
    color: #77919c;
  }
  .state-history > div {
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    gap: 5px;
    margin-top: 14px;
  }
  .state-history button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    border: 1px solid transparent;
    padding: 10px 3px;
    background: #ffffff80;
    border-radius: 5px;
    color: #6a8896;
  }
  .state-history button.chosen {
    border-color: #688e9b;
    background: white;
  }
  .state-history b {
    font-size: 10px;
  }
  .state-history small {
    font-size: 8px;
    white-space: nowrap;
  }
  .source-links {
    display: flex;
    gap: 10px;
    margin-top: 20px;
    flex-wrap: wrap;
  }
  .source-links a {
    flex: 1;
    min-width: 150px;
    background: white;
    border: 1px solid #d2e0e7;
    border-radius: 7px;
    text-decoration: none;
    padding: 13px;
    color: #4e7585;
    font-size: 10px;
    line-height: 1.6;
  }
  details {
    font-size: 11px;
    color: #62808f;
    line-height: 1.8;
  }
  summary {
    cursor: pointer;
    font-size: 11px;
    color: #4f7280;
    min-height: 40px;
    padding: 11px 0;
  }
  details a {
    color: #507e8e;
  }
  .endpoints {
    margin-top: 12px;
  }
  .endpoints p {
    font-size: 10px;
  }
  .endpoints small {
    display: block;
    overflow-wrap: anywhere;
    font-size: 9px;
    color: #78919d;
  }
  .endpoints b {
    font-size: 10px;
  }
  .endpoints > div {
    padding: 10px 0;
    border-top: 1px solid #d6e3e8;
  }
  .method {
    margin-top: 22px;
    border-top: 1px solid #d8e4e9;
  }
  .method > p {
    font-size: 11px;
  }
  .table-wrap {
    overflow: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 10px;
    text-align: left;
  }
  caption {
    text-align: left;
    font-size: 10px;
    padding: 14px 0;
  }
  th,
  td {
    padding: 10px 8px;
    border-bottom: 1px solid #dde6ec;
  }
  th button {
    color: #365d71;
    background: transparent;
    font-size: 10px;
    padding: 5px;
    text-align: left;
  }
  thead {
    color: #5a7c8d;
  }
  .release {
    overflow-wrap: anywhere;
    font-size: 10px !important;
  }
  .exports {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
  }
  .exports button {
    background: #2e5466;
    color: white;
    border-radius: 7px;
    padding: 13px 16px;
    font-size: 11px;
  }
  .exports a {
    font-size: 10px;
    color: #62818e;
  }
  .error,
  .warning {
    padding: 20px;
    background: #fff5eb;
    border: 1px solid #e2cdb8;
    border-radius: 10px;
    color: #81664b;
    font-size: 12px;
    line-height: 1.8;
  }
  .error button {
    padding: 12px;
    background: white;
    border: 1px solid #ddc9b5;
    border-radius: 6px;
    color: #81664b;
  }
  @media (max-width: 650px) {
    .kicker > span:last-child {
      display: none;
    }
    h2 {
      font-size: 52px;
    }
    .intro {
      font-size: 12px;
    }
    .pair-tabs {
      gap: 7px;
    }
    .pair-tabs button {
      font-size: 11px;
      padding: 13px 10px;
    }
    .year-control strong {
      font-size: 47px;
    }
    .year-control p {
      font-size: 10px;
    }
    .year-control small {
      font-size: 9px;
    }
    .year-track {
      gap: 3px;
    }
    .year-track button {
      font-size: 9px;
    }
    .plot-heading {
      align-items: flex-start;
      flex-direction: column;
    }
    .relationship {
      grid-template-columns: 90px 1fr;
      gap: 16px;
    }
    .r-value {
      padding-right: 12px;
    }
    .r-value strong {
      font-size: 43px;
    }
    .relationship h3 {
      font-size: 23px;
    }
    .relationship p {
      font-size: 10px;
    }
    .state-detail {
      padding: 17px 14px;
    }
    .state-top {
      align-items: flex-start;
    }
    .state-top h3 {
      font-size: 32px;
    }
    .state-top span {
      font-size: 6px;
    }
    .state-top button {
      font-size: 9px;
      padding: 9px;
    }
    .state-values {
      gap: 12px;
    }
    .state-values > div + div {
      padding-left: 12px;
    }
    .state-values span {
      font-size: 9px;
    }
    .state-values strong {
      font-size: 30px;
    }
    .state-history > div {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .state-history button {
      display: grid;
      grid-template-columns: 1fr 10px;
      gap: 5px;
      text-align: left;
      align-items: center;
    }
    .state-history small {
      font-size: 9px;
    }
    .state-history small:last-child {
      grid-column: 1/-1;
    }
    .state-choice select {
      font-size: 16px;
    }
    .section-heading {
      gap: 7px;
    }
    .section-heading > span {
      font-size: 7px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button,
    a {
      transition: none;
    }
  }
  @media (max-width: 650px) {
    .patterns-page {
      padding: 20px 17px 28px;
    }
  }
</style>
