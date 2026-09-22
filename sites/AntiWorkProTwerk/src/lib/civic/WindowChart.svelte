<script lang="ts">
  import { chartPath, monthIndex } from './economy';
  let {
    points,
    context,
    from,
    through,
    axis,
    units,
  }: {
    points: { month: string; value: number | null }[];
    context: { month: string; value: number | null }[];
    from: string;
    through: string;
    axis: string;
    units: string;
  } = $props();
  const values = $derived(points.flatMap((p) => (p.value === null ? [] : [p.value])));
  const low = $derived(values.length ? Math.min(...values) : 0),
    high = $derived(values.length ? Math.max(...values) : 1);
  const margin = $derived(Math.max((high - low) * 0.08, high * 0.005, 0.01));
  const min = $derived(axis === 'zero' ? 0 : Math.max(0, low - margin)),
    max = $derived(high + margin);
  const path = $derived(chartPath(points, from, through, min, max));
  const allValues = $derived(context.flatMap((p) => (p.value === null ? [] : [p.value])));
  const allMin = $derived(allValues.length ? Math.min(...allValues) : 0),
    allMax = $derived((allValues.length ? Math.max(...allValues) : 1) + 0.01);
  const overview = $derived(
    context.length > 1
      ? chartPath(context, context[0].month, context.at(-1)!.month, allMin, allMax, 720, 55)
      : '',
  );
  const extent = $derived(
    context.length > 1 ? monthIndex(context.at(-1)!.month) - monthIndex(context[0].month) : 1,
  );
  const startX = $derived(
      context.length ? ((monthIndex(from) - monthIndex(context[0].month)) / extent) * 720 : 0,
    ),
    endX = $derived(
      context.length ? ((monthIndex(through) - monthIndex(context[0].month)) / extent) * 720 : 720,
    );
</script>

<figure class="window-chart">
  <figcaption>
    {units}
    <span
      >{axis === 'zero'
        ? 'Y-axis begins at zero'
        : 'Fitted y-axis · does not necessarily begin at zero'}</span
    >
  </figcaption>
  <svg
    viewBox="0 0 820 310"
    role="img"
    aria-label={`${units}, ${from} through ${through}. ${points.filter((p) => p.value === null).length} missing months are gaps. ${axis === 'zero' ? 'Zero baseline.' : 'Fitted axis.'}`}
  >
    <g transform="translate(76 15)">
      {#each [0, 1, 2, 3, 4] as tick}<line
          x1="0"
          x2="720"
          y1={tick * 62.5}
          y2={tick * 62.5}
          stroke="#dce7ee"
          stroke-dasharray="3 5"
        /><text x="-12" y={tick * 62.5 + 4} text-anchor="end"
          >{(max - ((max - min) * tick) / 4).toFixed(2)}</text
        >{/each}
      <path
        d={path}
        fill="none"
        stroke="#126983"
        stroke-width="3"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      {#each [points[0], points.at(-1)] as point}{#if point?.value !== null && point?.value !== undefined}<circle
            cx={point.month === from ? 0 : 720}
            cy={250 - ((point.value - min) / (max - min)) * 250}
            r="4"
            fill="#126983"><title>{point.month}: {point.value.toFixed(3)}</title></circle
          >{/if}{/each}
      <text x="0" y="282">{from}</text><text x="720" y="282" text-anchor="end">{through}</text>
    </g>
  </svg>
  <div class="overview-label">Where your window sits in the captured history</div>
  <svg
    viewBox="0 0 820 88"
    role="img"
    aria-label="Full-history context with the selected date range shaded"
  >
    <g transform="translate(76 7)"
      ><rect
        x={Math.max(0, startX)}
        y="0"
        width={Math.max(0, endX - startX)}
        height="55"
        fill="#dbeef1"
      /><path d={overview} fill="none" stroke="#7994a9" stroke-width="1.6" /><text x="0" y="76"
        >{context[0]?.month}</text
      ><text x="720" y="76" text-anchor="end">{context.at(-1)?.month}</text></g
    >
  </svg>
</figure>

<style>
  .window-chart {
    margin: 24px 0;
    padding: 20px 12px 14px 0;
    background: linear-gradient(125deg, #fff, #f6fbfc);
    border: 1px solid #d9e7ed;
    border-radius: 6px;
    overflow: hidden;
  }
  .window-chart figcaption {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: space-between;
    padding: 0 18px;
    font-size: 11px;
    color: #405e77;
  }
  .window-chart figcaption span {
    color: #698297;
    font-size: 10px;
  }
  .window-chart svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .window-chart text {
    font-family: var(--sans);
    font-size: 12px;
    fill: #657e92;
  }
  .overview-label {
    padding-left: 24px;
    font-size: 10px;
    color: #657e92;
    border-top: 1px solid #e0eaf0;
    padding-top: 16px;
  }
  @media (max-width: 650px) {
    .window-chart {
      padding: 16px 4px 12px 0;
    }
    .window-chart text {
      font-size: 23px;
    }
    .window-chart figcaption {
      padding: 0 12px;
      font-size: 10px;
    }
  }
</style>
