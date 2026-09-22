<script lang="ts">
  import { patternColor, patternPairs, type PatternResult } from './patterns';
  import { nextPlotPoint } from './plot-navigation';
  let {
    result,
    selected,
    comparison = null,
    onselect,
    lockedPoints,
    locked = true,
    ready = true,
  }: {
    result: PatternResult;
    selected: string;
    comparison?: string | null;
    onselect: (code: string) => void;
    lockedPoints: { x: number; y: number }[];
    locked?: boolean;
    ready?: boolean;
  } = $props();
  let hover = $state(''),
    focusCode = $state('');
  let plotArea: HTMLDivElement | undefined = $state();
  const instructionsId = $props.id();
  const pair = $derived(patternPairs[result.config.pair]);
  const extent = $derived(locked ? lockedPoints : result.points);
  function domain(values: number[]) {
    const min = Math.min(0, ...values),
      max = Math.max(0, ...values),
      pad = Math.max((max - min) * 0.12, 0.5);
    return [min - pad, max + pad];
  }
  const dx = $derived(domain(extent.map((p) => p.x))),
    dy = $derived(domain(extent.map((p) => p.y)));
  const x = (v: number) => ((v - dx[0]) / (dx[1] - dx[0])) * 100;
  const y = (v: number) => 100 - ((v - dy[0]) / (dy[1] - dy[0])) * 100;
  const ticks = (d: number[]) =>
    Array.from({ length: 5 }, (_, i) => d[0] + ((d[1] - d[0]) * i) / 4);
  const active = $derived(result.points.find((p) => p.code === (hover || focusCode || selected)));
  const comparisonPoint = $derived(result.points.find((p) => p.code === comparison));
  const entryCode = $derived(
    result.points.find((p) => p.code === focusCode)?.code ??
      result.points.find((p) => p.code === selected)?.code ??
      result.points[0]?.code,
  );
  function browse(event: KeyboardEvent, code: string) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = nextPlotPoint(result.points, code, event.key);
    if (next === null) return;
    event.preventDefault();
    hover = '';
    const button = Array.from(
      plotArea?.querySelectorAll<HTMLButtonElement>('.pattern-dot') ?? [],
    ).find((item) => item.dataset.state === next);
    button?.focus({ preventScroll: true });
  }
</script>

<div class="pattern-plot" data-locked={locked}>
  <div class="axis-caption">↑ {pair.y} <span>year-over-year % change · nominal dollars</span></div>
  <div class="plot-frame">
    <div class="y-ticks" aria-hidden="true">
      {#each ticks(dy) as value}<span style={`top:${y(value)}%`}>{value.toFixed(1)}</span>{/each}
    </div>
    <div
      class="plot-area"
      bind:this={plotArea}
      role="group"
      aria-label="State comparison scatter plot. Choose a dot or use the state selector below."
      aria-describedby={instructionsId}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {#each [0, 25, 50, 75, 100] as tick}<path
            class="grid"
            d={`M${tick} 0V100 M0 ${tick}H100`}
          />{/each}
        <path class="zero" d={`M${x(0)} 0V100 M0 ${y(0)}H100`} />
      </svg>
      {#if active}<div class="plot-guides" aria-hidden="true" data-state={active.code}>
          <i class="guide-horizontal" style={`top:${y(active.y)}%;width:${x(active.x)}%`}></i>
          <i
            class="guide-vertical"
            style={`top:${y(active.y)}%;left:${x(active.x)}%;height:${100 - y(active.y)}%`}
          ></i>
        </div>{/if}
      {#each result.points as point (point.code)}
        <button
          class="pattern-dot"
          class:chosen={point.code === selected}
          class:compared={point.code === comparison}
          class:preview={point.code === (hover || focusCode)}
          class:label-left={x(point.x) > 80}
          style={`left:${x(point.x)}%;top:${y(point.y)}%;--dot:${patternColor(point.x, point.y)}`}
          aria-label={`${point.name}: ${pair.x} ${point.x.toFixed(2)}${pair.xUnit}, earnings ${point.y.toFixed(2)}%. Select state${point.code === comparison ? '. Comparison state' : ''}`}
          aria-pressed={point.code === selected}
          tabindex={point.code === entryCode ? 0 : -1}
          disabled={!ready}
          data-state={point.code}
          onclick={() => onselect(point.code)}
          onmouseenter={() => (hover = point.code)}
          onmouseleave={() => (hover = '')}
          onkeydown={(event) => browse(event, point.code)}
          onfocus={() => {
            focusCode = point.code;
            hover = '';
          }}
          onblur={() => (focusCode = '')}><i></i><span>{point.code}</span></button
        >
      {/each}
    </div>
    <div class="x-ticks" aria-hidden="true">
      {#each ticks(dx) as value}<span style={`left:${x(value)}%`}>{value.toFixed(1)}</span>{/each}
    </div>
  </div>
  <div class="x-caption">
    {pair.x} →
    <span>year-over-year {pair.xUnit === 'pp' ? 'percentage-point change' : '% change'}</span>
  </div>
  <div class="plot-readout" aria-live="polite">
    {#if active}<b>{active.name}</b><small class="readout-state"
        >{active.code === selected ? 'Selected state' : 'Preview · not selected'}</small
      ><span
        >{active.x.toFixed(2)}{pair.xUnit}
        {pair.x.toLowerCase()} · {active.y.toFixed(2)}% hourly earnings</span
      >
    {:else}<b>Each dot is one region</b><span
        >Choose a state to follow its record. Overlapping dots are also available in the selector.</span
      >{/if}
  </div>
  {#if comparison}<p class="plot-comparison-key">
      {comparisonPoint
        ? 'Solid outline: selected state · Purple dashed outline: comparison state.'
        : 'The comparison state has no complete pair this year, so it has no scatter dot.'} Selecting
      a dot changes the selected state; it does not change the correlation sample.
    </p>{/if}
  <p class="plot-instructions" id={instructionsId}>
    <b>Read a dot</b> Hover or focus to trace its two values. Click or press Enter to select.
    <span
      >Keyboard: ← / → browse by horizontal value; ↑ / ↓ by earnings. Home / End browse
      alphabetically. Tab leaves the chart.</span
    >
  </p>
</div>

<style>
  .pattern-plot {
    scroll-margin-top: 60px;
    padding: 20px 24px 15px;
    border: 1px solid #d3e2e7;
    border-radius: 14px;
    background: linear-gradient(145deg, #fff, #f4f8fa);
  }
  .axis-caption,
  .x-caption {
    font-size: 11px;
    font-weight: 700;
    color: #385b6a;
    line-height: 1.7;
  }
  .axis-caption span,
  .x-caption span {
    display: block;
    font-size: 9px;
    font-weight: 400;
    color: #78909b;
  }
  .plot-frame {
    position: relative;
    margin: 24px 12px 33px 34px;
  }
  .plot-area {
    position: relative;
    height: 320px;
    isolation: isolate;
  }
  .plot-area svg {
    position: absolute;
    width: 100%;
    height: 100%;
    inset: 0;
    overflow: visible;
  }
  .grid {
    stroke: #dfe9ed;
    stroke-width: 0.2;
    fill: none;
    stroke-dasharray: 1 1;
  }
  .zero {
    stroke: #9eb5bf;
    stroke-width: 0.3;
    fill: none;
  }
  .plot-guides {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .plot-guides i {
    position: absolute;
    display: block;
    opacity: 0.65;
    transition:
      top 0.35s ease,
      left 0.35s ease,
      width 0.35s ease,
      height 0.35s ease;
  }
  .guide-horizontal {
    left: 0;
    border-top: 1px dashed #527687;
  }
  .guide-vertical {
    border-left: 1px dashed #527687;
  }
  .plot-instructions {
    font-size: 10px;
    line-height: 1.7;
    color: #647f8d;
    margin: 12px 0 0;
  }
  .plot-instructions b {
    color: #345969;
    margin-right: 5px;
  }
  .plot-instructions span {
    display: block;
    margin-top: 4px;
    font-size: 9px;
  }
  .y-ticks {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -36px;
    width: 28px;
  }
  .y-ticks span {
    position: absolute;
    right: 0;
    transform: translateY(-50%);
    font-size: 9px;
    color: #7d929b;
  }
  .x-ticks {
    position: absolute;
    bottom: -23px;
    left: 0;
    right: 0;
    height: 16px;
  }
  .x-ticks span {
    position: absolute;
    transform: translateX(-50%);
    font-size: 9px;
    color: #7d929b;
  }
  .x-caption {
    text-align: right;
  }
  .pattern-dot {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 28px;
    background: transparent;
    border: 0;
    padding: 0;
    display: grid;
    place-items: center;
    z-index: 1;
    transition:
      left 0.35s ease,
      top 0.35s ease;
  }
  .pattern-dot i {
    display: block;
    width: 10px;
    height: 10px;
    background: var(--dot);
    border: 1.5px solid white;
    border-radius: 50%;
    box-shadow: 0 1px 4px #294b6222;
    transition: transform 0.15s;
  }
  .pattern-dot span {
    display: none;
    position: absolute;
    left: 23px;
    top: 4px;
    background: #193b4b;
    color: white;
    padding: 3px 5px;
    border-radius: 3px;
    font-size: 9px;
    pointer-events: none;
  }
  .pattern-dot.label-left span {
    left: auto;
    right: 23px;
  }
  .pattern-dot.chosen,
  .pattern-dot.preview,
  .pattern-dot:focus-visible {
    z-index: 3;
  }
  .pattern-dot.chosen i {
    outline: 2px solid #224e60;
    outline-offset: 3px;
  }
  .pattern-dot.compared {
    z-index: 2;
  }
  .pattern-dot.compared i {
    outline: 2px dashed #80668d;
    outline-offset: 7px;
  }
  .pattern-dot.compared span {
    display: block;
    background: #71577f;
    top: 22px;
  }
  .plot-comparison-key {
    font-size: 9px;
    line-height: 1.7;
    color: #80668d;
    margin: 12px 0 0;
  }
  .pattern-dot.preview i,
  .pattern-dot:focus-visible i {
    transform: scale(1.4);
  }
  .pattern-dot.chosen span,
  .pattern-dot.preview span,
  .pattern-dot:focus-visible span {
    display: block;
  }
  .pattern-dot:focus-visible {
    outline: 2px solid #224e60;
    outline-offset: 2px;
    border-radius: 50%;
  }
  .pattern-plot[data-locked='false'] .pattern-dot,
  .pattern-plot[data-locked='false'] .plot-guides i {
    transition: none;
  }
  .plot-readout {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    align-items: center;
    border-top: 1px solid #d9e5e9;
    margin-top: 18px;
    padding-top: 14px;
    min-height: 42px;
    font-size: 11px;
    color: #345969;
  }
  .plot-readout span {
    font-size: 10px;
    color: #738b97;
    line-height: 1.6;
  }
  .readout-state {
    color: #647f8d;
    font-size: 8px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  @media (max-width: 650px) {
    .pattern-plot {
      padding: 18px 13px 13px;
    }
    .plot-area {
      height: 270px;
    }
    .plot-frame {
      margin-left: 26px;
      margin-right: 16px;
    }
    .y-ticks {
      left: -29px;
      width: 24px;
    }
    .plot-readout {
      min-height: 62px;
    }
    .pattern-dot i {
      width: 9px;
      height: 9px;
    }
    .axis-caption,
    .x-caption {
      font-size: 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pattern-dot,
    .pattern-dot i,
    .plot-guides i {
      transition: none;
    }
  }
</style>
