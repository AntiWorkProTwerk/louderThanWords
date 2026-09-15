<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { base } from '$app/paths';
  import { createRepository } from '$lib/data/repository';
  import type { State } from '$lib/data/schema';
  import type { Map as LibreMap, Marker, GeoJSONSource } from 'maplibre-gl';
  import type { FeatureCollection, Geometry, Position } from 'geojson';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  let {
    release,
    states,
    selected,
    focusRequest,
    onselect,
  }: {
    release: string;
    states: State[];
    selected: State;
    focusRequest: number;
    onselect: (code: string) => void;
  } = $props();
  let container: HTMLDivElement;
  let map: LibreMap | undefined;
  let ready = $state(false),
    failure = $state(''),
    fallback = $state<FeatureCollection | null>(null);
  let mapGeneration = $state(0);
  const repository = createRepository(base);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fit(state?: State) {
    if (!map) return;
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
      { padding: state ? 65 : 30, maxZoom: state ? 7 : 4.2, duration: reduceMotion() ? 0 : 650 },
    );
  }
  $effect(() => {
    const code = selected.code;
    if (ready && map) map.setFilter('selected-state', ['==', ['get', 'code'], code]);
  });
  $effect(() => {
    const request = focusRequest;
    if (ready && request > 0) untrack(() => fit(selected));
  });
  $effect(() => {
    const version = release;
    if (ready && map) {
      (map.getSource('states') as GeoJSONSource)?.setData(repository.geography(version, 'states'));
    }
  });
  function fallbackPath(geometry: Geometry): string {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return '';
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons
      .flatMap((p) => p.map((r) => `M${r.map(([x, y]: Position) => `${x},${-y}`).join('L')}Z`))
      .join('');
  }
  onMount(() => {
    let disposed = false;
    const markers: Marker[] = [];
    let observer: ResizeObserver | undefined;
    const controller = new AbortController();
    async function start() {
      try {
        const libre = await import('maplibre-gl');
        if (disposed) return;
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
              world: {
                type: 'geojson',
                data: repository.geography(release, 'world'),
                tolerance: 0.5,
              },
              states: {
                type: 'geojson',
                data: repository.geography(release, 'states'),
                tolerance: 0.2,
              },
            },
            layers: [
              { id: 'water', type: 'background', paint: { 'background-color': '#f2f9ff' } },
              { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': '#e5eff7' } },
              {
                id: 'countries',
                type: 'line',
                source: 'world',
                paint: { 'line-color': '#c9dce9', 'line-width': 0.7 },
              },
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
                paint: { 'fill-color': '#ff1638', 'fill-opacity': 0.94 },
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
          fit();
          for (const state of states) {
            const button = document.createElement('button');
            button.className = 'map-state-name';
            button.textContent = state.code;
            button.tabIndex = -1;
            button.title = state.name;
            button.setAttribute('aria-label', `Select ${state.name}`);
            button.onclick = () => onselect(state.code);
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
              container.dataset.zoom = map.getZoom() >= 4.5 ? 'detail' : 'national';
              container.dataset.camera = JSON.stringify([
                map.getCenter().lng,
                map.getCenter().lat,
                map.getZoom(),
              ]);
            }
          };
          map.on('moveend', updateZoom);
          updateZoom();
        });
        map.on('click', 'state-fill', (e) => {
          const code = e.features?.[0]?.properties?.code;
          if (code) onselect(code);
        });
        map.on('mouseenter', 'state-fill', () => {
          if (map) map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'state-fill', () => {
          if (map) map.getCanvas().style.cursor = '';
        });
        map.on('error', () => {
          failure = 'Some map detail could not load. State selection is still available.';
        });
        observer = new ResizeObserver(() => map?.resize());
        observer.observe(container);
      } catch {
        if (disposed) return;
        failure = 'Interactive graphics are unavailable. Showing a geographic overview.';
        try {
          const response = await fetch(repository.geography(release, 'states'), {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error();
          fallback = await response.json();
        } catch {
          failure = 'The map could not load. Use the state selector to explore every delegation.';
        }
      }
    }
    start();
    return () => {
      disposed = true;
      controller.abort();
      observer?.disconnect();
      markers.forEach((marker) => marker.remove());
      map?.remove();
      map = undefined;
    };
  });
</script>

<section class="map-stage live-map" aria-label="Interactive geographic map of the United States">
  <div class="maplibre-host" bind:this={container} data-testid="us-map"></div>
  {#if !ready && !failure}<div class="map-loading" role="status">
      <span></span>Loading the United States
    </div>{/if}
  {#if fallback}<svg
      class="fallback-map"
      viewBox="-180 -73 116 56"
      aria-label="United States geographic overview"
      >{#each fallback.features as feature}<path
          d={fallbackPath(feature.geometry)}
          fill={feature.properties?.code === selected.code ? '#ff1638' : '#d5e6f3'}
          stroke="white"
          stroke-width=".2"
        />{/each}</svg
    >{/if}
  {#if failure}<p class="map-notice" role="status">{failure}</p>{/if}
  <div class="map-toolbar">
    <button onclick={() => fit()} aria-label="Show contiguous United States">U.S. overview</button
    ><button onclick={() => fit(states.find((s) => s.code === 'AK'))}>Alaska</button><button
      onclick={() => fit(states.find((s) => s.code === 'HI'))}>Hawaii</button
    ><button onclick={() => fit(selected)}>Focus {selected.code}</button>
  </div>
  <div class="map-caption">
    <span class="crosshair">+</span> United States <span>Explore a state. Follow the impact.</span>
  </div>
</section>
