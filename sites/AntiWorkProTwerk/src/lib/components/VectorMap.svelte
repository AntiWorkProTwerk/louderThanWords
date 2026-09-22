<script lang="ts">
  import {
    projectStates,
    vectorCamera,
    nextVectorState,
    vectorSiteLinks,
    type StateGeography,
    type MapSite,
  } from '$lib/civic/vector-map';
  import { mapReadout, type MapScope, type MapMetric } from '$lib/civic/map-inspector';
  import type { State } from '$lib/data/schema';
  import { tick } from 'svelte';
  let {
    geography,
    states,
    selected,
    comparisonState = null,
    focusCode,
    previewCode,
    scope,
    counts,
    metrics,
    highlightSelection,
    selectionColor,
    selectionOutlineColor,
    recordSites,
    connectSites,
    onselect,
    onpreview,
    onfocusview,
    onrecordselect,
  }: {
    geography: StateGeography;
    states: State[];
    selected: State;
    comparisonState?: State | null;
    focusCode: string | null;
    previewCode: string | null;
    scope: MapScope;
    counts: Record<string, number>;
    metrics: Record<string, MapMetric>;
    highlightSelection: boolean;
    selectionColor: string;
    selectionOutlineColor: string;
    recordSites: MapSite[];
    connectSites: boolean;
    onselect: (code: string) => void;
    onpreview: (code: string) => void;
    onfocusview: (code: string | null) => void;
    onrecordselect?: (id: string) => void;
  } = $props();
  let svg: SVGSVGElement | undefined = $state();
  let focused = $state(''),
    focusedSite = $state(''),
    activeSite = $state<string | null>(null);
  let popupElement: HTMLDialogElement | undefined = $state();
  const instructionId = $props.id();
  const projected = $derived(projectStates(geography, states));
  const camera = $derived(
    vectorCamera(projected.regions.find((r) => r.code === focusCode)?.bounds),
  );
  const chosen = $derived(
    highlightSelection ? projected.regions.find((r) => r.code === selected.code) : null,
  );
  const preview = $derived(projected.regions.find((r) => r.code === previewCode));
  const compared = $derived(projected.regions.find((r) => r.code === comparisonState?.code));
  const entry = $derived(
    projected.regions.find((r) => r.code === focused)?.code ??
      projected.regions.find((r) => r.code === focusCode)?.code ??
      chosen?.code ??
      projected.regions[0]?.code,
  );
  const sites = $derived(
    recordSites.flatMap((site) => {
      const point =
        Number.isFinite(site.lng) && Number.isFinite(site.lat)
          ? projected.projection([site.lng, site.lat])
          : null;
      return point ? [{ ...site, point }] : [];
    }),
  );
  const connection = $derived(vectorSiteLinks(recordSites, sites, connectSites));
  const links = $derived(connection.targets);
  const popup = $derived(sites.find((s) => s.id === activeSite));
  const siteEntry = $derived(sites.find((s) => s.id === focusedSite)?.id ?? sites[0]?.id);
  const focusedRegion = $derived(
    projected.regions.find((r) => r.code === (focusCode ?? selected.code)),
  );
  const insetBounds = $derived(
    focusCode === 'AK' || focusCode === 'HI' ? focusedRegion?.bounds : null,
  );
  function browse(event: KeyboardEvent, code: string) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = nextVectorState(
      projected.regions.map((r) => r.code),
      code,
      event.key,
    );
    if (next !== null) {
      event.preventDefault();
      Array.from(svg?.querySelectorAll<SVGPathElement>('[data-vector-state]') ?? [])
        .find((p) => p.dataset.vectorState === next)
        ?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onselect(code);
    }
  }
  async function showSite(id: string) {
    activeSite = id;
    await tick();
    if (popupElement && !popupElement.open) popupElement.showModal();
    popupElement?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
  function closeSite() {
    const id = activeSite;
    popupElement?.close();
    activeSite = null;
    Array.from(svg?.querySelectorAll<SVGGElement>('[data-vector-site]') ?? [])
      .find((p) => p.dataset.vectorSite === id)
      ?.focus();
  }
  function browseSite(event: KeyboardEvent, id: string) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = nextVectorState(
      sites.map((s) => s.id),
      id,
      event.key,
    );
    if (next !== null) {
      event.preventDefault();
      Array.from(svg?.querySelectorAll<SVGGElement>('[data-vector-site]') ?? [])
        .find((p) => p.dataset.vectorSite === next)
        ?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void showSite(id);
    }
  }
</script>

<div
  class="vector-map"
  data-testid="vector-map"
  data-focused-state={focusCode ?? '__all__'}
  data-preview-state={previewCode ?? '__none__'}
  data-comparison-state={comparisonState?.code ?? '__none__'}
  data-record-sites={sites.length}
  data-record-links={links.length}
>
  <svg
    bind:this={svg}
    viewBox="0 0 1000 650"
    role="group"
    aria-label="Lightweight United States map"
    aria-describedby={instructionId}
  >
    <defs
      ><clipPath id={`${instructionId}-inset`}>
        {#if insetBounds}<rect
            x={camera.x + insetBounds[0][0] * camera.scale - 8}
            y={camera.y + insetBounds[0][1] * camera.scale - 8}
            width={(insetBounds[1][0] - insetBounds[0][0]) * camera.scale + 16}
            height={(insetBounds[1][1] - insetBounds[0][1]) * camera.scale + 16}
          />{/if}
      </clipPath></defs
    >
    <g clip-path={insetBounds ? `url(#${instructionId}-inset)` : undefined}>
      <g
        class="vector-layer"
        style={`transform:translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`}
      >
        {#each projected.regions as region (region.code)}
          {@const reading = mapReadout(region.code, scope, counts, metrics)}
          <path
            class="vector-state"
            data-vector-state={region.code}
            d={region.path}
            fill={scope.kind === 'context' ? '#d5e6f3' : reading.color}
            role="button"
            tabindex={entry === region.code ? 0 : -1}
            aria-label={`Select ${region.name}. ${reading.value}. ${scope.measure}. ${reading.status}${region.code === comparisonState?.code ? '. Comparison state' : ''}`}
            aria-pressed={highlightSelection && selected.code === region.code}
            onclick={() => onselect(region.code)}
            onkeydown={(e) => browse(e, region.code)}
            onmouseenter={() => onpreview(region.code)}
            onfocus={() => {
              focused = region.code;
              onpreview(region.code);
              if (focusCode) onfocusview(region.code);
            }}
            onblur={() => (focused = '')}
            ><title>{region.name}: {reading.value} · {reading.status}</title></path
          >
        {/each}
        {#if chosen}<path
            class="vector-selected"
            d={chosen.path}
            fill={selectionColor}
            stroke={selectionOutlineColor === 'transparent' ? '#31586e' : selectionOutlineColor}
            aria-hidden="true"
          />{/if}
        {#if compared}<path class="vector-comparison" d={compared.path} aria-hidden="true" />{/if}
        {#if preview}<path class="vector-preview" d={preview.path} aria-hidden="true" />{/if}
        {#each links as site}<path
            class="vector-link"
            d={`M${connection.anchor!.point.join(',')}L${site.point.join(',')}`}
            aria-hidden="true"
          />{/each}
      </g>
      <!-- Keep labels and location targets legible when the underlying shapes zoom. -->
      {#each projected.regions as region (region.code)}
        {#if region.area > 500 || region.code === focusCode || region.code === previewCode || region.code === comparisonState?.code}
          <text
            class="vector-label"
            style={`transform:translate(${camera.x + region.center[0] * camera.scale}px,${camera.y + region.center[1] * camera.scale}px)`}
            aria-hidden="true">{region.code}</text
          >
        {/if}
      {/each}
      {#each sites as site (site.id)}<g
          class="vector-site"
          style={`transform:translate(${camera.x + site.point[0] * camera.scale}px,${camera.y + site.point[1] * camera.scale}px)`}
          data-vector-site={site.id}
          role="button"
          tabindex={siteEntry === site.id ? 0 : -1}
          aria-label={`Location: ${site.label}`}
          onclick={() => showSite(site.id)}
          onfocus={() => {
            focusedSite = site.id;
            if (focusCode) onfocusview(null);
          }}
          onblur={() => (focusedSite = '')}
          onkeydown={(e) => browseSite(e, site.id)}
          ><title>{site.label}</title>
          <circle class="site-hit" r="7" />
          <circle class="site-dot" r="7" />
        </g>{/each}
    </g>
    {#if !focusCode}<text class="inset-note" x="22" y="635"
        >ALASKA &amp; HAWAII ARE INSETS · ALASKA IS RESCALED</text
      >{/if}
  </svg>
  <div class="vector-caption">
    <strong>{focusCode ? `Map focus: ${focusedRegion?.name ?? focusCode}` : 'U.S. overview'}</strong
    >
    <span id={instructionId}
      >Arrow keys browse states; Enter selects. Use the state selector for small shapes.</span
    >
    <small
      >US Census / US Atlas · Alaska &amp; Hawaii inset; Alaska rescaled. No geographic distance
      between insets.</small
    >
    {#if recordSites.length}<small
        >{sites.length} location points shown{recordSites.length - sites.length
          ? ` · ${recordSites.length - sites.length} outside this projection`
          : ''}. {connectSites
          ? 'Lines group records, not travel; cross-inset lines are omitted.'
          : 'Points are separate from state-level counts.'}</small
      >{/if}
  </div>
  {#if popup}<dialog
      bind:this={popupElement}
      class="vector-popup"
      aria-label="Map location evidence"
      tabindex="-1"
      oncancel={(e) => {
        e.preventDefault();
        closeSite();
      }}
    >
      <button class="close-site" aria-label="Close map location" onclick={closeSite}>×</button>
      <p>{popup.label}</p>
      {#if onrecordselect}<button
          class="open-site"
          onclick={() => {
            onrecordselect?.(popup.id);
            activeSite = null;
          }}>Open facility evidence ↗</button
        >{/if}
    </dialog>{/if}
</div>

<style>
  .vector-map {
    position: absolute;
    inset: 23% 12px 17%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  svg {
    width: 100%;
    max-height: 100%;
    overflow: hidden;
    min-height: 0;
    flex: 1;
  }
  .vector-layer {
    transform-origin: 0 0;
    transition: transform 0.35s ease;
  }
  .vector-state {
    stroke: #fff;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    cursor: pointer;
    transition: fill 0.2s;
  }
  .vector-state:hover,
  .vector-state:focus-visible {
    stroke: #44677f;
    stroke-width: 2;
    outline: none;
  }
  .vector-selected,
  .vector-comparison,
  .vector-preview,
  .vector-link {
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .vector-selected {
    stroke-width: 2;
    fill-opacity: 0.94;
  }
  .vector-preview {
    stroke: #44677f;
    stroke-width: 2.5;
    stroke-dasharray: 5 4;
    fill: none;
  }
  .vector-comparison {fill:none;stroke:#80668d;stroke-width:3;stroke-dasharray:6 4;}
  .vector-link {
    stroke: #007d8b;
    stroke-width: 1.3;
    stroke-dasharray: 3 3;
    opacity: 0.4;
    fill: none;
  }
  .vector-label {
    transition: transform 0.35s ease;
    font:
      500 14px Inter,
      sans-serif;
    fill: #395a6a;
    text-anchor: middle;
    dominant-baseline: middle;
    paint-order: stroke;
    stroke: #ffffffad;
    stroke-width: 3;
    pointer-events: none;
  }
  .inset-note {
    font:
      10px Inter,
      sans-serif;
    letter-spacing: 1px;
    fill: #607d90;
    pointer-events: none;
  }
  .vector-site {
    transition: transform 0.35s ease;
    cursor: pointer;
    outline: none;
  }
  .site-hit {
    fill: transparent;
    stroke: transparent;
    stroke-width: 32;
    vector-effect: non-scaling-stroke;
    pointer-events: all;
  }
  .site-dot {
    fill: #007d8b;
    stroke: white;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .vector-site:hover .site-dot,
  .vector-site:focus-visible .site-dot {
    stroke: #143e50;
    stroke-width: 3;
    outline: none;
  }
  .vector-caption {
    position: relative;
    z-index: 3;
    font-size: 9px;
    line-height: 1.6;
    color: #607e92;
    background: #f6fbffe8;
    padding: 9px 12px;
    border: 1px solid #d7e5ed;
    border-radius: 8px;
  }
  .vector-caption strong {
    font:
      600 19px 'Barlow Condensed',
      sans-serif;
    color: #345c70;
    display: block;
  }
  .vector-caption span,
  .vector-caption small {
    display: block;
  }
  .vector-caption small {
    font-size: 8px;
  }
  .vector-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    bottom: auto;
    right: auto;
    transform: translate(-50%, -50%);
    margin: 0;
    width: min(360px, calc(100vw - 32px));
    max-height: calc(100dvh - 64px);
    overflow: auto;
    background: #fff;
    border: 1px solid #bbd6df;
    border-radius: 9px;
    padding: 15px;
    box-shadow: 0 8px 24px #28425322;
    font-size: 11px;
    line-height: 1.7;
    z-index: 4;
  }
  .vector-popup::backdrop {
    background: #173f5933;
    backdrop-filter: none;
  }
  .vector-popup p {
    padding-right: 25px;
    color: #31586c;
  }
  .close-site {
    position: absolute;
    right: 8px;
    top: 6px;
    font-size: 22px;
    background: transparent;
    color: #527487;
  }
  .open-site {
    padding: 9px 12px;
    border-radius: 5px;
    background: #315e73;
    color: white;
  }
  @media (max-width: 650px) {
    .vector-map {
      inset: 70px 5px 65px;
    }
    .vector-caption {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .vector-layer,
    .vector-state,
    .vector-label,
    .vector-site {
      transition: none;
    }
  }
  @media (max-width: 700px) {
    :global(.evidence-mode) .vector-map {
      inset: 134px 8px 110px;
    }
    :global(.evidence-mode) .vector-caption {
      display: none;
    }
  }
</style>
