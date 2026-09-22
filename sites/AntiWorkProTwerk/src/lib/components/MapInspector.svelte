<script lang="ts">
  import { Popover } from 'bits-ui';
  import { onMount, tick, untrack } from 'svelte';
  import { mapReadout, type MapScope, type MapMetric } from '$lib/civic/map-inspector';
  import type { State } from '$lib/data/schema';
  import type { BackgroundState } from '$lib/civic/map-background';
  import { inspectorPosition } from '$lib/civic/inspector-position';
  let {
    open = $bindable(false),
    previewCode = $bindable<string | null>(null),
    pointerCode,
    selected,
    comparisonState = null,
    states,
    scope,
    counts,
    metrics,
    contextKey,
    lightweight = false,
    backgroundState = 'idle',
    onretrybackground,
    onselect,
  }: {
    open?: boolean;
    previewCode?: string | null;
    pointerCode: string | null;
    selected: State;
    comparisonState?: State | null;
    states: State[];
    scope: MapScope;
    counts: Record<string, number>;
    metrics: Record<string, MapMetric>;
    contextKey: string;
    lightweight?: boolean;
    backgroundState?: BackgroundState;
    onretrybackground?: () => void;
    onselect: (code: string) => void;
  } = $props();
  let mounted = $state(false),
    followPointer = $state(true);
  let input: HTMLSelectElement | undefined = $state();
  let backgroundPanel: HTMLDivElement | undefined = $state();
  let trigger: HTMLButtonElement | null = $state(null);
  let placement = $state(inspectorPosition({ left: 12, top: 100, bottom: 144 }, 390, 844));
  function place() {
    if (trigger) placement = inspectorPosition(trigger.getBoundingClientRect(), window.innerWidth, window.innerHeight);
  }
  const previewState = $derived(states.find((s) => s.code === previewCode));
  const sortedStates = $derived(states.toSorted((a, b) => a.name.localeCompare(b.name)));
  const reading = $derived(
    previewState ? mapReadout(previewState.code, scope, counts, metrics) : null,
  );
  onMount(() => {
    mounted = true;
  });
  $effect(() => {
    const key = contextKey;
    untrack(() => {
      open = false;
      previewCode = null;
    });
  });
  $effect(() => {
    if (open)
      untrack(() => {
        place();
        previewCode = selected.code;
        followPointer = true;
      });
    else previewCode = null;
  });
  $effect(() => {
    if (open && followPointer && pointerCode) previewCode = pointerCode;
  });
  function apply() {
    if (!previewState) return;
    const code = previewState.code;
    open = false;
    onselect(code);
  }
</script>

<svelte:window onresize={() => { if (open) place(); }} />
<Popover.Root bind:open>
  <Popover.Trigger bind:ref={trigger} class="map-inspector-trigger" disabled={!mounted} aria-haspopup="dialog"
    ><span aria-hidden="true">⌕</span> Inspect map</Popover.Trigger
  >
  <Popover.Portal>
    <Popover.ContentStatic
      class="map-inspector"
      style={`left:${placement.left}px;top:${placement.top === null ? 'auto' : `${placement.top}px`};bottom:${placement.bottom === null ? 'auto' : `${placement.bottom}px`};width:${placement.width}px;max-height:${placement.maxHeight}px`}
      data-placement={placement.side}
      trapFocus={false}
      role="dialog"
      aria-modal="false"
      aria-label="Map inspector"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        tick().then(() => input?.focus({ preventScroll: true }));
      }}
    >
      <header class="inspector-header"><div class="inspector-top">
        <span>MAP / READ THE CONTEXT</span><Popover.Close
          class="inspector-close"
          aria-label="Close map inspector">×</Popover.Close
        >
      </div>
      <p class="inspector-view">{scope.title}</p>
      </header>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (This named scroll region needs native keyboard scrolling; see docs/plans/platform/inspector-layout.md.) -->
      <div class="inspector-body" role="region" aria-label="State preview and source details" tabindex="0">
      {#if scope.sample}<p class="sample-warning">
          Illustrative demo—not verified records about real people.
        </p>{/if}
      <label class="preview-label" for="map-preview-state"
        >Preview a state <span>Does not change your view</span></label
      >
      <select
        id="map-preview-state"
        bind:this={input}
        value={previewCode ?? selected.code}
        onchange={(e) => {
          followPointer = false;
          previewCode = e.currentTarget.value;
        }}
        >{#each sortedStates as item}<option value={item.code}>{item.name}</option>{/each}</select
      >
      <label class="pointer-option"
        ><input type="checkbox" bind:checked={followPointer} /> Follow pointer over the map</label
      >
      {#if previewState && reading}<div
          class="inspector-reading"
          style={`--reading:${reading.color}`}
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{scope.measure}</span><strong>{reading.value}</strong><small
            >{previewState.name} · {reading.status}</small
          >
          <p>{reading.detail}</p>
        </div>{/if}
      {#if scope.legend.length}<div class="inspector-legend" aria-label="Map color key">
          {#each scope.legend as item}<span><i style={`--key:${item.color}`}></i>{item.label}</span
            >{/each}
        </div>{/if}
      <p class="inspector-source"><span>SOURCE</span>{scope.source}</p>
      {#if !lightweight && backgroundState !== 'idle'}<div class="inspector-limit" data-testid="background-status" tabindex="-1" bind:this={backgroundPanel}>
        <p>{backgroundState === 'loading' ? 'U.S. state boundaries are ready. Surrounding countries are loading separately; you can already inspect and select states.' : backgroundState === 'error' ? 'Surrounding countries could not load. U.S. state boundaries and record filters are still available.' : 'U.S. states and surrounding geography loaded. Background borders are geographic context, not evidence coverage.'}</p>
        {#if backgroundState === 'error' && onretrybackground}<button class="retry-background" onclick={() => {backgroundPanel?.focus({preventScroll:true});onretrybackground?.();}}>Retry surrounding geography</button>{/if}
      </div>{/if}
      {#if comparisonState}<p class="inspector-limit" data-testid="comparison-map-note">Comparison state: {comparisonState.name}. Purple dashed outline; a second state selection, not an extra observation in the correlation.</p>{/if}
      <p class="inspector-limit">
        State labels are geographic anchors, not exact offices, facilities or people. Any actual
        facility points are separate.
      </p>
      {#if lightweight}<p class="inspector-limit" data-testid="projection-note">Lightweight map: Alaska and Hawaii are insets; Alaska is rescaled. Distances between insets are not geographic. Boundaries: US Census / US Atlas.</p>{/if}
      </div>
      <footer class="inspector-footer">
      <p>Preview first. Apply when you’re ready.</p>
      <button class="apply-preview" disabled={!previewState} onclick={apply}
        >Use {previewState?.name ?? 'state'} in this view <span>↗</span></button
      >
      </footer>
    </Popover.ContentStatic>
  </Popover.Portal>
</Popover.Root>

<style>
  .retry-background {min-height:44px;padding:8px 12px;border:1px solid #bcd2df;border-radius:6px;background:#f2f8fc;color:#31576d;font-size:11px;}
  :global(.map-inspector-trigger) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #c4d8e2 !important;
    background: #f3f8fa !important;
    color: #355c6f !important;
  }
  :global(.map-inspector-trigger > span) {
    font-size: 16px;
    line-height: 1;
  }
  :global(.map-inspector) {
    position: fixed;
    display: flex;
    flex-direction: column;
    z-index: 60;
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 0;
    background: #fbfdfe;
    border: 1px solid #cbdde6;
    border-radius: 13px;
    box-shadow: 0 15px 48px #173a5129;
    color: #25485a;
    outline: none;
    animation: inspector-in 0.16s ease-out;
    /* Only the mounted panel gets an animation layer; the full map does not. */
    will-change: transform, opacity;
    contain: layout paint;
    scrollbar-width: thin;
  }
  .inspector-header {flex-shrink:0;padding:14px 18px 0;background:#fbfdfe;border-bottom:1px solid #e0eaf0;}
  .inspector-body {flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:16px 18px;}
  .inspector-body:focus-visible {outline:2px solid #6d98a9;outline-offset:-3px;}
  .inspector-footer {flex-shrink:0;padding:10px 18px 14px;background:#f6fafc;border-top:1px solid #dce7ed;}
  .inspector-footer p {font-size:9px;line-height:1.5;color:#657f8d;margin:0 0 7px;}
  .inspector-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 8px;
    letter-spacing: 1.6px;
    color: #809aa7;
    font-weight: 600;
  }
  :global(.inspector-close) {
    width: 44px;
    height: 44px;
    border: 1px solid #d6e3e9;
    border-radius: 50%;
    background: white;
    color: #6f8e9c;
    font-size: 21px;
  }
  .inspector-view {
    font:
      700 32px/1.05 'Barlow Condensed',
      sans-serif;
    margin: 7px 0 18px;
    color: #365b6c;
  }
  .preview-label {
    font-size: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    justify-content: space-between;
    margin-bottom: 7px;
    font-weight: 600;
  }
  .preview-label span {
    font-size: 8px;
    color: #8ba0aa;
    font-weight: 400;
  }
  select {
    width: 100%;
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #bdd3df;
    border-radius: 7px;
    font-size: 13px;
    color: #365c70;
    min-height: 42px;
  }
  .pointer-option {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 9px;
    color: #78929f;
    margin: 12px 0 15px;
  }
  .pointer-option input {
    accent-color: #527f90;
  }
  .inspector-reading {
    padding: 15px 14px 13px;
    border-radius: 8px;
    border: 1px solid #d8e5eb;
    border-left: 3px solid var(--reading);
    background: #f0f6f8;
  }
  .inspector-reading > span {
    font-size: 9px;
    color: #6c8896;
  }
  .inspector-reading strong {
    display: block;
    font:
      700 43px/1.1 'Barlow Condensed',
      sans-serif;
    margin: 5px 0;
    color: #2b5265;
  }
  .inspector-reading small {
    display: block;
    font-size: 9px;
    color: #6b8999;
    line-height: 1.6;
  }
  .inspector-reading p {
    font-size: 10px;
    line-height: 1.75;
    color: #728b99;
    margin: 10px 0 0;
  }
  .inspector-legend {
    display: flex;
    gap: 8px 14px;
    flex-wrap: wrap;
    margin-top: 15px;
    color: #76919f;
    font-size: 8px;
  }
  .inspector-legend span {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .inspector-legend i {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border-radius: 2px;
    background: var(--key);
    border: 1px solid #0000000c;
  }
  .inspector-source {
    display: flex;
    flex-direction: column;
    gap: 5px;
    border-top: 1px solid #dde8ed;
    padding-top: 13px;
    margin: 15px 0 9px;
    font-size: 10px;
    color: #52768a;
    line-height: 1.6;
  }
  .inspector-source > span {
    font-size: 7px;
    letter-spacing: 1.5px;
    color: #8da2ad;
  }
  .inspector-limit {
    font-size: 9px;
    line-height: 1.7;
    color: #8a9da7;
    margin: 0 0 15px;
  }
  .sample-warning {
    font-size: 10px;
    line-height: 1.6;
    color: #8f6c48;
    background: #f8f0e7;
    padding: 10px;
    border-radius: 6px;
    margin: 12px 0;
  }
  .apply-preview {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-radius: 7px;
    background: #345e73;
    color: white;
    font-size: 11px;
    min-height: 44px;
    text-align: left;
  }
  .apply-preview:disabled {
    opacity: 0.5;
  }
  .apply-preview span {
    font-size: 15px;
    color: #c6d8df;
  }
  select:focus-visible,
  .pointer-option input:focus-visible,
  .apply-preview:focus-visible,
  :global(.inspector-close:focus-visible),
  :global(.map-inspector-trigger:focus-visible) {
    outline: 3px solid #6d98a9;
    outline-offset: 3px;
  }
  @keyframes inspector-in {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (hover: none) {
    .pointer-option {
      display: none;
    }
  }
  @media (max-width: 650px) {
    .inspector-header {padding:10px 15px 0;}
    .inspector-body {padding:14px 15px;}
    .inspector-footer {padding:10px 15px 12px;}
    select {
      font-size: 16px;
    }
    .inspector-view {
      font-size: 29px;
      margin-bottom: 13px;
    }
    .inspector-reading strong {
      font-size: 36px;
    }
    .inspector-reading p {
      font-size: 11px;
    }
    .inspector-source {
      font-size: 11px;
    }
    .inspector-limit {
      font-size: 10px;
    }
    .preview-label span {
      font-size: 9px;
    }
    .inspector-top {
      font-size: 7px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.map-inspector) {
      animation: none;
    }
  }
</style>
