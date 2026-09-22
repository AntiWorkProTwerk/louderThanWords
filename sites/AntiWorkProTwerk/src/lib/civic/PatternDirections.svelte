<script lang="ts">
  import { patternDirections } from './pattern-directions';
  import { patternPairs, type PatternResult } from './patterns';
  let {
    result,
    selected,
    ready,
    onselect,
  }: {
    result: PatternResult;
    selected: string;
    ready: boolean;
    onselect: (code: string) => void;
  } = $props();
  const breakdown = $derived(patternDirections(result));
  const pair = $derived(patternPairs[result.config.pair]);
  const signed = (value: number | null, unit: string) =>
    value === null
      ? 'Unavailable'
      : value !== 0 && Math.abs(value) < 0.005
        ? `${value > 0 ? '+' : '−'}<0.005${unit}`
        : `${value > 0 ? '+' : ''}${value.toFixed(2)}${unit}`;
</script>

<details class="direction-breakdown" data-testid="pattern-directions">
  <summary>
    <span><small>BEHIND THE COLORS</small><b>Where did the changes land?</b></span>
    <span class="summary-end">{breakdown.total} regions <i aria-hidden="true">+</i></span>
    <span class="direction-strip" aria-hidden="true">
      {#each breakdown.groups as group (group.key)}<i
          class:missing={group.key === 'missing'}
          style={`--tone:${group.color};width:${group.share}%`}
          data-direction={group.key}
        ></i>{/each}
    </span>
  </summary>
  <div class="direction-content">
    <p class="explanation">
      December {result.config.year - 1} → December {result.config.year}. The strip counts all {breakdown.total}
      collected regions, including incomplete pairs. Open a group, then select a region to mark it on
      the chart and map.
    </p>
    <div class="direction-groups">
      {#each breakdown.groups as group (group.key)}
        <details class="direction-group" data-direction={group.key}>
          <summary>
            <i
              class:missing={group.key === 'missing'}
              style={`--tone:${group.color}`}
              aria-hidden="true"
            ></i>
            <span>{group.label}</span><b>{group.rows.length}</b><em aria-hidden="true">⌄</em>
          </summary>
          {#if group.rows.length}
            <ul aria-label={group.label}>
              {#each group.rows as row (row.code)}<li>
                  <button
                    disabled={!ready}
                    aria-pressed={selected === row.code}
                    data-direction-state={row.code}
                    onclick={() => onselect(row.code)}
                  >
                    <span
                      ><b>{row.name}</b><small
                        >{selected === row.code
                          ? 'Selected on chart / map'
                          : 'Select region →'}</small
                      ></span
                    >
                    <span class="row-values"
                      >Pay {signed(row.y, '%')}<br />
                      {result.config.pair === 'pay-jobs' ? 'Jobs' : 'Unemployment'}
                      {signed(row.x, pair.xUnit)}</span
                    >
                  </button>
                  {#if row.reason}<p class="missing-reason">{row.reason}</p>{/if}
                </li>{/each}
            </ul>
          {:else}<p class="empty">No regions in this group for this year.</p>{/if}
        </details>
      {/each}
    </div>
    <p class="explanation limits">
      Groups describe changes relative to zero, not a ranking or a strength score. They do not
      filter the chart or recalculate r. Direction uses unrounded values; very small nonzero changes
      are marked explicitly. Pay means nominal average hourly earnings.
    </p>
  </div>
</details>

<style>
  .direction-breakdown {
    margin: 16px 0 8px;
    border: 1px solid #ccdde5;
    border-radius: 12px;
    overflow: hidden;
    background: #f4f9fb;
    color: #254b5d;
  }
  summary {
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary, button {
    scroll-margin-block: 64px 16px;
  }
  .direction-breakdown > summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    min-height: 64px;
  }
  small {
    display: block;
  }
  summary small {
    font-size: 8px;
    letter-spacing: 1.7px;
    margin-bottom: 5px;
  }
  summary b {
    font-weight: 650;
    font-size: 14px;
  }
  .summary-end {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    flex-shrink: 0;
  }
  .summary-end i {
    font-style: normal;
    font-size: 22px;
    transition: transform 180ms ease;
  }
  .direction-breakdown[open] .summary-end i {
    transform: rotate(45deg);
  }
  .direction-strip {
    display: flex;
    grid-column: 1 / -1;
    height: 9px;
    background: #e5edf1;
  }
  .direction-strip i {
    display: block;
    background: var(--tone);
    transition: width 220ms ease;
  }
  .direction-content {
    padding: 0 16px 12px;
  }
  .explanation {
    font-size: 11px;
    line-height: 1.65;
    margin: 14px 0;
    color: #496776;
  }
  .direction-groups {
    border-top: 1px solid #d4e2e9;
  }
  .direction-group {
    border-bottom: 1px solid #d4e2e9;
  }
  .direction-group > summary {
    min-height: 44px;
    display: grid;
    grid-template-columns: 9px 1fr auto 12px;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    padding: 7px 0;
  }
  .direction-group summary > i {
    width: 9px;
    height: 9px;
    background: var(--tone);
    border-radius: 2px;
  }
  .direction-group summary em {
    font-style: normal;
    transition: transform 180ms ease;
  }
  .direction-group[open] summary em {
    transform: rotate(180deg);
  }
  .missing {
    background: repeating-linear-gradient(135deg, #d3dce1 0 3px, #f4f9fb 3px 6px) !important;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0 0 10px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  li {
    min-width: 0;
  }
  button {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 58px;
    padding: 9px 10px;
    text-align: left;
    color: inherit;
    background: #fff;
    border: 1px solid #cfdee6;
    border-radius: 7px;
    font: inherit;
    cursor: pointer;
  }
  button b {
    font-size: 12px;
  }
  button small {
    font-size: 9px;
    margin-top: 4px;
    color: #526f7e;
  }
  button[aria-pressed='true'] {
    background: #e8f2f6;
    border-color: #365f73;
    box-shadow: inset 3px 0 #365f73;
  }
  button:hover {
    border-color: #365f73;
  }
  button:disabled {
    cursor: wait;
  }
  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid #216aaa;
    outline-offset: -3px;
  }
  .row-values {
    font-size: 10px;
    line-height: 1.7;
    text-align: right;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .empty,
  .missing-reason {
    font-size: 11px;
    line-height: 1.6;
    margin: 4px 0 12px;
  }
  .limits {
    margin-bottom: 0;
  }
  @media (max-width: 1000px) {
    ul {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 400px) {
    .direction-breakdown > summary {
      padding: 12px;
    }
    .direction-content {
      padding: 0 12px 12px;
    }
    .summary-end {
      gap: 6px;
      font-size: 10px;
    }
    summary b {
      font-size: 13px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .direction-strip i,
    .summary-end i,
    .direction-group summary em {
      transition: none;
    }
  }
</style>
