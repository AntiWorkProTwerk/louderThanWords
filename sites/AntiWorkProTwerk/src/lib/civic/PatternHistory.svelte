<script lang="ts">
  import { nextHistoryYear, type PatternHistory } from './pattern-history';
  import { patternPairs } from './patterns';
  let {
    history,
    selectedYear,
    ready,
    onselect,
  }: {
    history: PatternHistory;
    selectedYear: number;
    ready: boolean;
    onselect: (year: number) => void;
  } = $props();
  let preview = $state<number | null>(null),
    focused = $state<number | null>(null);
  let plot: HTMLDivElement | undefined = $state();
  const id = $props.id();
  const years = $derived(history.rows.map((r) => r.year));
  const active = $derived(
    history.rows.find((r) => r.year === preview) ??
      history.rows.find((r) => r.year === focused) ??
      history.rows.find((r) => r.year === selectedYear) ??
      history.rows[0],
  );
  const entry = $derived(
    years.includes(focused ?? NaN)
      ? focused
      : years.includes(selectedYear)
        ? selectedYear
        : years[0],
  );
  const value = (r: number | null) =>
    r === null ? 'Unavailable' : `${r > 0 ? '+' : ''}${r.toFixed(2)}`;
  const x = (year: number) =>
    years.length < 2 ? 50 : 5 + ((year - years[0]) / (years.at(-1)! - years[0])) * 90;
  const y = (r: number) => 8 + (1 - r) * 39;
  function browse(event: KeyboardEvent, year: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = nextHistoryYear(years, year, event.key);
    if (next === null) return;
    event.preventDefault();
    plot
      ?.querySelector<HTMLButtonElement>(`[data-history-year="${next}"]`)
      ?.focus({ preventScroll: true });
  }
</script>

<section
  class="correlation-history"
  aria-labelledby={`${id}-title`}
  data-testid="correlation-history"
>
  <div class="history-heading">
    <div>
      <span>ZOOM OUT / {history.rows.length} SEPARATE YEARS</span>
      <h3 id={`${id}-title`}>Does the relationship persist?</h3>
    </div>
    <b>r <small>−1 to +1</small></b>
  </div>
  <p>
    One year can tell a different story. Each point recalculates the correlation across that year’s
    complete region pairs.
  </p>
  <div class="history-frame">
    <div class="history-axis" aria-hidden="true">
      <span style="top:8%">+1</span><span style="top:47%">0</span><span style="top:86%">−1</span>
    </div>
    <div
      class="history-plot"
      bind:this={plot}
      role="group"
      aria-label="Annual cross-region correlations"
      aria-describedby={`${id}-instructions`}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path class="history-grid" d="M0 8H100 M0 86H100" />
        <path class="history-zero" d="M0 47H100" />
        {#each history.segments as segment}<path
            class="history-line"
            d={segment.map((row, i) => `${i ? 'L' : 'M'}${x(row.year)} ${y(row.r!)}`).join(' ')}
          />{/each}
      </svg>
      {#if active}<span
          class="history-chip"
          style={`left:clamp(45px,${x(active.year)}%,calc(100% - 45px))`}
          aria-hidden="true"
          >{active.year} · {active.r === null ? 'Unavailable' : `r ${value(active.r)}`}</span
        ><i class="history-guide" style={`left:${x(active.year)}%`} aria-hidden="true"></i>{/if}
      {#each history.rows as row (row.year)}<button
          class="history-point"
          class:chosen={row.year === selectedYear}
          class:preview={row.year === active?.year}
          class:unavailable={row.r === null}
          style={`left:${x(row.year)}%;top:${row.r === null ? 97 : y(row.r)}%`}
          data-history-year={row.year}
          aria-label={`${row.year}: Pearson r ${value(row.r)}, ${row.count} region pairs, ${row.excluded} excluded. Select year.`}
          aria-pressed={row.year === selectedYear}
          tabindex={row.year === entry ? 0 : -1}
          disabled={!ready}
          onmouseenter={() => (preview = row.year)}
          onmouseleave={() => (preview = null)}
          onfocus={() => {
            focused = row.year;
            preview = null;
          }}
          onblur={() => (focused = null)}
          onkeydown={(e) => browse(e, row.year)}
          onclick={() => onselect(row.year)}><i>{row.r === null ? '×' : ''}</i></button
        >{/each}
    </div>
    <div class="history-years" aria-hidden="true">
      {#each history.rows as row}<span
          class:chosen={row.year === selectedYear}
          style={`left:${x(row.year)}%`}>{row.year}</span
        >{/each}
    </div>
  </div>
  <div class="history-readout" aria-live="polite" aria-atomic="true">
    {#if active}<div>
        <strong>{active.year}</strong><span
          >{active.year === selectedYear ? 'Selected year' : 'Preview · not selected'}</span
        >
      </div>
      <div>
        <b>{active.r === null ? 'r unavailable' : `r ${value(active.r)}`}</b><span
          >{active.count} included · {active.excluded} excluded</span
        >
      </div>{/if}
  </div>
  {#if active?.r === null}<p class="history-warning">
      This year has too few complete pairs or no variation. It is a gap, not a zero correlation.
    </p>{/if}
  <p class="history-cohort">
    {history.sameCohort
      ? `The same ${history.rows[0]?.count ?? 0} regions are included in every shown year.`
      : 'Included regions change across years. Composition can also change the correlation.'} Selecting
    a state never changes these annual samples.
  </p>
  <p class="history-instructions" id={`${id}-instructions`}>
    Hover or use ← / → to preview; click or press Enter to open that year’s map and records. Home /
    End jump to the first / last year. These are separate annual estimates, not pooled years or
    evidence of cause.
  </p>
  <details class="history-table">
    <summary>Read every year’s values and coverage</summary>
    <div class="history-table-wrap">
      <table>
        <caption
          >{history.pair ? patternPairs[history.pair].title : 'Annual comparison'} · December-to-December
          changes · unweighted region pairs</caption
        >
        <thead><tr><th>Year</th><th>Pearson r</th><th>Included</th><th>Excluded</th></tr></thead>
        <tbody
          >{#each history.rows as row}<tr
              ><th
                ><button disabled={!ready} onclick={() => onselect(row.year)}>{row.year}</button
                ></th
              ><td>{value(row.r)}</td><td>{row.count}</td><td>{row.excluded}</td></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </details>
</section>

<style>
  .correlation-history {
    margin: 22px 0 28px;
    padding: 22px;
    border: 1px solid #d2e1e7;
    border-radius: 14px;
    background: linear-gradient(125deg, #f2f7f9, #fcfdfd);
    color: #385b6a;
  }
  .history-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .history-heading span {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: #7794a0;
  }
  h3 {
    font:
      600 32px/1.1 'Barlow Condensed',
      sans-serif;
    margin: 7px 0;
  }
  .history-heading > b {
    font:
      500 30px 'Barlow Condensed',
      sans-serif;
    text-align: center;
    color: #6e8e9b;
    white-space: nowrap;
  }
  .history-heading small {
    display: block;
    font:
      9px Inter,
      sans-serif;
  }
  p {
    font-size: 11px;
    line-height: 1.8;
    margin: 8px 0;
  }
  .history-frame {
    position: relative;
    margin: 22px 0 14px 23px;
    padding-bottom: 25px;
  }
  .history-plot {
    position: relative;
    height: 160px;
    isolation: isolate;
  }
  .history-plot svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .history-plot path {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  .history-grid {
    stroke: #d5e2e8;
    stroke-dasharray: 2 4;
    stroke-width: 1;
  }
  .history-zero {
    stroke: #aec3ce;
    stroke-width: 1;
  }
  .history-line {
    stroke: #507a8e;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .history-axis {
    position: absolute;
    left: -23px;
    top: 0;
    height: 160px;
    width: 20px;
    font-size: 10px;
    color: #8a9faa;
  }
  .history-axis span {
    position: absolute;
    transform: translateY(-50%);
  }
  .history-guide {
    position: absolute;
    top: 0;
    height: 100%;
    border-left: 1px dashed #839fae;
    transition: left 0.25s ease;
    pointer-events: none;
  }
  .history-chip {
    position: absolute;
    top: -22px;
    transform: translateX(-50%);
    padding: 3px 6px;
    border: 1px solid #d1e1e8;
    border-radius: 5px;
    background: #fff;
    color: #426a7d;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    transition: left 0.25s ease;
    pointer-events: none;
  }
  .history-point {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 44px;
    display: grid;
    place-items: center;
    background: transparent;
    padding: 0;
    border: 0;
    cursor: pointer;
  }
  .history-point i {
    display: grid;
    place-items: center;
    width: 10px;
    height: 10px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: #7695a4;
    box-shadow: 0 0 0 1px #668899;
    transition:
      transform 0.2s,
      background 0.2s;
    font-style: normal;
  }
  .history-point.chosen i {
    background: #294f64;
    box-shadow: 0 0 0 4px #d3e2e9;
    width: 12px;
    height: 12px;
  }
  .history-point.preview i,
  .history-point:focus-visible i {
    transform: scale(1.3);
    background: #264f63;
  }
  .history-point:focus-visible {
    outline: 2px solid #7396a8;
    outline-offset: 1px;
    border-radius: 5px;
  }
  .history-point.unavailable i {
    background: white;
    color: #637a86;
    width: 15px;
    height: 15px;
    box-shadow: none;
    border: 1px dashed #849aa5;
  }
  .history-years {
    position: relative;
    margin-top: 13px;
    height: 12px;
    font-size: 9px;
    color: #7b939f;
  }
  .history-years span {
    position: absolute;
    transform: translateX(-50%);
  }
  .history-years .chosen {
    font-weight: 700;
    color: #294f64;
  }
  .history-readout {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 15px;
    background: #fff;
    border: 1px solid #dae5e9;
    border-radius: 9px;
    min-height: 66px;
  }
  .history-readout > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .history-readout > div:last-child {
    text-align: right;
  }
  .history-readout strong {
    font:
      600 26px 'Barlow Condensed',
      sans-serif;
  }
  .history-readout b {
    font:
      600 23px 'Barlow Condensed',
      sans-serif;
    font-variant-numeric: tabular-nums;
  }
  .history-readout span {
    font-size: 9px;
    color: #7a939f;
  }
  .history-cohort {
    color: #4d727f;
    font-size: 10px;
  }
  .history-instructions {
    font-size: 9px;
    color: #7b919c;
  }
  .history-warning {
    color: #886629;
    font-size: 10px;
  }
  .history-table {
    border-top: 1px solid #d9e5ea;
    margin-top: 13px;
    padding-top: 11px;
    font-size: 10px;
  }
  summary {
    cursor: pointer;
    color: #4c7385;
    min-height: 30px;
  }
  .history-table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 10px;
    text-align: left;
  }
  caption {
    text-align: left;
    font-size: 9px;
    line-height: 1.7;
    color: #7c95a0;
    margin-bottom: 9px;
  }
  th,
  td {
    padding: 5px;
    border-bottom: 1px solid #dce7ed;
    font-variant-numeric: tabular-nums;
  }
  td {
    white-space: nowrap;
  }
  th button {
    background: transparent;
    color: #38647a;
    min-height: 44px;
    padding: 0 5px;
  }
  @media (max-width: 650px) {
    .correlation-history {
      padding: 16px 12px;
    }
    h3 {
      font-size: 27px;
    }
    .history-frame {
      margin-left: 19px;
    }
    .history-readout {
      padding: 11px 10px;
    }
    .history-years {
      font-size: 8px;
    }
    .history-heading > b {
      font-size: 25px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .history-chip,
    .history-guide,
    .history-point i {
      transition: none;
    }
  }
</style>
