<script lang="ts">
  import { comparisonDomain, type StateComparison } from './pattern-comparison';
  import type { PatternResult } from './patterns';
  let {
    comparison,
    error,
    peer,
    selectedName,
    states,
    history,
    ready,
    onchange,
    onswap,
    onchart,
    sources,
  }: {
    comparison: StateComparison | null;
    error: string;
    peer: string | null;
    selectedName: string;
    states: { code: string; name: string }[];
    history: PatternResult[];
    ready: boolean;
    onchange: (code: string | null) => void;
    onswap: () => void;
    onchart: () => void;
    sources: { paycheck: string; economy: string };
  } = $props();
  const id = $props.id();
  const format = (value: number | null, unit: string) =>
    value === null ? 'Unavailable' : `${value > 0 ? '+' : ''}${value.toFixed(2)}${unit}`;
  const axes = $derived(
    comparison
      ? Object.fromEntries(
          ['x', 'y'].map((key) => [
            key,
            comparisonDomain(
              history.flatMap((year) =>
                year.rows
                  .filter((row) =>
                    [comparison!.primary.code, comparison!.secondary.code].includes(row.code),
                  )
                  .map((row) => row[key as 'x' | 'y']),
              ),
            ),
          ]),
        )
      : {},
  );
  function position(value: number, axis: { low: number; high: number }) {
    return ((value - axis.low) / (axis.high - axis.low)) * 100;
  }
</script>

<section class="state-comparison" aria-labelledby={`${id}-heading`} data-testid="state-comparison">
  <div class="comparison-heading">
    <div>
      <span>TWO REGIONS / THE SAME WINDOW</span>
      <h3 id={`${id}-heading`}>Put the changes side by side.</h3>
    </div>
    <label
      >Compare with {selectedName}<select
        aria-label="Comparison state or district"
        value={peer ?? ''}
        disabled={!ready}
        onchange={(e) => onchange(e.currentTarget.value || null)}
      >
        <option value="">Choose a comparison…</option>
        {#if peer && !states.some((s) => s.code === peer)}<option value={peer}
            >Unknown region</option
          >{/if}
        {#each states as state}<option value={state.code}>{state.name}</option>{/each}
      </select></label
    >
  </div>
  {#if error}<p class="comparison-warning" role="alert">{error}</p>
    <button class="clear-comparison" disabled={!ready} onclick={() => onchange(null)}
      >Clear comparison</button
    >
  {:else if comparison}
    <div class="comparison-key">
      <span><i class="primary-key"></i>{comparison.primary.name} · selected</span><span
        ><i class="secondary-key"></i>{comparison.secondary.name} · comparison</span
      >
    </div>
    <p class="comparison-period">
      {comparison.from} → {comparison.through}. Two state-level observations, not matched workers or
      a new correlation sample.
    </p>
    {#key `${comparison.primary.code}/${comparison.secondary.code}/${comparison.pair}`}
      {#each comparison.measures as measure}{@const axis = axes[measure.key]}
        <article class="comparison-measure" data-measure={measure.key}>
          <h4>
            {measure.label}<small
              >Annual change · {measure.unit === 'pp' ? 'percentage points' : 'percent'}</small
            >
          </h4>
          <div class="comparison-values">
            <div>
              <span>{comparison.primary.code}</span><strong
                >{format(measure.primary, measure.unit)}</strong
              >
            </div>
            <div>
              <span>{comparison.secondary.code}</span><strong
                >{format(measure.secondary, measure.unit)}</strong
              >
            </div>
          </div>
          {#if axis}<div class="comparison-track" aria-hidden="true">
              <i class="comparison-zero" style={`left:${position(0, axis)}%`}></i>
              {#if measure.primary !== null && measure.secondary !== null}<i
                  class="comparison-bridge"
                  style={`left:${position(Math.min(measure.primary, measure.secondary), axis)}%;width:${(Math.abs(measure.primary - measure.secondary) / (axis.high - axis.low)) * 100}%`}
                ></i>{/if}
              {#if measure.primary !== null}<i
                  class="comparison-marker primary-marker"
                  style={`left:${position(measure.primary, axis)}%`}
                ></i>{/if}
              {#if measure.secondary !== null}<i
                  class="comparison-marker secondary-marker"
                  style={`left:${position(measure.secondary, axis)}%`}
                ></i>{/if}
              <span class="axis-low">{axis.low.toFixed(1)}</span><span class="axis-high"
                >{axis.high.toFixed(1)}</span
              >
            </div>{/if}
          <p class="comparison-gap">
            {comparison.primary.code} minus {comparison.secondary.code}:
            <b>{format(measure.gap, ' pp')}</b>
          </p>
          {#if measure.gap === null}<p class="comparison-warning">
              A value is unavailable. No difference or connecting line is inferred.
            </p>{/if}
        </article>
      {/each}
    {/key}
    <p class="comparison-method">
      Differences are percentage points between annual changes—not dollar amounts, relative
      percentage gaps, rankings or effects. Each row keeps its scale across the available years for
      these two regions; the rows use different scales. Earnings are nominal.
    </p>
    <p class="comparison-markers">
      Solid outline = selected state. Purple dashed outline = comparison state. Missing pairs have
      no scatter dot; map outlines identify regions, not data availability. The full annual
      correlation sample is unchanged.
    </p>
    <div class="comparison-actions">
      <button disabled={!ready} onclick={onchart}>View marked chart ↑</button><button
        disabled={!ready}
        onclick={onswap}>Swap states ⇄</button
      ><button disabled={!ready} onclick={() => onchange(null)}>Clear comparison</button>
    </div>
    <div class="comparison-sources">
      <a href={sources.paycheck}>Open {comparison.secondary.name} pay + jobs source ↗</a><a
        href={sources.economy}>Open {comparison.secondary.name} unemployment source ↗</a
      >
    </div>
  {:else}<p class="comparison-period">
      Choose another region to compare its changes with {selectedName}. The chart’s correlation
      continues to use all complete region pairs.
    </p>{/if}
</section>

<style>
  .state-comparison {
    margin: 18px 0;
    padding: 21px;
    border: 1px solid #d8dce8;
    border-radius: 13px;
    background: linear-gradient(125deg, #faf8fc, #f4f8fa);
    color: #365768;
  }
  .comparison-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
  }
  .comparison-heading > div {
    flex: 1;
    min-width: 170px;
  }
  .comparison-heading > div > span {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.4px;
    color: #8a8096;
  }
  h3 {
    font:
      600 30px/1.1 'Barlow Condensed',
      sans-serif;
    margin: 8px 0;
  }
  label {
    display: grid;
    gap: 6px;
    font-size: 10px;
    color: #766783;
    flex: 1;
    max-width: 250px;
  }
  select {
    min-height: 44px;
    max-width: 100%;
    width: 100%;
    padding: 8px 10px;
    background: white;
    border: 1px solid #cfc7d9;
    border-radius: 6px;
    font-size: 12px;
    color: #4e405f;
  }
  .comparison-key {
    display: flex;
    gap: 10px 22px;
    flex-wrap: wrap;
    margin: 15px 0 8px;
    font-size: 11px;
    font-weight: 600;
  }
  .comparison-key span {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .primary-key {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #294e61;
  }
  .secondary-key {
    width: 9px;
    height: 9px;
    transform: rotate(45deg);
    border: 2px solid #80668d;
  }
  p {
    font-size: 10px;
    line-height: 1.8;
  }
  .comparison-period {
    color: #788b96;
  }
  .comparison-measure {
    margin: 15px 0;
    padding: 15px 17px;
    background: #ffffffc9;
    border: 1px solid #dce4e9;
    border-radius: 10px;
  }
  h4 {
    font-size: 12px;
    margin: 0;
    color: #355a6a;
  }
  h4 small {
    display: block;
    font-size: 9px;
    font-weight: 400;
    color: #8093a0;
    margin-top: 5px;
  }
  .comparison-values {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 13px 0 9px;
  }
  .comparison-values > div {
    display: grid;
    gap: 3px;
  }
  .comparison-values > div:last-child {
    text-align: right;
    color: #80668d;
  }
  .comparison-values span {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1px;
  }
  .comparison-values strong {
    font:
      600 28px 'Barlow Condensed',
      sans-serif;
    font-variant-numeric: tabular-nums;
  }
  .comparison-track {
    position: relative;
    height: 22px;
    margin: 10px 8px 28px;
    background: linear-gradient(transparent 10px, #e1e9ee 10px, #e1e9ee 12px, transparent 12px);
  }
  .comparison-zero {
    position: absolute;
    top: 0;
    height: 22px;
    border-left: 1px dashed #a1b5c0;
  }
  .comparison-bridge {
    position: absolute;
    top: 8px;
    height: 6px;
    border-radius: 3px;
    background: #bbc9d4;
    transition:
      left 0.3s ease,
      width 0.3s ease;
  }
  .comparison-marker {
    position: absolute;
    top: 11px;
    width: 12px;
    height: 12px;
    transition: left 0.3s ease;
  }
  .primary-marker {
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: #294e61;
    border: 2px solid white;
    box-shadow: 0 0 0 1px #294e61;
  }
  .secondary-marker {
    transform: translate(-50%, -50%) rotate(45deg);
    border: 2px solid #80668d;
    background: #fff;
  }
  .axis-low,
  .axis-high {
    position: absolute;
    top: 27px;
    font-size: 8px;
    color: #92a1ac;
    font-variant-numeric: tabular-nums;
  }
  .axis-low {
    left: 0;
  }
  .axis-high {
    right: 0;
  }
  .comparison-gap {
    margin: 0;
    color: #758995;
  }
  .comparison-gap b {
    color: #4c6577;
    font-variant-numeric: tabular-nums;
  }
  .comparison-method,
  .comparison-markers {
    font-size: 9px;
    color: #7c8b99;
    margin: 10px 0;
  }
  .comparison-warning {
    color: #8b6837;
  }
  .comparison-actions {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
    margin-top: 15px;
  }
  button {
    min-height: 40px;
    padding: 8px 11px;
    font-size: 10px;
    color: #655174;
    background: #fff;
    border: 1px solid #d6ccde;
    border-radius: 6px;
    cursor: pointer;
  }
  button:hover {
    background: #f2edf6;
  }
  .comparison-sources {
    display: flex;
    flex-wrap: wrap;
    gap: 9px 18px;
    margin-top: 13px;
    font-size: 10px;
    line-height: 1.7;
  }
  .comparison-sources a {
    color: #71557f;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  @media (max-width: 650px) {
    .state-comparison {
      padding: 16px 13px;
    }
    .comparison-heading {
      display: block;
    }
    label {
      max-width: none;
      margin-top: 12px;
    }
    h3 {
      font-size: 28px;
    }
    .comparison-measure {
      padding: 14px 12px;
    }
    .comparison-values strong {
      font-size: 26px;
    }
    button {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .comparison-marker,
    .comparison-bridge {
      transition: none;
    }
  }
</style>
