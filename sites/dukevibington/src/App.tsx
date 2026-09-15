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
import {
  STATE_CREEP_DATA,
  getEditorialCreepColor,
  formatCompactUSD,
  StateCreepAggregate,
} from './services/stateCreepData';
import { ContractCreepPanel, JurisdictionGeoProps } from './components/ContractCreepPanel';
import { Loader2, ChevronRight, ArrowLeft, TrendingUp } from 'lucide-react';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 960, height: 600 });
  const [statesGeoJson, setStatesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [countiesGeoJson, setCountiesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [citiesGeoJson, setCitiesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [activeCountyFeature, setActiveCountyFeature] = useState<GeoJSON.Feature | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCitiesLoading, setIsCitiesLoading] = useState<boolean>(false);
  const [isDossierOpen, setIsDossierOpen] = useState<boolean>(true);

  // Navigation State
  const [viewMode, setViewMode] = useState<'national' | 'state' | 'county'>('national');
  const [activeStateFips, setActiveStateFips] = useState<string | null>('17');
  const [selectedStateName, setSelectedStateName] = useState<string | null>('Illinois');
  const [activeCountyId, setActiveCountyId] = useState<string | null>(null);
  const [selectedCountyName, setSelectedCountyName] = useState<string | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);

  // High-Density Hover State Tooltip
  const [hoveredFeature, setHoveredFeature] = useState<{
    title: string;
    subtitle?: string;
    initialObligation?: number;
    currentObligation?: number;
    dollarCreep?: number;
    percentCreep?: number;
    category?: string;
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
  }, [isDossierOpen]);

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
    setActiveCountyId(null);
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
    setActiveCountyId(null);
    setSelectedCountyName(null);
    setHoveredFeature(null);
  }, []);

  // Handle zooming back out to national US map
  const handleZoomOutToNational = useCallback(() => {
    setViewMode('national');
    setActiveStateFips(null);
    setSelectedStateName(null);
    setActiveCountyId(null);
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

  // Dynamic Geo Props for Contract Creep Dossier
  const currentGeoProps: JurisdictionGeoProps = useMemo(() => {
    const rawStateCode =
      currentStateMeta?.code ||
      (selectedStateName && getStateFipsFromCode(selectedStateName)
        ? US_STATES_FIPS[getStateFipsFromCode(selectedStateName)!]?.code
        : 'IL') ||
      'IL';

    const rawStateName = currentStateMeta?.name || selectedStateName || undefined;
    const rawCountyFips = activeCountyId ? activeCountyId.slice(2, 5) : undefined;
    const cleanCityName = selectedCityName
      ? selectedCityName.replace(/^(City of |Village of |Town of |Borough of )/i, '').trim()
      : undefined;

    // 1. Municipal / City level (when viewMode is county and a city is active)
    if (viewMode === 'county' && cleanCityName) {
      return {
        level: 'local',
        stateCode: rawStateCode,
        stateName: rawStateName,
        city: cleanCityName,
      };
    }

    // 2. County level (when viewMode is county OR when actively focused on a county in state view)
    if ((viewMode === 'county' || (viewMode === 'state' && activeCountyId)) && rawCountyFips) {
      return {
        level: 'county',
        stateCode: rawStateCode,
        stateName: rawStateName,
        countyFips: rawCountyFips,
        countyName: selectedCountyName || undefined,
      };
    }

    // 3. State level (when in national map view or general state view)
    return {
      level: 'state',
      stateCode: rawStateCode,
      stateName: rawStateName,
    };
  }, [currentStateMeta, selectedStateName, activeCountyId, selectedCountyName, selectedCityName, viewMode]);

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
          const creepData: StateCreepAggregate = STATE_CREEP_DATA[fips] || {
            fips,
            stateCode: meta.code,
            stateName: meta.name,
            initialObligation: 1000000000,
            currentObligation: 1200000000,
            dollarCreep: 200000000,
            percentCreep: 20.0,
            activeContractsCount: 500,
          };

          const colorConfig = getEditorialCreepColor(creepData.percentCreep, isSelected);

          return {
            id: fips,
            name: meta.name,
            code: meta.code,
            d,
            isSelected,
            creepData,
            fill: colorConfig.fill,
            hoverFill: colorConfig.hoverFill,
            category: colorConfig.category,
            onClick: () => {
              setSelectedStateName(meta.name);
              setActiveStateFips(fips);
              setActiveCountyId(null);
              setSelectedCountyName(null);
              setSelectedCityName(null);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              handleStateDoubleClick(fips, meta.name);
            },
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          if (a.isSelected && !b.isSelected) return 1;
          if (!a.isSelected && b.isSelected) return -1;
          return 0;
        });

      return { renderedPaths: paths, countyOutlinePath: null };
    } else if (viewMode === 'state') {
      // viewMode === 'state' -> Render state's county lines
      if (!countiesGeoJson || !countiesGeoJson.features || countiesGeoJson.features.length === 0) {
        return { renderedPaths: [], countyOutlinePath: null };
      }

      let projection;
      if (activeStateFips === '02') {
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
      const stateBaseCreep = activeStateFips ? STATE_CREEP_DATA[activeStateFips]?.percentCreep ?? 30 : 30;

      const paths = countiesGeoJson.features
        .map((feature: any, idx: number) => {
          const d = pathGenerator(feature);
          if (!d) return null;

          const countyName = feature.properties?.name || `County ${feature.id}`;
          const isSelected = selectedCountyName === countyName;

          // Deterministic county creep variation around state baseline
          const hashVal = (Number(feature.id) * 37 + idx * 13) % 100;
          const countyPercentCreep = Math.max(0, Math.round(stateBaseCreep * (0.5 + (hashVal / 100))));
          const countyInitial = 50000000 + (hashVal * 5000000);
          const countyDollar = Math.round((countyInitial * countyPercentCreep) / 100);
          const countyCurrent = countyInitial + countyDollar;

          const colorConfig = getEditorialCreepColor(countyPercentCreep, isSelected);

          return {
            id: feature.id,
            name: countyName,
            code: currentStateMeta?.code || '',
            d,
            isSelected,
            feature,
            fill: colorConfig.fill,
            hoverFill: colorConfig.hoverFill,
            category: colorConfig.category,
            creepData: {
              fips: String(feature.id),
              stateCode: currentStateMeta?.code || '',
              stateName: countyName,
              initialObligation: countyInitial,
              currentObligation: countyCurrent,
              dollarCreep: countyDollar,
              percentCreep: countyPercentCreep,
              activeContractsCount: 15 + (hashVal % 40),
            },
            onClick: () => {
              setSelectedCountyName(countyName);
              setActiveCountyId(String(feature.id));
              setActiveCountyFeature(feature);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              handleCountyDoubleClick(feature, countyName);
            },
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          if (a.isSelected && !b.isSelected) return 1;
          if (!a.isSelected && b.isSelected) return -1;
          return 0;
        });

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

          const hashVal = ((idx + 1) * 43) % 100;
          const cityPercentCreep = Math.round(15 + (hashVal * 0.6));
          const cityInitial = 12000000 + (hashVal * 800000);
          const cityDollar = Math.round((cityInitial * cityPercentCreep) / 100);
          const cityCurrent = cityInitial + cityDollar;

          const colorConfig = getEditorialCreepColor(cityPercentCreep, isSelected);

          return {
            id: feature.id || `city-${idx}`,
            name: cityName,
            code: currentStateMeta?.code || '',
            d,
            isSelected,
            fill: colorConfig.fill,
            hoverFill: colorConfig.hoverFill,
            category: colorConfig.category,
            creepData: {
              fips: `city-${idx}`,
              stateCode: currentStateMeta?.code || '',
              stateName: cityName,
              initialObligation: cityInitial,
              currentObligation: cityCurrent,
              dollarCreep: cityDollar,
              percentCreep: cityPercentCreep,
              activeContractsCount: 5 + (hashVal % 15),
            },
            onClick: () => {
              setSelectedCityName(cityName);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
            },
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          if (a.isSelected && !b.isSelected) return 1;
          if (!a.isSelected && b.isSelected) return -1;
          return 0;
        });

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
    <div className="flex flex-col h-screen w-screen bg-[#fafaf9] text-stone-900 overflow-hidden font-sans select-none">
      {/* 1. Header Bar with Breadcrumb Navigation & Dossier Toggle */}
      <header className="bg-white border-b border-stone-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0 z-20 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-900"></div>
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
            <button
              onClick={handleZoomOutToNational}
              className={`hover:text-blue-900 transition-colors cursor-pointer font-serif ${
                viewMode === 'national' ? 'text-stone-900 font-bold' : 'text-stone-500'
              }`}
            >
              United States
            </button>

            {(viewMode === 'state' || viewMode === 'county') && currentStateMeta && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                <button
                  onClick={handleZoomOutToState}
                  className={`hover:text-blue-900 transition-colors cursor-pointer font-serif ${
                    viewMode === 'state' ? 'text-blue-900 font-bold' : 'text-stone-500'
                  }`}
                >
                  {currentStateMeta.name}
                </button>
              </>
            )}

            {viewMode === 'county' && selectedCountyName && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                <button
                  onClick={() => setSelectedCityName(null)}
                  className={`hover:text-blue-900 transition-colors cursor-pointer font-serif ${
                    !selectedCityName ? 'text-blue-900 font-bold' : 'text-stone-500'
                  }`}
                >
                  {selectedCountyName}
                </button>
                {selectedCityName && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-blue-900 font-serif font-bold">
                      {selectedCityName}
                    </span>
                  </>
                )}
                <span className="font-sans text-xs text-stone-500 font-normal">
                  ({renderedPaths.length} jurisdictions)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action / Back Button & Dossier Inspector Toggle */}
        <div className="flex items-center gap-3">
          {viewMode === 'county' ? (
            <button
              onClick={handleZoomOutToState}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded transition-colors font-medium cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Counties</span>
            </button>
          ) : viewMode === 'state' ? (
            <button
              onClick={handleZoomOutToNational}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded transition-colors font-medium cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to US Map</span>
            </button>
          ) : null}

          {/* Dossier Toggle Button */}
          <button
            onClick={() => setIsDossierOpen((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded border transition-colors cursor-pointer ${
              isDossierOpen
                ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                : 'bg-white text-stone-700 hover:bg-stone-50 border-stone-300'
            }`}
          >
            <TrendingUp className={`w-3.5 h-3.5 ${isDossierOpen ? 'text-rose-300' : 'text-rose-600'}`} />
            <span className="hidden sm:inline">Contract Creep Dossier:</span>
            <span className="font-semibold">{isDossierOpen ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </header>

      {/* 2. Main Workspace: Map Canvas + Contract Creep Inspector Sidebar */}
      <div className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* Map Canvas */}
        <main
          ref={containerRef}
          onDoubleClick={
            viewMode === 'county'
              ? handleZoomOutToState
              : viewMode === 'state'
              ? handleZoomOutToNational
              : undefined
          }
          className="flex-1 relative h-full flex items-center justify-center p-4 bg-[#fafaf9] overflow-hidden"
        >
          {isLoading || isCitiesLoading ? (
            <div className="text-center space-y-3 text-stone-500">
              <Loader2 className="w-7 h-7 mx-auto animate-spin text-blue-900" />
              <div className="text-xs font-medium tracking-wide">
                {isCitiesLoading ? 'Loading municipal boundaries...' : 'Loading geographic data...'}
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

                      return (
                        <path
                          key={item.id}
                          d={item.d}
                          fill={item.fill}
                          stroke="#ffffff"
                          strokeWidth={item.isSelected ? '2.5' : '1'}
                          strokeLinejoin="round"
                          className="transition-colors duration-150 cursor-pointer hover:opacity-90"
                          onMouseEnter={(e) => {
                            const rect = containerRef.current?.getBoundingClientRect();
                            setHoveredFeature({
                              title: item.name,
                              subtitle: `Municipal District · ${selectedCountyName}`,
                              initialObligation: item.creepData?.initialObligation,
                              currentObligation: item.creepData?.currentObligation,
                              dollarCreep: item.creepData?.dollarCreep,
                              percentCreep: item.creepData?.percentCreep,
                              category: item.category,
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

                  {/* Outer County Border Outline */}
                  {countyOutlinePath && (
                    <path
                      d={countyOutlinePath}
                      fill="none"
                      stroke="#334155"
                      strokeWidth="2"
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

                    return (
                      <path
                        key={item.id}
                        d={item.d}
                        fill={item.fill}
                        stroke="#ffffff"
                        strokeWidth={item.isSelected ? '2.5' : '1'}
                        strokeLinejoin="round"
                        className="transition-colors duration-150 cursor-pointer hover:opacity-90"
                        onMouseEnter={(e) => {
                          const rect = containerRef.current?.getBoundingClientRect();
                          setHoveredFeature({
                            title: item.name,
                            subtitle:
                              viewMode === 'national'
                                ? `State Aggregate · ${item.creepData?.activeContractsCount || 0} Contracts`
                                : `County Jurisdiction · ${currentStateMeta?.name}`,
                            initialObligation: item.creepData?.initialObligation,
                            currentObligation: item.creepData?.currentObligation,
                            dollarCreep: item.creepData?.dollarCreep,
                            percentCreep: item.creepData?.percentCreep,
                            category: item.category,
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

          {/* Editorial CartoColors Map Legend */}
          <div className="absolute bottom-4 left-4 z-10 bg-white border border-stone-200 shadow-sm px-3.5 py-2.5 rounded-sm text-xs font-sans pointer-events-auto">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 mb-1.5 flex items-center justify-between gap-4">
              <span>Contract Creep Severity</span>
              <span className="font-mono text-[9px] text-stone-400">CartoColors</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col items-center">
                <div className="w-7 h-2.5 bg-[#E5E7EB] border border-stone-300 rounded-xs" title="0% Fixed Price / Baseline" />
                <span className="text-[9px] text-stone-500 font-mono mt-0.5">0%</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-7 h-2.5 bg-[#FED7AA] border border-orange-300 rounded-xs" title="1% – 15% Standard" />
                <span className="text-[9px] text-stone-500 font-mono mt-0.5">1-15%</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-7 h-2.5 bg-[#FB923C] border border-orange-500 rounded-xs" title="16% – 35% Elevated" />
                <span className="text-[9px] text-stone-500 font-mono mt-0.5">16-35%</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-7 h-2.5 bg-[#DC2626] border border-red-700 rounded-xs" title="36% – 75% Severe" />
                <span className="text-[9px] text-stone-500 font-mono mt-0.5">36-75%</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-7 h-2.5 bg-[#7F1D1D] border border-red-950 rounded-xs" title="75%+ Critical" />
                <span className="text-[9px] text-stone-500 font-mono mt-0.5">75%+</span>
              </div>
            </div>
          </div>

          {/* High-Density Editorial Floating Hover Tooltip (ProPublica/NYT Style) */}
          {hoveredFeature && (
            <div
              className="absolute z-50 pointer-events-none bg-white border border-stone-200 shadow-lg rounded-sm p-4 w-64 transform -translate-x-1/2 -translate-y-full mb-3"
              style={{ left: hoveredFeature.x, top: hoveredFeature.y - 10 }}
            >
              <div className="font-serif text-lg font-bold text-stone-800 border-b border-stone-100 pb-2 mb-3">
                {hoveredFeature.title}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-sans">
                    TOTAL INITIAL OBLIGATION
                  </div>
                  <div className="font-mono text-sm text-stone-800">
                    {hoveredFeature.initialObligation !== undefined
                      ? formatCompactUSD(hoveredFeature.initialObligation)
                      : 'N/A'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-sans">
                    CURRENT TOTAL
                  </div>
                  <div className="font-mono text-sm text-stone-800">
                    {hoveredFeature.currentObligation !== undefined
                      ? formatCompactUSD(hoveredFeature.currentObligation)
                      : 'N/A'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-sans">
                    DOLLAR CREEP
                  </div>
                  <div className="font-mono text-sm text-red-700 font-bold">
                    {hoveredFeature.dollarCreep !== undefined
                      ? `+${formatCompactUSD(hoveredFeature.dollarCreep)}`
                      : 'N/A'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-sans">
                    PERCENT CREEP
                  </div>
                  <div className="font-mono text-sm">
                    <span className="bg-red-50 text-red-700 px-1 py-0.5 inline-block font-bold">
                      {hoveredFeature.percentCreep !== undefined
                        ? `+${hoveredFeature.percentCreep.toFixed(1)}%`
                        : '0.0%'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 3. Contract Creep Dossier Inspector Drawer */}
        {isDossierOpen && (
          <aside className="w-full md:w-[420px] lg:w-[460px] h-full flex-shrink-0 z-20 border-l border-stone-200 bg-white transition-all duration-200">
            <ContractCreepPanel {...currentGeoProps} />
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;



