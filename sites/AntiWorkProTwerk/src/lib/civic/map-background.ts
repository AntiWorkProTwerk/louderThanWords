import type { Map, MapEventType } from 'maplibre-gl';

export type BackgroundState = 'idle' | 'loading' | 'ready' | 'error';
type Host = Pick<
  Map,
  | 'getLayer'
  | 'getSource'
  | 'removeLayer'
  | 'removeSource'
  | 'addSource'
  | 'addLayer'
  | 'on'
  | 'off'
  | 'isSourceLoaded'
  | 'setPaintProperty'
>;

/** The original world geometry is decorative context, not a state-readiness gate.
 * URL loading keeps parsing in MapLibre's worker. Removing an unfinished source
 * cancels its worker request when the user switches to the lightweight renderer.
 */
export function loadMapBackground(
  map: Host,
  url: string,
  reducedMotion: boolean,
  onstate: (state: BackgroundState) => void,
) {
  let active = true,
    phase: BackgroundState = 'loading';
  const remove = () => {
    for (const id of ['countries', 'land']) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource('world')) map.removeSource('world');
  };
  const publish = (next: BackgroundState) => {
    if (!active || phase === next) return;
    phase = next;
    onstate(next);
  };
  const ondata = (event: MapEventType['sourcedata']) => {
    if (
      !active ||
      phase !== 'loading' ||
      event.sourceId !== 'world' ||
      !map.getSource('world') ||
      !map.isSourceLoaded('world')
    )
      return;
    map.setPaintProperty('land', 'fill-opacity', 1);
    map.setPaintProperty('countries', 'line-opacity', 1);
    publish('ready');
  };
  const onerror = (event: MapEventType['error']) => {
    if ('sourceId' in event && event.sourceId === 'world') publish('error');
  };
  remove();
  onstate('loading');
  map.on('sourcedata', ondata);
  map.on('error', onerror);
  try {
    map.addSource('world', { type: 'geojson', data: url, tolerance: 0.5 });
    map.addLayer(
      {
        id: 'land',
        type: 'fill',
        source: 'world',
        paint: {
          'fill-color': '#e5eff7',
          'fill-opacity': 0,
          'fill-opacity-transition': { duration: reducedMotion ? 0 : 300 },
        },
      },
      'state-fill',
    );
    map.addLayer(
      {
        id: 'countries',
        type: 'line',
        source: 'world',
        paint: {
          'line-color': '#c9dce9',
          'line-width': 0.7,
          'line-opacity': 0,
          'line-opacity-transition': { duration: reducedMotion ? 0 : 300 },
        },
      },
      'state-fill',
    );
  } catch {
    publish('error');
  }
  return {
    stop() {
      if (!active) return;
      active = false;
      map.off('sourcedata', ondata);
      map.off('error', onerror);
      // A completed background remains on the retained WebGL map.
      if (phase !== 'ready') {
        remove();
        onstate('idle');
      }
    },
  };
}
