import React, { useEffect, useRef, useState } from 'react';
import { JurisdictionLevel, LocationContext } from '../types/civic';
import { GovernmentBuilding } from '../types/buildings';
import { getRecommendedZoom } from '../services/boundaryService';
import { loadGoogleMapsScript } from '../services/googleMapsService';
import { GoogleCivicMap } from './map/GoogleCivicMap';
import L from 'leaflet';
import { LocateFixed, Layers, Map, Sparkles } from 'lucide-react';

interface CivicMapContainerProps {
  location: LocationContext;
  activeLevel: JurisdictionLevel;
  boundaryGeoJSON: GeoJSON.FeatureCollection | GeoJSON.Feature;
  buildings: GovernmentBuilding[];
  selectedBuilding: GovernmentBuilding | null;
  onSelectBuilding: (building: GovernmentBuilding | null) => void;
}

export const CivicMapContainer: React.FC<CivicMapContainerProps> = ({
  location,
  activeLevel,
  boundaryGeoJSON,
  buildings,
  selectedBuilding,
  onSelectBuilding,
}) => {
  const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [mapEngine, setMapEngine] = useState<'google' | 'leaflet'>('google');
  const [googleLoaded, setGoogleLoaded] = useState<boolean>(false);
  const [googleLoadError, setGoogleLoadError] = useState<string | null>(null);

  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletGeojsonRef = useRef<L.GeoJSON | null>(null);
  const leafletMarkersRef = useRef<L.Marker[]>([]);
  const leafletUserPinRef = useRef<L.Marker | null>(null);

  // Load Google Maps API if key is present
  useEffect(() => {
    if (googleApiKey && googleApiKey.trim().length > 10 && !googleApiKey.includes('YourActualKey')) {
      loadGoogleMapsScript(googleApiKey)
        .then(() => {
          setGoogleLoaded(true);
          setMapEngine('google');
        })
        .catch((err) => {
          console.warn('Google Maps script load notice, falling back to Leaflet:', err);
          setGoogleLoadError('Google Maps API key error or offline. Using Leaflet.');
          setMapEngine('leaflet');
        });
    } else {
      setMapEngine('leaflet');
    }
  }, [googleApiKey]);

  // Leaflet Map Initialization
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !leafletContainerRef.current) return;

    if (!leafletMapRef.current) {
      const map = L.map(leafletContainerRef.current, {
        center: [location.lat, location.lng],
        zoom: getRecommendedZoom(activeLevel),
        zoomControl: false,
        attributionControl: false,
      });

      // CartoDB Positron neutral base tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);
      leafletMapRef.current = map;
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [mapEngine]);

  // Leaflet Pan/Zoom & User Pin
  useEffect(() => {
    if (mapEngine !== 'leaflet') return;
    const map = leafletMapRef.current;
    if (!map) return;

    const zoom = getRecommendedZoom(activeLevel);
    map.flyTo([location.lat, location.lng], zoom, { duration: 1.2 });

    if (leafletUserPinRef.current) {
      leafletUserPinRef.current.setLatLng([location.lat, location.lng]);
    } else {
      const customIcon = L.divIcon({
        className: 'custom-user-pin',
        html: `
          <div class="relative flex items-center justify-center w-6 h-6">
            <div class="absolute w-6 h-6 rounded-full bg-indigo-500/40 animate-ping"></div>
            <div class="relative w-3.5 h-3.5 rounded-full bg-indigo-600 border-2 border-white shadow-lg"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      leafletUserPinRef.current = L.marker([location.lat, location.lng], { icon: customIcon }).addTo(map);
    }
  }, [mapEngine, location.lat, location.lng, activeLevel]);

  // Leaflet Blocky Boundary Layer
  useEffect(() => {
    if (mapEngine !== 'leaflet') return;
    const map = leafletMapRef.current;
    if (!map || !boundaryGeoJSON) return;

    if (leafletGeojsonRef.current) {
      leafletGeojsonRef.current.remove();
    }

    const getColorForLevel = (lvl: JurisdictionLevel) => {
      switch (lvl) {
        case 'local':
          return { color: '#6366f1', fill: '#818cf8' }; // Indigo
        case 'county':
          return { color: '#a855f7', fill: '#c084fc' }; // Purple
        case 'state':
          return { color: '#0ea5e9', fill: '#38bdf8' }; // Sky Blue
        case 'federal':
          return { color: '#10b981', fill: '#34d399' }; // Emerald
      }
    };

    const styleColors = getColorForLevel(activeLevel);

    const layer = L.geoJSON(boundaryGeoJSON, {
      style: {
        color: styleColors.color,
        weight: 3.5,
        opacity: 0.95,
        dashArray: activeLevel === 'federal' ? '8, 8' : undefined,
        fillColor: styleColors.fill,
        fillOpacity: 0.14,
      },
      onEachFeature: (feature, l) => {
        const props = feature.properties || {};
        l.bindTooltip(
          `<div class="text-xs font-semibold text-slate-900">${props.label || props.name || 'Boundary'}</div>`,
          { sticky: true, className: 'leaflet-custom-tooltip' }
        );

        l.on({
          mouseover: (e) => {
            const target = e.target;
            target.setStyle({ fillOpacity: 0.28, weight: 4.5 });
          },
          mouseout: (e) => {
            layer.resetStyle(e.target);
          },
        });
      },
    }).addTo(map);

    leafletGeojsonRef.current = layer;
    setTimeout(() => map.invalidateSize(), 150);
  }, [mapEngine, boundaryGeoJSON, activeLevel]);

  // Leaflet 3D Board Game Piece Markers
  useEffect(() => {
    if (mapEngine !== 'leaflet') return;
    const map = leafletMapRef.current;
    if (!map) return;

    // Remove existing markers
    leafletMarkersRef.current.forEach((m) => m.remove());
    leafletMarkersRef.current = [];

    buildings.forEach((bldg) => {
      const isSelected = selectedBuilding?.id === bldg.id;
      const getSvgForType = (type: string) => {
        return `
          <div class="group relative flex flex-col items-center cursor-pointer transition-transform duration-300 ${
            isSelected ? '-translate-y-3 scale-110' : 'hover:-translate-y-2 hover:scale-105'
          }">
            <div class="w-12 h-12 flex items-center justify-center filter drop-shadow-[0_8px_6px_rgba(0,0,0,0.6)]">
              <svg viewBox="0 0 100 100" width="48" height="48">
                <ellipse cx="50" cy="80" rx="40" ry="12" fill="#0f172a" opacity="0.6" />
                <ellipse cx="50" cy="74" rx="34" ry="10" fill="#334155" stroke="#94a3b8" stroke-width="1.5" />
                ${
                  type === 'city_hall'
                    ? '<rect x="24" y="44" width="52" height="30" rx="2" fill="#d97706" stroke="#78350f" stroke-width="1.5"/><polygon points="20,44 50,26 80,44" fill="#fbbf24"/><rect x="42" y="14" width="16" height="14" fill="#d97706"/><circle cx="50" cy="21" r="4" fill="#ffffff"/>'
                    : type === 'courthouse'
                    ? '<rect x="22" y="46" width="56" height="28" rx="2" fill="#b45309" stroke="#78350f" stroke-width="1.5"/><polygon points="18,46 50,26 82,46" fill="#f97316"/><line x1="50" y1="32" x2="50" y2="40" stroke="#fef08a" stroke-width="2"/><line x1="42" y1="34" x2="58" y2="34" stroke="#fef08a" stroke-width="2"/>'
                    : type === 'state_capitol'
                    ? '<rect x="16" y="52" width="68" height="22" rx="2" fill="#4f46e5" stroke="#312e81" stroke-width="1.5"/><rect x="36" y="36" width="28" height="18" fill="#4f46e5"/><path d="M 33 36 C 33 18, 67 18, 67 36 Z" fill="#818cf8"/><line x1="50" y1="18" x2="50" y2="6" stroke="#fbbf24" stroke-width="2"/>'
                    : type === 'federal_building'
                    ? '<rect x="22" y="40" width="56" height="34" rx="2" fill="#0369a1" stroke="#082f49" stroke-width="1.5"/><rect x="18" y="34" width="64" height="8" rx="1" fill="#38bdf8"/><circle cx="50" cy="24" r="8" fill="#bae6fd"/>'
                    : type === 'public_safety'
                    ? '<polygon points="26,74 74,74 80,46 20,46" fill="#be123c" stroke="#4c0519" stroke-width="1.5"/><rect x="38" y="20" width="24" height="26" fill="#be123c"/><polygon points="34,22 50,6 66,22" fill="#fb7185"/><circle cx="50" cy="58" r="4" fill="#fbbf24"/>'
                    : '<rect x="22" y="46" width="56" height="28" rx="2" fill="#047857" stroke="#022c22" stroke-width="1.5"/><polygon points="20,46 50,30 80,46" fill="#34d399"/><path d="M 42 22 Q 50 18 58 22 L 58 14 Q 50 10 42 14 Z" fill="#ffffff"/>'
                }
              </svg>
            </div>
            <div class="mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-tight whitespace-nowrap border shadow-lg ${
              isSelected
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-900/90 text-slate-200 border-slate-700/80 group-hover:bg-slate-800'
            }">
              ${bldg.name.split(' ')[0]} ${bldg.typeLabel.split(' ')[0]}
            </div>
          </div>
        `;
      };

      const markerIcon = L.divIcon({
        className: 'leaflet-game-piece-marker',
        html: getSvgForType(bldg.type),
        iconSize: [60, 60],
        iconAnchor: [30, 50],
      });

      const marker = L.marker([bldg.lat, bldg.lng], { icon: markerIcon }).addTo(map);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectBuilding(bldg);
      });

      leafletMarkersRef.current.push(marker);
    });
  }, [mapEngine, buildings, selectedBuilding]);

  const handleRecenter = () => {
    if (mapEngine === 'leaflet' && leafletMapRef.current) {
      leafletMapRef.current.flyTo([location.lat, location.lng], getRecommendedZoom(activeLevel));
    }
  };

  return (
    <div className="relative w-full h-full min-h-[300px] bg-slate-950 overflow-hidden select-none">
      {/* 1. Active Map Engine Canvas */}
      {mapEngine === 'google' && googleLoaded ? (
        <GoogleCivicMap
          location={location}
          activeLevel={activeLevel}
          boundaryGeoJSON={boundaryGeoJSON}
          buildings={buildings}
          selectedBuilding={selectedBuilding}
          onSelectBuilding={onSelectBuilding}
        />
      ) : (
        <div ref={leafletContainerRef} className="w-full h-full z-0" />
      )}

      {/* 2. Top-Left Overlay: Active Layer Badge & Engine Switcher */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-xl max-w-xs pointer-events-auto space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {activeLevel} Blocky Grid Line
              </span>
            </div>

            {/* Map Engine Toggle Switch */}
            {googleLoaded && (
              <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px] font-mono">
                <button
                  onClick={() => setMapEngine('google')}
                  className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                    mapEngine === 'google'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Google
                </button>
                <button
                  onClick={() => setMapEngine('leaflet')}
                  className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                    mapEngine === 'leaflet'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  OSM
                </button>
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-300 font-medium">
            {activeLevel === 'local' && `Municipal Ward Grid: ${location.city}`}
            {activeLevel === 'county' && `Square County Border: ${location.county}`}
            {activeLevel === 'state' && `Square State Line: State of ${location.state}`}
            {activeLevel === 'federal' && `Congressional Grid Corridor: ${location.stateCode}-${location.congressionalDistrict}`}
          </div>
        </div>

        {/* 3D Board Game Piece Legend Bar */}
        <div className="bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-xl p-2.5 shadow-xl hidden sm:flex items-center gap-3 text-[11px] text-slate-300 pointer-events-auto">
          <span className="font-mono text-indigo-400 font-bold flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> 3D Game Pieces ({buildings.length}):
          </span>
          <div className="flex items-center gap-2">
            {buildings.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelectBuilding(b)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-all ${
                  selectedBuilding?.id === b.id
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
                title={b.name}
              >
                <span>{b.typeLabel.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Recenter Action */}
      <div className="absolute bottom-6 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={handleRecenter}
          className="p-2.5 bg-slate-900/95 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-white rounded-xl shadow-xl transition-all"
          title="Recenter Map"
        >
          <LocateFixed className="w-4 h-4 text-indigo-400" />
        </button>
      </div>

      {/* Map Tile Credit Notice */}
      <div className="absolute bottom-1 left-2 z-10 text-[9px] text-slate-500 pointer-events-none bg-slate-950/70 px-1.5 py-0.5 rounded">
        {mapEngine === 'google'
          ? 'Google Maps Platform · Minimal Street Style'
          : '© OpenStreetMap contributors, CartoDB Positron'}
      </div>
    </div>
  );
};
