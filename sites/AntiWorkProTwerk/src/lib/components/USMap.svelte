<script lang="ts">
  import MapInspector from './MapInspector.svelte';
  import {mapScopeFor,mappedStateCodes,type MapScope} from '$lib/civic/map-inspector';
  import { onMount, untrack } from 'svelte';
  import { base } from '$app/paths';
  import { createRepository } from '$lib/data/repository';
  import type { State } from '$lib/data/schema';
  import type { Map as LibreMap, Marker, GeoJSONSource, Popup, ExpressionSpecification } from 'maplibre-gl';
  import type { FeatureCollection } from 'geojson';
  import type { StateGeography } from '$lib/civic/vector-map';
  import { loadMapBackground, type BackgroundState } from '$lib/civic/map-background';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  let {
    release,
    states,
    selected,
    comparisonState = null,
    focusRequest,
    onselect,
    evidenceMode = false,
    layoutKey = '',
    evidenceCounts = {},
    showEvidencePoints = false,
    highlightSelection = true,
    selectionColor = '#ff1638',
    selectionOutlineColor = 'transparent',
    metricValues = {},
    evidenceUnit = 'sample receipts by represented state',
    recordSites = [],
    connectSites = false,
    onrecordselect,
    mapScope = mapScopeFor(undefined,true),
    inspectionKey = '',
  }: {
    release: string;
    states: State[];
    selected: State;
    comparisonState?: State | null;
    focusRequest: number;
    onselect: (code: string) => void;
    evidenceMode?: boolean;
    layoutKey?: string;
    evidenceCounts?: Record<string, number>;
    showEvidencePoints?: boolean;
    highlightSelection?: boolean;
    selectionColor?: string;
    selectionOutlineColor?: string;
    metricValues?: Record<string, { value: number; label: string; display?: string; color?: string }>;
    evidenceUnit?: string;
    recordSites?: { id: string; label: string; lng: number; lat: number }[];
    connectSites?: boolean;
    onrecordselect?: (id: string) => void;
    mapScope?: MapScope;
    inspectionKey?: string;
  } = $props();
  let container: HTMLDivElement;
  let rendererButton: HTMLButtonElement | undefined = $state();
  let map: LibreMap | undefined;
  let recordPopup: Popup | undefined;
  let ready = $state(false), failure = $state(''), mounted = $state(false);
  let mapLoadStage = $state<'graphics' | 'boundaries'>('graphics');
  let backgroundState = $state<BackgroundState>('idle'), backgroundRetry = $state(0);
  let backgroundRelease = '', statesRelease = '';
  let lightweight = $state(false), graphicsFailed = $state(false);
  const usingVector = $derived(lightweight || graphicsFailed);
  let vectorFocus = $state<string | null>(null), vectorError = $state(''), vectorLoading = $state(false), vectorRetry = $state(0);
  let geography = $state.raw<StateGeography | null>(null), geographyRelease = '';
  let VectorMap = $state<typeof import('./VectorMap.svelte').default | null>(null);
  let startWebGL: () => void = () => {};
  let mapGeneration = $state(0);
  let inspectorOpen = $state(false), previewCode = $state<string|null>(null), pointerCode = $state<string|null>(null);
  $effect(()=>{if(!inspectorOpen)pointerCode=null;});
  $effect(()=>{
    const code = comparisonState?.code ?? '__none__';
    if(mounted && container) container.dataset.comparisonState=code;
    if(ready && map && !usingVector) map.setFilter('comparison-outline',['==',['get','code'],code]);
  });
  $effect(()=>{
    const code=inspectorOpen&&previewCode?previewCode:'__none__';
    if(mounted&&container)container.dataset.previewState=code;
    if(ready&&map&&!usingVector)map.setFilter('preview-outline',['==',['get','code'],code]);
  });
  const repository = createRepository(base);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $effect(() => {
    const version = release, retry = backgroundRetry;
    if (!ready || !map || usingVector) return;
    if (untrack(() => backgroundState === 'ready' && backgroundRelease === version && !!map?.getSource('world'))) return;
    backgroundRelease = version;
    const loading = loadMapBackground(map, repository.geography(version, 'world'), reduceMotion(), state => backgroundState = state);
    return () => loading.stop();
  });
  function toggleRenderer() {
    lightweight = !usingVector;
    graphicsFailed = false;
    failure = '';
    inspectorOpen = false;
    try { localStorage.setItem('ltw.map-renderer.v1', lightweight ? 'vector' : 'webgl'); } catch { /* Device storage is optional. */ }
  }
  $effect(() => {
    if(!mounted) return;
    if(usingVector) untrack(() => map?.stop());
    else {
      const loaded = ready;
      untrack(() => { startWebGL(); if(loaded && map) { map.resize(); if(vectorFocus) fit(states.find(s => s.code === vectorFocus)); } });
    }
  });
  $effect(() => {
    const version = release, retry = vectorRetry;
    if(!mounted || !usingVector) return;
    if(untrack(() => geography && geographyRelease === version && VectorMap)) return;
    const controller = new AbortController();
    vectorLoading = true; vectorError = ''; geography = null;
    Promise.all([
      import('./VectorMap.svelte'), import('$lib/civic/vector-map'),
      fetch(repository.geography(version,'states'),{signal:controller.signal}).then(async response => {
        if(!response.ok) throw new Error('State boundaries unavailable');
        return response.json();
      }),
    ]).then(([component, helpers, data]) => {
      if(controller.signal.aborted) return;
      geography = helpers.parseStateGeography(data,states);
      geographyRelease = version;
      VectorMap = component.default;
    }).catch(() => { if(!controller.signal.aborted) vectorError = 'State boundaries could not load. Your record filters are unchanged.'; })
      .finally(() => { if(!controller.signal.aborted) vectorLoading = false; });
    return () => controller.abort();
  });
  $effect(() => {
    const sites = recordSites, connected = connectSites;
    if (!ready || !map || usingVector) return;
    recordPopup?.remove();
    (map.getSource('record-sites') as GeoJSONSource).setData({ type: 'FeatureCollection', features: sites.map((s) => ({ type: 'Feature', properties: {id:s.id,label:s.label}, geometry: { type: 'Point', coordinates: [s.lng,s.lat] } })) });
    const links: FeatureCollection = { type: 'FeatureCollection', features: connected && sites.length > 1 ? sites.slice(1).filter((s)=>s.lng!==sites[0].lng || s.lat!==sites[0].lat).map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[sites[0].lng,sites[0].lat],[s.lng,s.lat]] } })) : [] };
    (map.getSource('record-links') as GeoJSONSource).setData(links);
    container.dataset.recordSites = String(sites.length);
    container.dataset.recordLinks = String(links.features.length);
  });
  $effect(() => {
    const counts = evidenceCounts, enabled = showEvidencePoints, metrics = metricValues;
    if (!ready || !map || usingVector) return;
    const features = enabled ? states.filter((state) => counts[state.code] > 0 || metrics[state.code]).map((state) => ({
      type: 'Feature' as const,
      properties: { code: state.code, count: metrics[state.code] ? 1 : counts[state.code], color: metrics[state.code]?.color ?? '#0969ed' },
      geometry: { type: 'Point' as const, coordinates: state.center },
    })) : [];
    (map.getSource('evidence-points') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features });
    container.dataset.metricStates = String(Object.keys(metrics).length);
  });
  // Labels depend on selection; the point data and its worker work do not.
  $effect(() => { if (ready && map && !usingVector) updateEvidenceLabels(); });
  function updateEvidenceLabels() {
    if (!container || !map) return;
    const enabled = showEvidencePoints, counts = evidenceCounts, metrics = metricValues;
    const detailed = map.getZoom() >= 4.5;
    container.querySelectorAll<HTMLButtonElement>('.map-state-name').forEach((button) => {
      const code = button.dataset.state!;
      const active = enabled && highlightSelection && code === selected.code;
      button.textContent = enabled && (counts[code] || metrics[code]) && (detailed || active) ? `${code} · ${metrics[code] ? (metrics[code].display ?? `${metrics[code].value.toFixed(1)}%`) : counts[code]}` : code;
      button.classList.toggle('map-record-selected', active);
      button.classList.toggle('map-metric-selected', active && !!metrics[code]);
      button.setAttribute('aria-label', `Select ${states.find(s=>s.code===code)?.name ?? code}${comparisonState?.code === code ? '. Comparison state' : ''}`);
      button.title = metrics[code] ? metrics[code].label : enabled ? `${code}: ${counts[code] ?? 0} ${evidenceUnit}` : code;
    });
  }
  let lastFitCode: string | null = null;
  $effect(() => {
    void layoutKey;
    if (!ready || usingVector) return;
    const frame = requestAnimationFrame(() => untrack(() => fit(states.find(s => s.code === lastFitCode))));
    return () => cancelAnimationFrame(frame);
  });
  function fit(state?: State) {
    lastFitCode = state?.code ?? null;
    if(usingVector) { vectorFocus = state?.code ?? null; return; }
    if (!map) return;
    const padding = Math.min(state ? 65 : 30, Math.min(container.clientWidth, container.clientHeight) * 0.16);
    const atlas = evidenceMode && window.innerWidth > 900;
    const bounds = container.getBoundingClientRect();
    const label = document.querySelector('.evidence-map-label')?.getBoundingClientRect();
    const dock = document.querySelector('.evidence-workspace');
    const dockBounds = dock && getComputedStyle(dock).visibility !== 'hidden' ? dock.getBoundingClientRect() : null;
    const safePadding = atlas ? {
      top: Math.min(bounds.height * .35, Math.max(35, (label?.bottom ?? 160) - bounds.top + 18)),
      right: Math.min(bounds.width * .72, dockBounds ? bounds.right - dockBounds.left + 24 : 35),
      bottom: Math.min(110, bounds.height * .25),
      left: 35,
    } : padding;
    map.fitBounds(
      state
        ? [
            [state.bounds[0], state.bounds[1]],
            [state.bounds[2], state.bounds[3]],
          ]
        : [
            [-127, 24],
            [-66, 50],
          ],
      { padding: safePadding, maxZoom: state ? 7 : 4.2, duration: reduceMotion() ? 0 : 650 },
    );
  }
  $effect(() => {
    const coverage = mappedStateCodes(evidenceCounts,metricValues),
      enabled = evidenceMode;
    const colors = Object.entries(metricValues).filter(([,metric])=>metric.color && Number.isFinite(metric.value)).flatMap(([code,metric])=>[code,metric.color!]);
    if (ready && map && !usingVector) {
      map.setPaintProperty(
        'state-fill',
        'fill-color',
        enabled && colors.length >= 2 ? ['match',['get','code'],colors[0],colors[1],...colors.slice(2),'#e1ebf3'] as ExpressionSpecification : enabled
          ? [
              'case',
              ['in', ['get', 'code'], ['literal', coverage]],
              '#8dbaf3',
              '#e1ebf3',
            ]
          : '#d5e6f3',
      );
    }
  });
  $effect(() => {
    const code = highlightSelection ? selected.code : '__none__';
    const color = selectionColor;
    const outline = selectionOutlineColor;
    if(mounted && container)container.dataset.highlightedState=code;
    if (ready && map && !usingVector) {
      map.setFilter('selected-state', ['==', ['get', 'code'], code]);
      map.setPaintProperty('selected-state', 'fill-color', color);
      map.setFilter('selected-outline', ['==', ['get', 'code'], code]);
      map.setPaintProperty('selected-outline', 'line-color', outline);
    }
  });
  $effect(() => {
    const request = focusRequest;
    if ((usingVector || ready) && request > 0) untrack(() => fit(selected));
  });
  $effect(() => {
    const version = release;
    if (ready && map && !usingVector && statesRelease !== version) {
      (map.getSource('states') as GeoJSONSource)?.setData(repository.geography(version, 'states'));
      statesRelease = version;
    }
  });
  onMount(() => {
    let disposed = false;
    let starting = false;
    try { lightweight = localStorage.getItem('ltw.map-renderer.v1') === 'vector'; } catch { /* Device storage is optional. */ }
    const markers: Marker[] = [];
    let observer: ResizeObserver | undefined;
    const controller = new AbortController();
    async function start() {
      if(starting || map || disposed || usingVector) return;
      starting = true;
      try {
        const libre = await import('maplibre-gl');
        if (disposed || usingVector) return;
        mapLoadStage = 'boundaries';
        statesRelease = release;
        libre.setWorkerUrl(workerUrl);
        libre.setWorkerCount(2);
        map = new libre.Map({
          container,
          center: [-98, 38],
          zoom: 3.2,
          minZoom: 1.3,
          maxZoom: 10,
          renderWorldCopies: false,
          attributionControl: false,
          style: {
            version: 8,
            sources: {
              states: {
                type: 'geojson',
                data: repository.geography(release, 'states'),
                tolerance: 0.2,
              },
              'evidence-points': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
              'record-sites': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
              'record-links': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
            },
            layers: [
              { id: 'water', type: 'background', paint: { 'background-color': '#f2f9ff' } },
              {
                id: 'state-fill',
                type: 'fill',
                source: 'states',
                paint: { 'fill-color': '#d5e6f3', 'fill-opacity': 0.88 },
              },
              {
                id: 'selected-state',
                type: 'fill',
                source: 'states',
                filter: ['==', ['get', 'code'], selected.code],
                paint: { 'fill-color': selectionColor, 'fill-opacity': 0.94 },
              },
              {
                id: 'state-lines',
                type: 'line',
                source: 'states',
                paint: {
                  'line-color': '#fff',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.7, 7, 2],
                },
              },
              { id: 'selected-outline', type: 'line', source: 'states', filter: ['==', ['get', 'code'], selected.code], paint: { 'line-color': selectionOutlineColor, 'line-width': 2.3 } },
              { id: 'comparison-outline', type: 'line', source: 'states', filter: ['==', ['get', 'code'], comparisonState?.code ?? '__none__'], paint: { 'line-color':'#80668d','line-width':3,'line-dasharray':[3,2] } },
              { id: 'preview-outline', type: 'line', source: 'states', filter: ['==', ['get', 'code'], '__none__'], paint: { 'line-color':'#44677f','line-width':2.5,'line-dasharray':[2,2] } },
              { id: 'evidence-points', type: 'circle', source: 'evidence-points', paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'],
                  2, ['interpolate', ['linear'], ['get', 'count'], 1, 3, 100, 7],
                  7, ['interpolate', ['linear'], ['get', 'count'], 1, 7, 100, 16]],
                'circle-color': ['coalesce',['get','color'],'#0870ff'], 'circle-opacity': 0.2,
                'circle-stroke-color': '#397eda', 'circle-stroke-width': 1.5,
                'circle-radius-transition': { duration: reduceMotion() ? 0 : 350 },
              } },
              { id: 'record-links', type: 'line', source: 'record-links', paint: {'line-color':'#007d8b','line-opacity':0.25,'line-width':1.2,'line-dasharray':[2,3]} },
              { id: 'record-sites', type: 'circle', source: 'record-sites', paint: {'circle-color':'#007d8b','circle-radius':['interpolate',['linear'],['zoom'],2,3,7,7],'circle-stroke-color':'#fff','circle-stroke-width':1.2,'circle-opacity':0.9} },
            ],
          },
        });
        mapGeneration += 1;
        container.dataset.mapGeneration = String(mapGeneration);
        map.addControl(new libre.NavigationControl({ showCompass: false }), 'bottom-right');
        map.addControl(
          new libre.AttributionControl({
            compact: true,
            customAttribution: 'US Census / US Atlas · Natural Earth',
          }),
          'bottom-right',
        );
        map.addControl(new libre.ScaleControl({ unit: 'imperial' }), 'bottom-left');
        map.on('load', () => {
          if (disposed || !map) return;
          ready = true;
          if(!usingVector)fit();
          for (const state of states) {
            const button = document.createElement('button');
            button.className = 'map-state-name';
            button.dataset.state = state.code;
            button.textContent = state.code;
            button.tabIndex = -1;
            button.title = state.name;
            button.setAttribute('aria-label', `Select ${state.name}`);
            button.onclick = () => onselect(state.code);
            button.onmouseenter = () => {if(inspectorOpen)pointerCode=state.code;};
            button.onfocus = () => {if(inspectorOpen)pointerCode=state.code;};
            markers.push(new libre.Marker({ element: button }).setLngLat(state.center).addTo(map));
          }
          for (const [name, lng, lat] of [
            ['Dallas', -96.797, 32.7767],
            ['Austin', -97.7431, 30.2672],
            ['San Antonio', -98.4936, 29.4241],
            ['Houston', -95.3698, 29.7604],
          ] as const) {
            const label = document.createElement('span');
            label.className = 'map-place';
            label.textContent = name;
            markers.push(new libre.Marker({ element: label }).setLngLat([lng, lat]).addTo(map));
          }
          const updateZoom = () => {
            if (map) {
              updateEvidenceLabels();
              container.dataset.zoom = map.getZoom() >= 4.5 ? 'detail' : 'national';
              container.dataset.camera = JSON.stringify([
                map.getCenter().lng,
                map.getCenter().lat,
                map.getZoom(),
              ]);
              container.dataset.cameraPadding = JSON.stringify(map.getPadding());
            }
          };
          map.on('moveend', updateZoom);
          updateZoom();
        });
        map.on('click', 'state-fill', (e) => {
          if (map?.queryRenderedFeatures(e.point, { layers: ['record-sites'] }).length) return;
          const code = e.features?.[0]?.properties?.code;
          if (code) onselect(code);
        });
        map.on('click', 'record-sites', (e) => {
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== 'Point' || !map) return;
          // Worker-rendered geometry can briefly lag a filter change. Never open a stale ID.
          if (!recordSites.some(site => site.id === String(feature.properties?.id))) return;
          recordPopup?.remove();
          const content = document.createElement('div'), label = document.createElement('p');
          label.textContent = String(feature.properties?.label ?? 'Registry location');
          content.append(label);
          if (onrecordselect && feature.properties?.id) {
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = 'Open facility evidence';
            button.addEventListener('click', () => onrecordselect?.(String(feature.properties!.id)));
            content.append(button);
          }
          recordPopup = new libre.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(feature.geometry.coordinates as [number,number]).setDOMContent(content).addTo(map);
        });
        map.on('mouseenter', 'state-fill', () => {
          if (map) map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mousemove','state-fill',e=>{
          if(!inspectorOpen)return;
          const code=e.features?.[0]?.properties?.code;
          if(typeof code==='string'&&states.some(s=>s.code===code))pointerCode=code;
        });
        map.on('mouseleave', 'state-fill', () => {
          if (map) map.getCanvas().style.cursor = '';
        });
        map.on('error', (event) => {
          if ('sourceId' in event && event.sourceId === 'world') { backgroundState = 'error'; return; }
          failure = 'Some map detail could not load. State selection is still available.';
        });
        observer = new ResizeObserver(() => { if(!usingVector) { map?.resize(); if(evidenceMode && ready) fit(states.find(s => s.code === lastFitCode)); } });
        observer.observe(container);
      } catch {
        if (disposed) return;
        failure = 'Interactive graphics are unavailable. The lightweight map keeps state selection available.';
        try { map?.remove(); } catch { /* A partially initialized graphics context may already be gone. */ }
        container.replaceChildren();
        map = undefined; ready = false; graphicsFailed = true;
      } finally {
        starting = false;
      }
    }
    startWebGL = () => { void start(); };
    mounted = true;
    return () => {
      disposed = true;
      controller.abort();
      observer?.disconnect();
      markers.forEach((marker) => marker.remove());
      recordPopup?.remove();
      map?.remove();
      map = undefined;
    };
  });
</script>

<section class="map-stage live-map" aria-label="Interactive geographic map of the United States">
  <div class="maplibre-host" bind:this={container} hidden={usingVector} data-testid="us-map" data-background-state={backgroundState} data-renderer={usingVector ? 'vector' : 'webgl'}></div>
  {#if !usingVector && ready && backgroundState !== 'idle'}<p class="sr-only" role="status">{backgroundState === 'loading' ? 'U.S. states are ready. Surrounding geography is loading separately.' : backgroundState === 'error' ? 'U.S. states are ready. Surrounding geography is unavailable; open Inspect map to retry it.' : 'Surrounding geography loaded. State selection is unchanged.'}</p>{/if}
  {#if (!usingVector && !ready && !failure) || (usingVector && vectorLoading)}<div class="map-loading">
      <p role="status"><span class="loading-orbit" aria-hidden="true"></span><strong>{usingVector || mapLoadStage === 'boundaries' ? 'Loading state boundaries' : 'Starting the interactive map'}</strong></p>
      <small>{usingVector ? 'Real U.S. shapes, with Alaska and Hawaii insets.' : evidenceMode ? 'You can explore the records while the map loads.' : 'Representative profiles load separately from the map.'}</small>
      {#if !usingVector}<button disabled={!mounted} onclick={() => {toggleRenderer();rendererButton?.focus({preventScroll:true});}}>Switch to lightweight map <span aria-hidden="true">↗</span></button>{/if}
    </div>{/if}
  {#if usingVector && VectorMap && geography}<VectorMap {geography} {states} {selected} {comparisonState}
      focusCode={vectorFocus} previewCode={inspectorOpen ? previewCode : null} scope={mapScope}
      counts={evidenceCounts} metrics={metricValues} {highlightSelection} {selectionColor} {selectionOutlineColor}
      {recordSites} {connectSites} {onselect} {onrecordselect} onfocusview={code => vectorFocus=code} onpreview={code => {if(inspectorOpen)pointerCode=code;}} />{/if}
  {#if usingVector && vectorError}<div class="map-notice vector-error" role="alert">{vectorError}</div>{/if}
  {#if failure}<p class="map-notice" role="status">{failure}</p>{/if}
  <div class="map-toolbar">
    <MapInspector bind:open={inspectorOpen} bind:previewCode {pointerCode} {selected} {states} {comparisonState} scope={mapScope} counts={evidenceCounts} metrics={metricValues} contextKey={inspectionKey} lightweight={usingVector} {backgroundState} onretrybackground={() => backgroundRetry += 1} {onselect}/>
    <button bind:this={rendererButton} class="renderer-toggle" title="Use a lightweight U.S. overview with Alaska and Hawaii insets. Switch off for free pan and zoom." disabled={!mounted} aria-pressed={usingVector} onclick={toggleRenderer}>Lightweight map</button>
    <button class="map-overview" onclick={() => fit()} aria-label="Show contiguous United States">U.S. overview{#if !usingVector && ready && (backgroundState === 'loading' || backgroundState === 'error')}<small aria-hidden="true">{backgroundState === 'loading' ? 'Surroundings loading' : 'Background unavailable'}</small>{/if}</button
    ><button onclick={() => fit(states.find((s) => s.code === 'AK'))}>Alaska</button><button
      onclick={() => fit(states.find((s) => s.code === 'HI'))}>Hawaii</button
    ><button data-map-focus-current onclick={() => fit(selected)}>Focus {selected.code}</button>
    {#if usingVector && vectorError}<button class="retry-vector" aria-label="Retry state boundaries" onclick={() => vectorRetry+=1}>Retry map ↻</button>{/if}
  </div>
  <div class="map-caption">
    <span class="crosshair">+</span> United States <span>Explore a state. Follow the impact.</span>
  </div>
</section>

<style>
  .map-loading {top:53%;transform:translate(-50%,-50%);width:min(290px,calc(100% - 32px));white-space:normal;letter-spacing:0;z-index:3;background:#fbfdfff2;border:1px solid #d1e1ea;border-radius:12px;padding:14px;box-shadow:0 6px 22px #375d7310;}
  .map-loading p {display:flex;align-items:center;gap:9px;margin:0;color:#31576d;font-size:12px;}
  .loading-orbit {width:16px;height:16px;flex-shrink:0;border:2px solid #d1e2e9;border-top-color:#4d8294;border-radius:50%;animation:map-orbit 1s linear infinite;}
  .map-loading small {display:block;margin-top:7px;font-size:10px;line-height:1.6;color:#607e91;}
  .map-loading button {display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;min-height:36px;margin-top:9px;padding:7px 9px;background:#eaf3f7;border:1px solid #c6dce6;border-radius:6px;color:#315b70;font-size:10px;}
  @keyframes map-orbit {to {transform:rotate(360deg);}}
  @media(max-width:700px) {
    :global(.evidence-mode) .map-loading {top:calc(134px + (100% - 244px)/2);padding:9px 12px;}
    :global(.evidence-mode) .map-loading button {min-height:44px;margin-top:5px;}
    :global(.evidence-mode) .map-loading small {font-size:9px;margin-top:4px;}
  }
  @media(prefers-reduced-motion:reduce) {.loading-orbit {animation:none;}}
  .renderer-toggle[aria-pressed='true'] {background:#e4f0f3;border:1px solid #9cbecb;color:#254e64;}
  .map-overview small {display:block;font-size:7px;line-height:1.2;letter-spacing:0;white-space:normal;color:#607e91;margin-top:3px;}
  .maplibre-host[hidden] {display:none;}
  .vector-error {bottom:170px;left:20px;right:20px;z-index:4;border:1px solid #cadde6;border-radius:8px;}
  .retry-vector {font-weight:700;}
  @media(max-width:650px) {
    .map-toolbar {max-width:calc(100vw - 40px);flex-wrap:wrap;}
    :global(.evidence-mode) .map-toolbar {max-width:none;}
    .vector-error {width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);}
  }
</style>
