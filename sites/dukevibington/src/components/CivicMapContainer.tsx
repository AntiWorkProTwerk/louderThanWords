import React, { useEffect, useRef } from 'react';
import { JurisdictionLevel, LocationContext } from '../types/civic';
import { getRecommendedZoom } from '../services/boundaryService';
import L from 'leaflet';
import { Maximize2, LocateFixed, Eye } from 'lucide-react';

interface CivicMapContainerProps {
  location: LocationContext;
  activeLevel: JurisdictionLevel;
  boundaryGeoJSON: GeoJSON.FeatureCollection | GeoJSON.Feature;
}

export const CivicMapContainer: React.FC<CivicMapContainerProps> = ({
  location,
  activeLevel,
  boundaryGeoJSON,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [location.lat, location.lng],
        zoom: getRecommendedZoom(activeLevel),
        zoomControl: false,
        attributionControl: false,
      });

      // Add CartoDB Positron (clean neutral non-partisan base tiles)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      // Add clean zoom control to top-right
      L.control
        .zoom({
          position: 'topright',
        })
        .addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      // Map cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Center, Marker & Zoom on Location / Level change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const zoom = getRecommendedZoom(activeLevel);

    // Smooth fly to coordinate
    map.flyTo([location.lat, location.lng], zoom, {
      duration: 1.2,
      easeLinearity: 0.25,
    });

    // Update or Create Location Marker with pulsating halo
    if (markerRef.current) {
      markerRef.current.setLatLng([location.lat, location.lng]);
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

      markerRef.current = L.marker([location.lat, location.lng], { icon: customIcon }).addTo(map);
    }

    markerRef.current.bindPopup(`
      <div class="p-2 font-sans">
        <strong class="text-xs font-bold text-slate-900 block">${location.city}, ${location.stateCode}</strong>
        <span class="text-[11px] text-slate-600">${location.county} · Dist ${location.congressionalDistrict}</span>
      </div>
    `);
  }, [location.lat, location.lng, activeLevel]);

  // Update GeoJSON Boundary Polygon
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !boundaryGeoJSON) return;

    // Remove existing GeoJSON layer
    if (geojsonLayerRef.current) {
      geojsonLayerRef.current.remove();
    }

    const getColorForLevel = (lvl: JurisdictionLevel) => {
      switch (lvl) {
        case 'local':
          return { color: '#6366f1', fill: '#818cf8' }; // Indigo
        case 'county':
          return { color: '#a855f7', fill: '#c084fc' }; // Purple
        case 'state':
          return { color: '#0ea5e9', fill: '#38bdf8' }; // Sky / Blue
        case 'federal':
          return { color: '#10b981', fill: '#34d399' }; // Emerald
      }
    };

    const styleColors = getColorForLevel(activeLevel);

    const layer = L.geoJSON(boundaryGeoJSON, {
      style: {
        color: styleColors.color,
        weight: 2.5,
        opacity: 0.9,
        dashArray: activeLevel === 'federal' ? '6, 6' : undefined,
        fillColor: styleColors.fill,
        fillOpacity: 0.12,
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
            target.setStyle({
              fillOpacity: 0.25,
              weight: 3.5,
            });
          },
          mouseout: (e) => {
            layer.resetStyle(e.target);
          },
        });
      },
    }).addTo(map);

    geojsonLayerRef.current = layer;

    // Invalidate map size to handle responsive drawer toggles
    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }, [boundaryGeoJSON, activeLevel]);

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([location.lat, location.lng], getRecommendedZoom(activeLevel));
    }
  };

  return (
    <div className="relative w-full h-full min-h-[300px] bg-slate-950 overflow-hidden select-none">
      {/* Map DOM target */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Map Overlay Badge & Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-xl max-w-xs pointer-events-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              {activeLevel} Boundary Layer
            </span>
          </div>
          <div className="text-[11px] text-slate-300 font-medium">
            {activeLevel === 'local' && `Municipal Ward / City Limits: ${location.city}`}
            {activeLevel === 'county' && `County Borders: ${location.county}`}
            {activeLevel === 'state' && `State Lines: State of ${location.state}`}
            {activeLevel === 'federal' && `U.S. Congressional District: ${location.stateCode}-${location.congressionalDistrict}`}
          </div>
        </div>
      </div>

      {/* Recenter & Fit Action Button */}
      <div className="absolute bottom-6 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={handleRecenter}
          className="p-2.5 bg-slate-900/95 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-white rounded-xl shadow-xl transition-all"
          title="Recenter Map on Target"
        >
          <LocateFixed className="w-4 h-4 text-indigo-400" />
        </button>
      </div>

      {/* Map Tile Credit Notice */}
      <div className="absolute bottom-1 left-2 z-10 text-[9px] text-slate-600 pointer-events-none bg-slate-950/70 px-1.5 py-0.5 rounded">
        © OpenStreetMap contributors, CartoDB Positron
      </div>
    </div>
  );
};
