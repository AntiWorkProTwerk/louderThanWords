import React, { useEffect, useRef } from 'react';
import { JurisdictionLevel, LocationContext } from '../../types/civic';
import { GovernmentBuilding } from '../../types/buildings';
import { MINIMAL_CIVIC_MAP_STYLE } from '../../services/googleMapsService';
import { getRecommendedZoom } from '../../services/boundaryService';
import ReactDOM from 'react-dom/client';
import { BoardGamePiece } from '../pieces/BoardGamePiece';

interface GoogleCivicMapProps {
  location: LocationContext;
  activeLevel: JurisdictionLevel;
  boundaryGeoJSON: GeoJSON.FeatureCollection | GeoJSON.Feature;
  buildings: GovernmentBuilding[];
  selectedBuilding: GovernmentBuilding | null;
  onSelectBuilding: (building: GovernmentBuilding) => void;
}

export const GoogleCivicMap: React.FC<GoogleCivicMapProps> = ({
  location,
  activeLevel,
  boundaryGeoJSON,
  buildings,
  selectedBuilding,
  onSelectBuilding,
}) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const markersRef = useRef<Array<{ overlay: any; cleanup: () => void }>>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);

  // 1. Initialize Google Map
  useEffect(() => {
    if (!mapDivRef.current || mapInstanceRef.current) return;

    const map = new google.maps.Map(mapDivRef.current, {
      center: { lat: location.lat, lng: location.lng },
      zoom: getRecommendedZoom(activeLevel),
      styles: MINIMAL_CIVIC_MAP_STYLE,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      backgroundColor: '#0b1120',
    });

    mapInstanceRef.current = map;
  }, []);

  // 2. Pan/Zoom on Location or Active Level Change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.panTo({ lat: location.lat, lng: location.lng });
    map.setZoom(getRecommendedZoom(activeLevel));

    // Update or Create User Pin
    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition({ lat: location.lat, lng: location.lng });
    } else {
      userMarkerRef.current = new google.maps.Marker({
        position: { lat: location.lat, lng: location.lng },
        map,
        title: `Your Location: ${location.city}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#6366f1',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
    }
  }, [location.lat, location.lng, activeLevel]);

  // 3. Render Blocky Square Boundary Polygon
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !boundaryGeoJSON) return;

    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }

    const getColorForLevel = (lvl: JurisdictionLevel) => {
      switch (lvl) {
        case 'local':
          return { stroke: '#6366f1', fill: '#818cf8' }; // Indigo
        case 'county':
          return { stroke: '#a855f7', fill: '#c084fc' }; // Purple
        case 'state':
          return { stroke: '#0ea5e9', fill: '#38bdf8' }; // Sky Blue
        case 'federal':
          return { stroke: '#10b981', fill: '#34d399' }; // Emerald
      }
    };

    const colors = getColorForLevel(activeLevel);

    // Extract coordinates from FeatureCollection
    const feature = (boundaryGeoJSON as any).features?.[0];
    if (feature && feature.geometry && feature.geometry.coordinates) {
      const coords = feature.geometry.coordinates[0].map((coord: [number, number]) => ({
        lat: coord[1],
        lng: coord[0],
      }));

      const polygon = new google.maps.Polygon({
        paths: coords,
        strokeColor: colors.stroke,
        strokeOpacity: 0.95,
        strokeWeight: 3.5,
        fillColor: colors.fill,
        fillOpacity: 0.14,
        map,
      });

      polygon.addListener('mouseover', () => {
        polygon.setOptions({ fillOpacity: 0.28, strokeWeight: 4.5 });
      });

      polygon.addListener('mouseout', () => {
        polygon.setOptions({ fillOpacity: 0.14, strokeWeight: 3.5 });
      });

      polygonRef.current = polygon;
    }
  }, [boundaryGeoJSON, activeLevel]);

  // 4. Render 3D Board Game Piece Markers on Google Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean up old markers
    markersRef.current.forEach((m) => m.cleanup());
    markersRef.current = [];

    // Custom HTML Overlay for each Board Game Building Piece
    buildings.forEach((building) => {
      class BoardGameOverlay extends google.maps.OverlayView {
        private container: HTMLDivElement;
        private root: ReactDOM.Root | null = null;

        constructor() {
          super();
          this.container = document.createElement('div');
          this.container.style.position = 'absolute';
          this.container.style.cursor = 'pointer';
          this.container.style.transform = 'translate(-50%, -100%)';
          this.container.style.zIndex = building.id === selectedBuilding?.id ? '999' : '100';
        }

        onAdd() {
          const panes = this.getPanes();
          panes?.overlayMouseTarget.appendChild(this.container);

          this.root = ReactDOM.createRoot(this.container);
          this.renderReact();

          this.container.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelectBuilding(building);
          });
        }

        renderReact() {
          if (this.root) {
            const isSelected = selectedBuilding?.id === building.id;
            this.root.render(
              <div className="group relative flex flex-col items-center">
                <BoardGamePiece
                  type={building.type}
                  size={52}
                  isSelected={isSelected}
                />

                <div
                  className={`mt-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-tight whitespace-nowrap border shadow-lg transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-400 scale-105'
                      : 'bg-slate-900/90 text-slate-200 border-slate-700/80 group-hover:bg-slate-800'
                  }`}
                >
                  {building.name.split(' ')[0]} {building.typeLabel.split(' ')[0]}
                </div>
              </div>
            );
          }
        }

        draw() {
          const projection = this.getProjection();
          if (!projection) return;
          const pos = projection.fromLatLngToDivPixel(
            new google.maps.LatLng(building.lat, building.lng)
          );
          if (pos) {
            this.container.style.left = `${pos.x}px`;
            this.container.style.top = `${pos.y}px`;
          }
        }

        onRemove() {
          if (this.root) {
            this.root.unmount();
            this.root = null;
          }
          if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
          }
        }
      }

      const overlay = new BoardGameOverlay();
      overlay.setMap(map);

      markersRef.current.push({
        overlay,
        cleanup: () => overlay.setMap(null),
      });
    });
  }, [buildings, selectedBuilding]);

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden">
      <div ref={mapDivRef} className="w-full h-full" />
    </div>
  );
};
