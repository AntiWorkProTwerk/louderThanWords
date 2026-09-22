<script lang="ts">
  import { chartPath } from './economy';
  let {
    local,
    national,
    from,
    through,
    label,
  }: {
    local: { month: string; value: number | null }[];
    national: { month: string; value: number | null }[];
    from: string;
    through: string;
    label: string;
  } = $props();
  const values = $derived(
    [...local, ...national].flatMap((p) => (p.value === null ? [] : [p.value])),
  );
  const low = $derived(Math.min(100, ...values)),
    high = $derived(Math.max(100, ...values)),
    padding = $derived(Math.max(1, (high - low) * 0.12));
  const min = $derived(Math.max(0, low - padding)),
    max = $derived(high + padding);
</script>

<figure class="paycheck-chart">
  <figcaption>{label}<span>Start = 100 · fitted axis</span></figcaption>
  <svg
    viewBox="0 0 820 320"
    role="img"
    aria-label={`${label}. Both series indexed to 100 in ${from}; through ${through}. Missing months remain gaps. Fitted axis does not start at zero.`}
    ><g transform="translate(76 16)">
      {#each [0, 1, 2, 3, 4] as tick}<line
          x1="0"
          x2="720"
          y1={tick * 62.5}
          y2={tick * 62.5}
          stroke="#e6dfd5"
          stroke-dasharray="3 5"
        /><text x="-12" y={tick * 62.5 + 6} text-anchor="end"
          >{(max - ((max - min) * tick) / 4).toFixed(0)}</text
        >{/each}
      <line
        x1="0"
        x2="720"
        y1={250 - ((100 - min) / (max - min)) * 250}
        y2={250 - ((100 - min) / (max - min)) * 250}
        stroke="#bdb3a6"
        stroke-dasharray="4 5"
      />
      <path
        d={chartPath(national, from, through, min, max)}
        fill="none"
        stroke="#738d9e"
        stroke-width="3"
        stroke-dasharray="8 6"
      />
      <path
        d={chartPath(local, from, through, min, max)}
        fill="none"
        stroke="#a66016"
        stroke-width="3.5"
        stroke-linecap="round"
      />
      <text x="0" y="283">{from}</text><text x="720" y="283" text-anchor="end">{through}</text>
    </g></svg
  >
  <div><span>━ Selected geography</span><span>┄ United States</span></div>
</figure>

<style>
  .paycheck-chart {
    margin: 20px 0;
    border: 1px solid #e0d8cb;
    border-radius: 10px;
    background: linear-gradient(125deg, #fff, #faf7f1);
    padding: 16px 10px 14px 0;
  }
  .paycheck-chart figcaption {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    padding: 0 14px;
    font-size: 12px;
    font-weight: 650;
  }
  .paycheck-chart figcaption span {
    font-size: 10px;
    font-weight: 400;
  }
  .paycheck-chart svg {
    width: 100%;
    display: block;
    overflow: visible;
  }
  .paycheck-chart text {
    fill: #5f574a;
    font:
      17px Inter,
      sans-serif;
  }
  .paycheck-chart > div {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    padding: 0 14px;
    font-size: 11px;
    color: #a66016;
  }
  .paycheck-chart > div span + span {
    color: #526d80;
  }
  @media (max-width: 550px) {
    .paycheck-chart text {
      font-size: 28px;
    }
  }
</style>
