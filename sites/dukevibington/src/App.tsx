import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { geoAlbersUsa, geoAlbers, geoMercator, geoPath } from 'd3-geo';
import {
  fetchStatesGeoJson,
  fetchCountiesGeoJson,
  fetchCountyCitiesGeoJson,
  getStateFipsFromCode,
  US_STATES_FIPS,
  StateMetadata,
} from './services/vectorMapService';
import { Loader2, ChevronRight, ArrowLeft } from 'lucide-react';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 960, height: 600 });
  const [statesGeoJson, setStatesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [countiesGeoJson, setCountiesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [citiesGeoJson, setCitiesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [activeCountyFeature, setActiveCountyFeature] = useState<GeoJSON.Feature | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCitiesLoading, setIsCitiesLoading] = useState<boolean>(false);

  // Navigation State
  const [viewMode, setViewMode] = useState<'national' | 'state' | 'county'>('national');
  const [activeStateFips, setActiveStateFips] = useState<string | null>(null);
  const [selectedStateName, setSelectedStateName] = useState<string | null>(null);
  const [activeCountyId, setActiveCountyId] = useState<string | null>(null);
  const [selectedCountyName, setSelectedCountyName] = useState<string | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);

  // Hover state
  const [hoveredFeature, setHoveredFeature] = useState<{
    title: string;
    subtitle?: string;
    x: number;
    y: number;
  } | null>(null);

  // Resize listener
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({
          width: Math.max(clientWidth, 320),
          height: Math.max(clientHeight, 300),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Fetch National States & Prefetch Counties GeoJSON for instant transitions
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      fetchStatesGeoJson(),
      fetchCountiesGeoJson(), // Preload full counties TopoJSON into memory cache
    ])
      .then(([states]) => {
        if (isMounted) {
          setStatesGeoJson(states);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load map data:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // When activeStateFips changes in state mode, load the state's counties
  useEffect(() => {
    if ((viewMode === 'state' || viewMode === 'county') && activeStateFips) {
      fetchCountiesGeoJson(activeStateFips).then((filteredCounties) => {
        setCountiesGeoJson(filteredCounties);
      });
    } else {
      setCountiesGeoJson(null);
    }
  }, [viewMode, activeStateFips]);

  // Handle double clicking into a state
  const handleStateDoubleClick = useCallback((fips: string, stateName: string) => {
    setActiveStateFips(fips);
    setSelectedStateName(stateName);
    setSelectedCountyName(null);
    setSelectedCityName(null);
    setViewMode('state');
    setHoveredFeature(null);
  }, []);

  // Handle double clicking into a county
  const handleCountyDoubleClick = useCallback((countyFeature: GeoJSON.Feature, countyName: string) => {
    setActiveCountyFeature(countyFeature);
    setActiveCountyId(String(countyFeature.id));
    setSelectedCountyName(countyName);
    setSelectedCityName(null);
    setViewMode('county');
    setHoveredFeature(null);
    setIsCitiesLoading(true);

    fetchCountyCitiesGeoJson(countyFeature, activeStateFips || undefined)
      .then((cities) => {
        setCitiesGeoJson(cities);
        setIsCitiesLoading(false);
      })
      .catch((err) => {
        console.warn('Failed to load city boundaries:', err);
        setIsCitiesLoading(false);
      });
  }, [activeStateFips]);

  // Handle zooming back to state level
  const handleZoomOutToState = useCallback(() => {
    setViewMode('state');
    setSelectedCityName(null);
    setCitiesGeoJson(null);
    setActiveCountyFeature(null);
    setHoveredFeature(null);
  }, []);

  // Handle zooming back out to national US map
  const handleZoomOutToNational = useCallback(() => {
    setViewMode('national');
    setSelectedCountyName(null);
    setSelectedCityName(null);
    setCitiesGeoJson(null);
    setActiveCountyFeature(null);
    setHoveredFeature(null);
  }, []);

  // Current State Metadata
  const currentStateMeta: StateMetadata | null = useMemo(() => {
    if (!activeStateFips) return null;
    return US_STATES_FIPS[activeStateFips] || null;
  }, [activeStateFips]);

  // Projection and SVG paths calculation
  const { renderedPaths, countyOutlinePath } = useMemo(() => {
    const { width, height } = dimensions;
    const padding = Math.min(width, height) * 0.05;

    if (viewMode === 'national') {
      if (!statesGeoJson || !statesGeoJson.features) return { renderedPaths: [], countyOutlinePath: null };

      const projection = geoAlbersUsa().fitExtent(
        [
          [padding, padding],
          [width - padding, height - padding],
        ],
        statesGeoJson as any
      );

      const pathGenerator = geoPath().projection(projection);

      const paths = statesGeoJson.features
        .map((feature: any) => {
          const d = pathGenerator(feature);
          if (!d) return null;

          const fips = String(feature.id).padStart(2, '0');
          const meta = US_STATES_FIPS[fips] || {
            name: feature.properties?.name || 'State',
            code: feature.properties?.code || '',
          };

          const isSelected = selectedStateName === meta.name;

          return {
            id: fips,
            name: meta.name,
            code: meta.code,
            d,
            isSelected,
            onClick: () => {
              setSelectedStateName(meta.name);
              setActiveStateFips(fips);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              handleStateDoubleClick(fips, meta.name);
            },
          };
        })
        .filter(Boolean);

      return { renderedPaths: paths, countyOutlinePath: null };
    } else if (viewMode === 'state') {
      // viewMode === 'state' -> Render state's county lines
      if (!countiesGeoJson || !countiesGeoJson.features || countiesGeoJson.features.length === 0) {
        return { renderedPaths: [], countyOutlinePath: null };
      }

      let projection;
      if (activeStateFips === '02') {
        // Alaska: Rotated Albers projection wraps the Aleutians seamlessly without splitting across the world edge
        projection = geoAlbers()
          .parallels([55, 65])
          .rotate([154, 0])
          .fitExtent(
            [
              [padding, padding],
              [width - padding, height - padding],
            ],
            countiesGeoJson as any
          );
      } else if (activeStateFips === '15') {
        // Hawaii
        projection = geoAlbers()
          .parallels([8, 18])
          .rotate([157, 0])
          .fitExtent(
            [
              [padding, padding],
              [width - padding, height - padding],
            ],
            countiesGeoJson as any
          );
      } else {
        projection = geoMercator().fitExtent(
          [
            [padding, padding],
            [width - padding, height - padding],
          ],
          countiesGeoJson as any
        );
      }

      const pathGenerator = geoPath().projection(projection);

      const paths = countiesGeoJson.features
        .map((feature: any) => {
          const d = pathGenerator(feature);
          if (!d) return null;

          const countyName = feature.properties?.name || `County ${feature.id}`;
          const isSelected = selectedCountyName === countyName;

          return {
            id: feature.id,
            name: countyName,
            code: currentStateMeta?.code || '',
            d,
            isSelected,
            feature,
            onClick: () => {
              setSelectedCountyName(countyName);
              setActiveCountyFeature(feature);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              handleCountyDoubleClick(feature, countyName);
            },
          };
        })
        .filter(Boolean);

      return { renderedPaths: paths, countyOutlinePath: null };
    } else {
      // viewMode === 'county' -> Render city / municipal boundaries inside the county
      if (!activeCountyFeature) {
        return { renderedPaths: [], countyOutlinePath: null };
      }

      const projection = geoMercator().fitExtent(
        [
          [padding * 1.5, padding * 1.5],
          [width - padding * 1.5, height - padding * 1.5],
        ],
        activeCountyFeature as any
      );

      const pathGenerator = geoPath().projection(projection);
      const countyOutline = pathGenerator(activeCountyFeature);

      const cityFeatures = citiesGeoJson?.features || [];

      const paths = cityFeatures
        .map((feature: any, idx: number) => {
          const d = pathGenerator(feature);
          if (!d) return null;

          const cityName = feature.properties?.name || `City ${idx + 1}`;
          const isSelected = selectedCityName === cityName;

          return {
            id: feature.id || `city-${idx}`,
            name: cityName,
            code: currentStateMeta?.code || '',
            d,
            isSelected,
            onClick: () => {
              setSelectedCityName(cityName);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
            },
          };
        })
        .filter(Boolean);

      return { renderedPaths: paths, countyOutlinePath: countyOutline };
    }
  }, [
    dimensions,
    viewMode,
    statesGeoJson,
    countiesGeoJson,
    citiesGeoJson,
    activeCountyFeature,
    activeStateFips,
    selectedStateName,
    selectedCountyName,
    selectedCityName,
    currentStateMeta,
    handleStateDoubleClick,
    handleCountyDoubleClick,
  ]);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-mono select-none">
      {/* Minimal Header with Breadcrumb Navigation */}
      <header className="bg-zinc-950 border-b border-zinc-850 px-6 py-3 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-[#0090d8]"></div>
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold tracking-wider uppercase">
            <button
              onClick={handleZoomOutToNational}
              className={`hover:text-amber-400 transition-colors cursor-pointer ${
                viewMode === 'national' ? 'text-zinc-100' : 'text-zinc-400'
              }`}
            >
              UNITED STATES
            </button>

            {(viewMode === 'state' || viewMode === 'county') && currentStateMeta && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                <button
                  onClick={handleZoomOutToState}
                  className={`hover:text-amber-400 transition-colors cursor-pointer ${
                    viewMode === 'state' ? 'text-amber-400 font-extrabold' : 'text-zinc-400'
                  }`}
                >
                  {currentStateMeta.name.toUpperCase()}
                </button>
              </>
            )}

            {viewMode === 'county' && selectedCountyName && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                <span className="text-amber-400 font-extrabold">
                  {selectedCountyName.toUpperCase()} ({renderedPaths.length} CITIES/PLACES)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action / Back Button */}
        <div className="flex items-center gap-3">
          {viewMode === 'county' ? (
            <button
              onClick={handleZoomOutToState}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-800 text-amber-400 hover:text-amber-300 border border-zinc-800 transition-colors uppercase font-bold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>BACK TO COUNTIES</span>
            </button>
          ) : viewMode === 'state' ? (
            <button
              onClick={handleZoomOutToNational}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-800 text-amber-400 hover:text-amber-300 border border-zinc-800 transition-colors uppercase font-bold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>BACK TO US MAP</span>
            </button>
          ) : selectedStateName ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 uppercase">SELECTED:</span>
              <span className="text-xs font-bold text-amber-400 uppercase px-2 py-0.5 bg-zinc-900 border border-amber-400/40">
                {selectedStateName}
              </span>
              <button
                onClick={() => {
                  const fips = getStateFipsFromCode(selectedStateName);
                  if (fips) handleStateDoubleClick(fips, selectedStateName);
                }}
                className="text-[11px] text-zinc-300 hover:text-amber-400 uppercase px-2 py-0.5 bg-zinc-900 border border-zinc-800 hover:border-amber-400/50"
              >
                VIEW COUNTIES
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Main Map Canvas */}
      <main
        ref={containerRef}
        onDoubleClick={
          viewMode === 'county'
            ? handleZoomOutToState
            : viewMode === 'state'
            ? handleZoomOutToNational
            : undefined
        }
        className="flex-1 relative w-full h-full flex items-center justify-center p-4 bg-zinc-950 overflow-hidden"
      >
        {isLoading || isCitiesLoading ? (
          <div className="text-center space-y-3 text-zinc-400">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-[#0090d8]" />
            <div className="text-xs tracking-widest uppercase">
              {isCitiesLoading ? '// LOADING CITY BOUNDARIES...' : '// LOADING VECTOR MAP DATA...'}
            </div>
          </div>
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            className="w-full h-full"
          >
            <defs>
              {viewMode === 'county' && countyOutlinePath && (
                <clipPath id="county-boundary-clip">
                  <path d={countyOutlinePath} />
                </clipPath>
              )}
            </defs>

            {viewMode === 'county' ? (
              <g>
                {/* Municipal / City Subdivisions (clipped cleanly inside county outline) */}
                <g clipPath="url(#county-boundary-clip)">
                  {renderedPaths.map((item: any) => {
                    if (!item || !item.d) return null;

                    const isSelected = selectedCityName === item.name;
                    const fill = isSelected ? '#f59e0b' : '#0090d8';

                    return (
                      <path
                        key={item.id}
                        d={item.d}
                        fill={fill}
                        stroke="#ffffff"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                        className="transition-colors duration-150 cursor-pointer hover:fill-amber-400 active:fill-amber-500"
                        onMouseEnter={(e) => {
                          const rect = containerRef.current?.getBoundingClientRect();
                          setHoveredFeature({
                            title: item.name,
                            subtitle: `MUNICIPAL DISTRICT · ${selectedCountyName?.toUpperCase()}`,
                            x: e.clientX - (rect?.left || 0),
                            y: e.clientY - (rect?.top || 0),
                          });
                        }}
                        onMouseMove={(e) => {
                          const rect = containerRef.current?.getBoundingClientRect();
                          setHoveredFeature((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  x: e.clientX - (rect?.left || 0),
                                  y: e.clientY - (rect?.top || 0),
                                }
                              : null
                          );
                        }}
                        onMouseLeave={() => setHoveredFeature(null)}
                        onClick={item.onClick}
                        onDoubleClick={item.onDoubleClick}
                      />
                    );
                  })}
                </g>

                {/* 3. Outer County Border Outline */}
                {countyOutlinePath && (
                  <path
                    d={countyOutlinePath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    className="pointer-events-none"
                  />
                )}
              </g>
            ) : (
              /* National (US) or State County View */
              <g>
                {renderedPaths.map((item: any) => {
                  if (!item || !item.d) return null;

                  const isSelected = item.isSelected;
                  const fill = isSelected ? '#f59e0b' : '#0090d8';

                  return (
                    <path
                      key={item.id}
                      d={item.d}
                      fill={fill}
                      stroke="#ffffff"
                      strokeWidth={viewMode === 'national' ? '1.2' : '1.4'}
                      strokeLinejoin="round"
                      className="transition-colors duration-150 cursor-pointer hover:fill-amber-400 active:fill-amber-500"
                      onMouseEnter={(e) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        setHoveredFeature({
                          title: item.name,
                          subtitle:
                            viewMode === 'national'
                              ? `DOUBLE CLICK TO VIEW COUNTIES`
                              : `DOUBLE CLICK TO VIEW CITIES`,
                          x: e.clientX - (rect?.left || 0),
                          y: e.clientY - (rect?.top || 0),
                        });
                      }}
                      onMouseMove={(e) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        setHoveredFeature((prev) =>
                          prev
                            ? {
                                ...prev,
                                x: e.clientX - (rect?.left || 0),
                                y: e.clientY - (rect?.top || 0),
                              }
                            : null
                        );
                      }}
                      onMouseLeave={() => setHoveredFeature(null)}
                      onClick={item.onClick}
                      onDoubleClick={item.onDoubleClick}
                    />
                  );
                })}
              </g>
            )}
          </svg>
        )}

        {/* Context Hint */}
        <div className="absolute bottom-4 left-4 z-10 bg-zinc-950/90 border border-zinc-800 px-3 py-2 text-[11px] font-mono pointer-events-none">
          <div className="text-zinc-400 font-bold uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            {viewMode === 'national' && 'UNITED STATES · DOUBLE-CLICK ANY STATE TO EXPAND COUNTIES'}
            {viewMode === 'state' &&
              `STATE OF ${currentStateMeta?.name.toUpperCase()} · ${renderedPaths.length} COUNTIES (DOUBLE-CLICK ANY COUNTY TO VIEW CITIES)`}
            {viewMode === 'county' &&
              `${selectedCountyName?.toUpperCase()} · ${renderedPaths.length} CITIES/PLACES (DOUBLE-CLICK BACKGROUND TO ZOOM OUT)`}
          </div>
        </div>

        {/* Floating Tooltip */}
        {hoveredFeature && (
          <div
            className="absolute z-30 pointer-events-none bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-zinc-100 shadow-2xl transform -translate-x-1/2 -translate-y-full mb-2 font-mono text-xs"
            style={{ left: hoveredFeature.x, top: hoveredFeature.y - 12 }}
          >
            <div className="font-bold text-amber-400 uppercase">{hoveredFeature.title}</div>
            {hoveredFeature.subtitle && (
              <div className="text-[10px] text-zinc-400 uppercase mt-0.5">{hoveredFeature.subtitle}</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;



