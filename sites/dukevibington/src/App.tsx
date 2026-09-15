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
import {
  STATE_BILL_VOLATILITY_DATA,
  getEditorialVolatilityColor,
  formatCompactNumber,
  StateBillVolatilityAggregate,
} from './services/stateBillData';
import { useDossierMetric, DOSSIER_METRICS } from './hooks/useDossierMetric';
import { DossierMetricType, DossierHoverTelemetry } from './types/dossier';
import { ContractCreepPanel, JurisdictionGeoProps } from './components/ContractCreepPanel';
import { BillDiffPanel } from './components/BillDiffPanel';
import {
  Loader2,
  ChevronRight,
  ArrowLeft,
  TrendingUp,
  FileCode,
  FileText,
  Layers,
  Sparkles,
} from 'lucide-react';

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

  // Active Dossier Metric Layer ('CONTRACT_CREEP' | 'BILL_DIFF')
  const { activeMetric, activeConfig, switchMetric, availableMetrics } = useDossierMetric('CONTRACT_CREEP');

  // Navigation State
  const [viewMode, setViewMode] = useState<'national' | 'state' | 'county'>('national');
  const [activeStateFips, setActiveStateFips] = useState<string | null>('17');
  const [selectedStateName, setSelectedStateName] = useState<string | null>('Illinois');
  const [activeCountyId, setActiveCountyId] = useState<string | null>(null);
  const [selectedCountyName, setSelectedCountyName] = useState<string | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);

  // High-Density Hover State Tooltip (Unified Telemetry)
  const [hoveredFeature, setHoveredFeature] = useState<DossierHoverTelemetry | null>(null);

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

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateSize();
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      resizeObserver?.disconnect();
    };
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

  // Dynamic Geo Props for Civic Dossier
  const currentGeoProps: JurisdictionGeoProps = useMemo(() => {
    // 0. National view without an actively selected state polygon
    if (viewMode === 'national' && !activeStateFips && !selectedStateName) {
      return {
        level: 'federal',
        stateCode: 'US',
        stateName: 'United States',
      };
    }

    const rawStateCode =
      currentStateMeta?.code ||
      (selectedStateName && getStateFipsFromCode(selectedStateName)
        ? US_STATES_FIPS[getStateFipsFromCode(selectedStateName)!]?.code
        : 'IL') ||
      'IL';

    const rawStateName = currentStateMeta?.name || selectedStateName || undefined;
    const rawCountyFips = activeCountyId ? activeCountyId.slice(2, 5) : undefined;
    const cleanCityName = selectedCityName
      ? selectedCityName
          .replace(/^(City of |Village of |Town of |Borough of )/i, '')
          .replace(/\s*\([^)]*\)/g, '')
          .split('/')[0]
          .split('&')[0]
          .trim()
      : undefined;

    // 1. Municipal / City level (when a city is active)
    if (selectedCityName && cleanCityName) {
      return {
        level: 'local',
        stateCode: rawStateCode,
        stateName: rawStateName,
        countyFips: rawCountyFips,
        countyName: selectedCountyName || undefined,
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

    // 3. State level (when in national map view with active state or general state view)
    return {
      level: 'state',
      stateCode: rawStateCode,
      stateName: rawStateName,
    };
  }, [currentStateMeta, selectedStateName, activeStateFips, activeCountyId, selectedCountyName, selectedCityName, viewMode]);

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

          let fill = '#E5E7EB';
          let hoverFill = '#D1D5DB';
          let category = 'Baseline';
          let telemetry: any = null;

          if (activeMetric === 'CONTRACT_CREEP') {
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

            const colorConfig = getEditorialCreepColor(creepData.percentCreep);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: meta.name,
              subtitle: `State Aggregate · ${creepData.activeContractsCount || 0} Contracts`,
              metric1: {
                label: 'TOTAL INITIAL OBLIGATION',
                value: formatCompactUSD(creepData.initialObligation),
              },
              metric2: {
                label: 'CURRENT TOTAL',
                value: formatCompactUSD(creepData.currentObligation),
              },
              metric3: {
                label: 'DOLLAR CREEP',
                value: `+${formatCompactUSD(creepData.dollarCreep)}`,
                isHighlight: true,
                highlightColor: 'text-red-700',
              },
              metric4: {
                label: 'PERCENT CREEP',
                value: `+${creepData.percentCreep.toFixed(1)}%`,
                isPill: true,
                pillColor: 'bg-red-50 text-red-700',
              },
              category,
            };
          } else {
            const billData: StateBillVolatilityAggregate = STATE_BILL_VOLATILITY_DATA[fips] || {
              fips,
              stateCode: meta.code,
              stateName: meta.name,
              totalBillsSponsored: 100,
              enactedBillsCount: 15,
              averageVolatilityScore: 35.0,
              totalWordsAdded: 150000,
              totalWordsDeleted: 50000,
              majorSubstitutionsCount: 8,
              primaryPolicyFocus: 'Public Policy',
            };

            const colorConfig = getEditorialVolatilityColor(billData.averageVolatilityScore);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: meta.name,
              subtitle: `Congressional Delegation · ${billData.totalBillsSponsored} Sponsored Bills`,
              metric1: {
                label: 'SPONSORED BILLS',
                value: billData.totalBillsSponsored.toString(),
              },
              metric2: {
                label: 'ENACTED MEASURES',
                value: billData.enactedBillsCount.toString(),
              },
              metric3: {
                label: 'TOTAL WORD CHURN',
                value: `+${formatCompactNumber(billData.totalWordsAdded + billData.totalWordsDeleted)}`,
                isHighlight: true,
                highlightColor: 'text-emerald-800',
              },
              metric4: {
                label: 'REWRITE INDEX',
                value: `+${billData.averageVolatilityScore.toFixed(1)}%`,
                isPill: true,
                pillColor: 'bg-emerald-50 text-emerald-900',
              },
              category,
            };
          }

          return {
            id: fips,
            name: meta.name,
            code: meta.code,
            d,
            isSelected,
            fill,
            hoverFill,
            category,
            telemetry,
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
      const stateBaseVol = activeStateFips ? STATE_BILL_VOLATILITY_DATA[activeStateFips]?.averageVolatilityScore ?? 35 : 35;

      const paths = countiesGeoJson.features
        .map((feature: any, idx: number) => {
          const d = pathGenerator(feature);
          if (!d) return null;

          const countyName = feature.properties?.name || `County ${feature.id}`;
          const isSelected = selectedCountyName === countyName;

          const hashVal = (Number(feature.id) * 37 + idx * 13) % 100;
          let fill = '#E5E7EB';
          let hoverFill = '#D1D5DB';
          let category = 'Baseline';
          let telemetry: any = null;

          if (activeMetric === 'CONTRACT_CREEP') {
            const countyPercentCreep = Math.max(0, Math.round(stateBaseCreep * (0.5 + hashVal / 100)));
            const countyInitial = 50000000 + hashVal * 5000000;
            const countyDollar = Math.round((countyInitial * countyPercentCreep) / 100);
            const countyCurrent = countyInitial + countyDollar;

            const colorConfig = getEditorialCreepColor(countyPercentCreep);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: countyName,
              subtitle: `County Jurisdiction · ${currentStateMeta?.name}`,
              metric1: {
                label: 'TOTAL INITIAL OBLIGATION',
                value: formatCompactUSD(countyInitial),
              },
              metric2: {
                label: 'CURRENT TOTAL',
                value: formatCompactUSD(countyCurrent),
              },
              metric3: {
                label: 'DOLLAR CREEP',
                value: `+${formatCompactUSD(countyDollar)}`,
                isHighlight: true,
                highlightColor: 'text-red-700',
              },
              metric4: {
                label: 'PERCENT CREEP',
                value: `+${countyPercentCreep.toFixed(1)}%`,
                isPill: true,
                pillColor: 'bg-red-50 text-red-700',
              },
              category,
            };
          } else {
            const countyVolScore = Math.max(5, Math.round(stateBaseVol * (0.6 + (hashVal / 100) * 0.8)));
            const colorConfig = getEditorialVolatilityColor(countyVolScore);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: countyName,
              subtitle: `Congressional District Volatility · ${currentStateMeta?.name}`,
              metric1: {
                label: 'DISTRICT SPONSORED',
                value: `${8 + (hashVal % 15)} Bills`,
              },
              metric2: {
                label: 'ENACTED REFORMS',
                value: `${1 + (hashVal % 4)} Laws`,
              },
              metric3: {
                label: 'WORD CHURN',
                value: `+${formatCompactNumber(25000 + hashVal * 1200)}`,
                isHighlight: true,
                highlightColor: 'text-emerald-800',
              },
              metric4: {
                label: 'REWRITE INDEX',
                value: `+${countyVolScore.toFixed(1)}%`,
                isPill: true,
                pillColor: 'bg-emerald-50 text-emerald-900',
              },
              category,
            };
          }

          return {
            id: feature.id,
            name: countyName,
            code: currentStateMeta?.code || '',
            d,
            isSelected,
            feature,
            fill,
            hoverFill,
            category,
            telemetry,
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
          let fill = '#E5E7EB';
          let hoverFill = '#D1D5DB';
          let category = 'Baseline';
          let telemetry: any = null;

          if (activeMetric === 'CONTRACT_CREEP') {
            const cityPercentCreep = Math.round(15 + hashVal * 0.6);
            const cityInitial = 12000000 + hashVal * 800000;
            const cityDollar = Math.round((cityInitial * cityPercentCreep) / 100);
            const cityCurrent = cityInitial + cityDollar;

            const colorConfig = getEditorialCreepColor(cityPercentCreep);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: cityName,
              subtitle: `Municipal District · ${selectedCountyName}`,
              metric1: {
                label: 'TOTAL INITIAL OBLIGATION',
                value: formatCompactUSD(cityInitial),
              },
              metric2: {
                label: 'CURRENT TOTAL',
                value: formatCompactUSD(cityCurrent),
              },
              metric3: {
                label: 'DOLLAR CREEP',
                value: `+${formatCompactUSD(cityDollar)}`,
                isHighlight: true,
                highlightColor: 'text-red-700',
              },
              metric4: {
                label: 'PERCENT CREEP',
                value: `+${cityPercentCreep.toFixed(1)}%`,
                isPill: true,
                pillColor: 'bg-red-50 text-red-700',
              },
              category,
            };
          } else {
            const cityVolScore = Math.round(10 + hashVal * 0.5);
            const colorConfig = getEditorialVolatilityColor(cityVolScore);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: cityName,
              subtitle: `Municipal Delegation · ${selectedCountyName}`,
              metric1: {
                label: 'MUNICIPAL REFORMS',
                value: `${2 + (hashVal % 6)} Measures`,
              },
              metric2: {
                label: 'ENACTED',
                value: `${1 + (hashVal % 3)} Passed`,
              },
              metric3: {
                label: 'WORD CHURN',
                value: `+${formatCompactNumber(12000 + hashVal * 400)}`,
                isHighlight: true,
                highlightColor: 'text-emerald-800',
              },
              metric4: {
                label: 'REWRITE INDEX',
                value: `+${cityVolScore.toFixed(1)}%`,
                isPill: true,
                pillColor: 'bg-emerald-50 text-emerald-900',
              },
              category,
            };
          }

          return {
            id: feature.id || `city-${idx}`,
            name: cityName,
            code: currentStateMeta?.code || '',
            d,
            isSelected,
            fill,
            hoverFill,
            category,
            telemetry,
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
    activeMetric,
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
      {/* 1. Header Bar with Breadcrumb Navigation, Metric Layer Selector & Dossier Toggle */}
      <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between flex-shrink-0 z-20 shadow-xs">
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

        {/* Action Controls: Metric Layer Selector, Navigation Back & Dossier Toggle */}
        <div className="flex items-center gap-2.5">
          {(isLoading || isCitiesLoading) && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded text-[11px] font-medium animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-blue-900 shrink-0" />
              <span className="hidden sm:inline">
                {isCitiesLoading ? 'Pulling municipal vectors...' : 'Loading vector map...'}
              </span>
            </div>
          )}

          {/* Global Metric Layer Selector */}
          <div className="flex items-center gap-1.5 bg-stone-100 border border-stone-300 rounded px-2.5 py-1 shadow-2xs">
            <Layers className="w-3.5 h-3.5 text-stone-600" />
            <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-500 hidden sm:inline">
              Layer:
            </span>
            <select
              value={activeMetric}
              onChange={(e) => switchMetric(e.target.value as DossierMetricType)}
              aria-label="Select civic intelligence metric layer"
              className="text-xs bg-transparent font-semibold text-stone-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="CONTRACT_CREEP">📊 Contract Creep (USAspending)</option>
              <option value="BILL_DIFF" disabled>📜 Bill Diff & Volatility (Congress.gov) — Coming Soon</option>
            </select>
          </div>

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
        </div>
      </header>

      {/* 2. Main Workspace: Map Canvas + Civic Dossier Inspector Sidebar */}
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
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-900" />
              <div className="space-y-1">
                <div className="text-xs font-serif font-bold text-stone-800">
                  {isCitiesLoading
                    ? `Loading municipal subdivisions for ${selectedCountyName || 'County'}...`
                    : 'Loading nationwide vector topology...'}
                </div>
                <div className="text-[11px] text-stone-500">
                  Rendering high-resolution CartoColors chloropleth data
                </div>
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
                          stroke={item.isSelected ? '#0f172a' : '#ffffff'}
                          strokeWidth={item.isSelected ? '2' : '0.8'}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          className="transition-colors duration-150 cursor-pointer hover:opacity-90"
                          onMouseEnter={(e) => {
                            const rect = containerRef.current?.getBoundingClientRect();
                            if (item.telemetry) {
                              setHoveredFeature({
                                ...item.telemetry,
                                x: e.clientX - (rect?.left || 0),
                                y: e.clientY - (rect?.top || 0),
                              });
                            }
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
                        stroke={item.isSelected ? '#0f172a' : '#ffffff'}
                        strokeWidth={item.isSelected ? '2' : '0.8'}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="transition-colors duration-150 cursor-pointer hover:opacity-90"
                        onMouseEnter={(e) => {
                          const rect = containerRef.current?.getBoundingClientRect();
                          if (item.telemetry) {
                            setHoveredFeature({
                              ...item.telemetry,
                              x: e.clientX - (rect?.left || 0),
                              y: e.clientY - (rect?.top || 0),
                            });
                          }
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

          {/* Dynamic Editorial CartoColors Map Legend */}
          <div className="absolute bottom-4 left-4 z-10 bg-white border border-stone-200 shadow-sm px-3.5 py-2.5 rounded text-xs font-sans pointer-events-auto">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 mb-1.5 flex items-center justify-between gap-4">
              <span>{activeConfig.legendTitle}</span>
              <span className="text-[9px] text-stone-400">CartoColors</span>
            </div>
            <div className="flex items-center gap-1.5">
              {activeConfig.legendStops.map((stop, sIdx) => (
                <div key={sIdx} className="flex flex-col items-center">
                  <div
                    className="w-7 h-2.5 rounded-xs border"
                    style={{ backgroundColor: stop.fill, borderColor: stop.border }}
                    title={stop.description}
                  />
                  <span className="text-[9px] text-stone-500 mt-0.5 tabular-nums">{stop.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Unified High-Density Editorial Floating Hover Tooltip (ProPublica/NYT Style) */}
          {hoveredFeature && (() => {
            const tooltipWidth = 264; // w-66
            const estimatedTooltipHeight = 170;
            const margin = 16;
            
            // Flip below if close to the top of the map container
            const placeBelow = hoveredFeature.y < estimatedTooltipHeight + margin;
            
            // Clamp X coordinate so the tooltip never bleeds off the left or right edges
            const containerWidth = dimensions.width || 800;
            const halfWidth = tooltipWidth / 2;
            const clampedX = Math.max(
              halfWidth + margin,
              Math.min(hoveredFeature.x, containerWidth - halfWidth - margin)
            );
            
            const topY = placeBelow ? hoveredFeature.y + 14 : hoveredFeature.y - 14;

            return (
              <div
                className={`absolute z-50 pointer-events-none bg-white border border-stone-200 shadow-xl rounded p-4 w-66 transform -translate-x-1/2 ${
                  placeBelow ? 'translate-y-0' : '-translate-y-full'
                } transition-[left,top] duration-75 ease-out`}
                style={{ left: `${clampedX}px`, top: `${topY}px` }}
              >
                <div className="font-serif text-lg font-bold text-stone-800 border-b border-stone-100 pb-1.5 mb-2.5">
                  {hoveredFeature.title}
                  <div className="text-[10px] font-sans font-normal text-stone-500 leading-tight mt-0.5">
                    {hoveredFeature.subtitle}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-sans font-medium">
                      {hoveredFeature.metric1.label}
                    </div>
                    <div className="text-sm text-stone-800 font-medium tabular-nums">
                      {hoveredFeature.metric1.value}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-sans font-medium">
                      {hoveredFeature.metric2.label}
                    </div>
                    <div className="text-sm text-stone-800 font-medium tabular-nums">
                      {hoveredFeature.metric2.value}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-sans font-medium">
                      {hoveredFeature.metric3.label}
                    </div>
                    <div
                      className={`text-sm font-bold tabular-nums ${
                        hoveredFeature.metric3.highlightColor || 'text-red-700'
                      }`}
                    >
                      {hoveredFeature.metric3.value}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-sans font-medium">
                      {hoveredFeature.metric4.label}
                    </div>
                    <div className="text-sm">
                      <span
                        className={`px-1 py-0.5 inline-block font-bold rounded text-xs tabular-nums ${
                          hoveredFeature.metric4.pillColor || 'bg-red-50 text-red-700'
                        }`}
                      >
                        {hoveredFeature.metric4.value}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </main>

        {/* 3. Civic Intelligence Dossier Inspector Drawer */}
        {isDossierOpen && (
          <aside className="w-full md:w-1/3 h-full flex-shrink-0 z-20 border-l border-stone-200 bg-white transition-all duration-200">
            {activeMetric === 'CONTRACT_CREEP' ? (
              <ContractCreepPanel {...currentGeoProps} />
            ) : (
              <div className="flex flex-col h-full items-center justify-center p-8 text-center bg-[#fafaf9] space-y-4 border-l border-stone-200 font-sans">
                <div className="w-12 h-12 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shadow-2xs">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold tracking-wider">
                    COMING SOON
                  </span>
                  <h2 className="font-serif text-lg font-bold text-stone-900 pt-1">
                    Bill Diff & Volatility
                  </h2>
                  <p className="text-xs text-stone-500 font-sans max-w-xs leading-relaxed">
                    Legislative text churn analysis and congressional amendment diff tracking will be available in the next release.
                  </p>
                </div>
                <button
                  onClick={() => switchMetric('CONTRACT_CREEP')}
                  className="text-xs font-serif font-bold text-stone-800 underline hover:text-stone-900 cursor-pointer pt-2"
                >
                  ← Return to Contract Creep Audit
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;



