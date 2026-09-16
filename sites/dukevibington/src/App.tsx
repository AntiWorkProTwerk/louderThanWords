import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { geoAlbersUsa, geoAlbers, geoMercator, geoPath } from 'd3-geo';
import {
  fetchStatesGeoJson,
  fetchCountiesGeoJson,
  fetchCountyCitiesGeoJson,
  getStateFipsFromCode,
  reverseGeolocate,
  UserLocationResult,
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
import { CivicEdgeApiClient } from './services/civicEdgeApiClient';
import { ContractCreepPanel, JurisdictionGeoProps, AuditedJurisdictionMetrics } from './components/ContractCreepPanel';
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
  Sun,
  Moon,
  Crosshair,
  Navigation,
  Maximize2,
  MapPin,
  ExternalLink,
} from 'lucide-react';

export const normalizeMunicipalCleanName = (name: string) => {
  return (name || '')
    .toLowerCase()
    .replace(/^(city of |village of |town of |borough of |township of )/i, '')
    .replace(/\s+(twp|township|village|city|borough)$/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
};

export const normalizeMunicipalRawCleanName = (name: string) => {
  return (name || '')
    .toLowerCase()
    .replace(/^(city of |village of |town of |borough of |township of )/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
};

export const computeMunicipalMetrics = (
  rawAwards: any[],
  featureCollection: GeoJSON.FeatureCollection,
  stateCode: string,
  countyFips: string
): Record<string, AuditedJurisdictionMetrics> => {
  const result: Record<string, AuditedJurisdictionMetrics> = {};
  const rawFips3 = String(countyFips).length >= 5 ? String(countyFips).slice(2, 5) : String(countyFips).padStart(3, '0');

  for (const feature of featureCollection.features) {
    const cityName = feature.properties?.name || '';
    const rawClean = normalizeMunicipalRawCleanName(cityName);
    const cleanCity = normalizeMunicipalCleanName(cityName);
    if (!rawClean && !cleanCity) continue;

    const searchTokens = [cleanCity, rawClean];
    if (cleanCity.startsWith('st. ') || cleanCity.startsWith('st ')) {
      searchTokens.push(cleanCity.replace(/^st\.?\s+/i, 'saint '));
    } else if (cleanCity.startsWith('saint ')) {
      searchTokens.push(cleanCity.replace(/^saint\s+/i, 'st. '));
      searchTokens.push(cleanCity.replace(/^saint\s+/i, 'st '));
    }

    const matchedAwards = rawAwards.filter((a: any) => {
      const desc = (a.Description || a.description || '').toLowerCase();
      const rec = (a['Recipient Name'] || a.recipient_name || a.parentName || a.parent_recipient_name || '').toLowerCase();
      const rCity = (a.recipient_city_name || a.recipient_city || a.city_name || a.city || a.recipient_location_city_name || '').toLowerCase();
      const pCity = (a.place_of_performance_city_name || a.pop_city || a['Place of Performance City Name'] || '').toLowerCase();
      const rAddr = (a.recipient_address_line_1 || '').toLowerCase();

      return searchTokens.some(
        (token) =>
          token.length >= 3 &&
          (rCity.includes(token) ||
            pCity.includes(token) ||
            desc.includes(token) ||
            rec.includes(token) ||
            rAddr.includes(token))
      );
    });

    let initial = 0;
    let current = 0;
    let creep = 0;
    for (const a of matchedAwards) {
      const cAmt = Number(a.current_obligation ?? a['Award Amount'] ?? 0);
      const iAmt = Number(a.initial_obligation ?? a['Initial Obligation'] ?? cAmt);
      initial += iAmt;
      current += cAmt;
      creep += Number(a.dollar_creep ?? Math.max(0, cAmt - iAmt));
    }
    const pctCreep = initial > 0 ? (creep / initial) * 100 : 0;

    const metrics: AuditedJurisdictionMetrics = {
      initialObligation: initial,
      currentObligation: current,
      dollarCreep: creep,
      percentCreep: pctCreep,
      activeContractsCount: matchedAwards.length,
      costPlusPct: 0,
      capitalFlightPct: 0,
      isLive: true,
    };

    result[`city_${stateCode}_${rawClean}`] = metrics;
    result[`city_${stateCode}_${cleanCity}`] = metrics;
    result[`city_${stateCode}_${rawFips3}_${rawClean}`] = metrics;
    result[`city_${stateCode}_${rawFips3}_${cleanCity}`] = metrics;
    result[`city_${stateCode}_${cityName.toLowerCase()}`] = metrics;
    result[`city_${stateCode}_${rawFips3}_${cityName.toLowerCase()}`] = metrics;
  }
  return result;
};

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

  // Live Audited Jurisdictions Cache (Synchronizes USAspending live numbers with map tooltips)
  const [auditedJurisdictions, setAuditedJurisdictions] = useState<Record<string, AuditedJurisdictionMetrics>>({});

  const handleAnalyticsLoaded = useCallback((key: string, data: AuditedJurisdictionMetrics) => {
    setAuditedJurisdictions((prev) => {
      if (
        prev[key] &&
        prev[key].initialObligation === data.initialObligation &&
        prev[key].currentObligation === data.currentObligation &&
        prev[key].dollarCreep === data.dollarCreep
      ) {
        return prev;
      }
      return {
        ...prev,
        [key]: data,
      };
    });
  }, []);

  // Dark Mode Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('civic_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('civic_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Active Dossier Metric Layer ('CONTRACT_CREEP' | 'BILL_DIFF')
  const { activeMetric, activeConfig, switchMetric, availableMetrics } = useDossierMetric('CONTRACT_CREEP');

  // Navigation State
  const [viewMode, setViewMode] = useState<'national' | 'state' | 'county'>('national');
  const [activeStateFips, setActiveStateFips] = useState<string | null>('17');
  const [selectedStateName, setSelectedStateName] = useState<string | null>('Illinois');
  const [activeCountyId, setActiveCountyId] = useState<string | null>(null);
  const [selectedCountyName, setSelectedCountyName] = useState<string | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);

  // Current State Metadata
  const currentStateMeta: StateMetadata | null = useMemo(() => {
    if (!activeStateFips) return null;
    return US_STATES_FIPS[activeStateFips] || null;
  }, [activeStateFips]);

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

  // When activeStateFips changes in state mode, load the state's counties and pre-populate audited jurisdictions
  useEffect(() => {
    if ((viewMode === 'state' || viewMode === 'county') && activeStateFips) {
      fetchCountiesGeoJson(activeStateFips).then((filteredCounties) => {
        setCountiesGeoJson(filteredCounties);
      });

      const meta = US_STATES_FIPS[activeStateFips];
      if (meta) {
        CivicEdgeApiClient.getStateBundle(meta.code).then((stateData) => {
          if (!stateData) return;
          setAuditedJurisdictions((prev) => {
            const next = { ...prev };
            if (stateData.state) {
              next[`state_${meta.code}`] = {
                initialObligation: Number(stateData.state.initial_obligation || 0),
                currentObligation: Number(stateData.state.current_obligation || 0),
                dollarCreep: Number(stateData.state.dollar_creep || 0),
                percentCreep: Number(stateData.state.percent_creep || 0),
                activeContractsCount: Number(stateData.state.active_contracts_count || 0),
              };
            }
            if (Array.isArray(stateData.counties)) {
              for (const c of stateData.counties) {
                const fips = String(c.county_fips || '').padStart(3, '0');
                const cleanName = (c.name || '').toLowerCase().replace(/ county$/i, '').trim();
                const metrics = {
                  initialObligation: Number(c.initial_obligation || 0),
                  currentObligation: Number(c.current_obligation || 0),
                  dollarCreep: Number(c.dollar_creep || 0),
                  percentCreep: Number(c.percent_creep || 0),
                  activeContractsCount: Number(c.active_contracts_count || 0),
                };
                next[`county_${meta.code}_${fips}`] = metrics;
                next[`county_${meta.code}_${cleanName}`] = metrics;
              }
            }
            return next;
          });
        });
      }
    } else {
      setCountiesGeoJson(null);
    }
  }, [viewMode, activeStateFips]);

  // When in county view mode and citiesGeoJson is loaded, pre-populate all municipal sectors from county and state awards
  useEffect(() => {
    if (viewMode === 'county' && activeStateFips && activeCountyId && citiesGeoJson && citiesGeoJson.features) {
      const meta = US_STATES_FIPS[activeStateFips];
      const rawCountyFips = String(activeCountyId).length >= 5 ? String(activeCountyId).slice(2, 5) : String(activeCountyId).padStart(3, '0');
      if (!meta) return;

      Promise.all([
        CivicEdgeApiClient.getCountyBundle(meta.code, rawCountyFips),
        CivicEdgeApiClient.getStateBundle(meta.code),
      ]).then(([countyData, stateData]) => {
        const awardsMap = new Map<string, any>();
        for (const a of (countyData?.awards || [])) {
          const id = a.generated_internal_id || a['Award ID'] || a.piid || a.internal_id;
          if (id) awardsMap.set(id, a);
        }
        for (const a of (stateData?.topAwards || [])) {
          const id = a.generated_internal_id || a['Award ID'] || a.piid || a.internal_id;
          if (id && !awardsMap.has(id)) awardsMap.set(id, a);
        }
        const allAwards = Array.from(awardsMap.values());
        const municipalMetrics = computeMunicipalMetrics(allAwards, citiesGeoJson, meta.code, rawCountyFips);
        setAuditedJurisdictions((prev) => ({
          ...prev,
          ...municipalMetrics,
        }));
      });
    }
  }, [viewMode, activeStateFips, activeCountyId, citiesGeoJson]);

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

  // Handle double clicking into a state (instant responsive transition)
  const handleStateDoubleClick = useCallback((fips: string, stateName: string) => {
    setActiveStateFips(fips);
    setSelectedStateName(stateName);
    setActiveCountyId(null);
    setSelectedCountyName(null);
    setSelectedCityName(null);
    setViewMode('state');
    setHoveredFeature(null);
  }, []);

  // Handle double clicking into a county (instant responsive transition)
  const handleCountyDoubleClick = useCallback(
    async (countyFeature: GeoJSON.Feature, countyName: string) => {
      setActiveCountyFeature(countyFeature);
      setActiveCountyId(String(countyFeature.id));
      setSelectedCountyName(countyName);
      setSelectedCityName(null);
      setViewMode('county');
      setHoveredFeature(null);
      setIsCitiesLoading(true);

      const fips = activeStateFips || (currentStateMeta?.code ? getStateFipsFromCode(currentStateMeta.code) : '17') || '17';
      const stateMeta = US_STATES_FIPS[fips] || currentStateMeta;
      const rawCountyFips = String(countyFeature.id).length >= 5 ? String(countyFeature.id).slice(2, 5) : String(countyFeature.id).padStart(3, '0');

      try {
        const [cities, countyData, stateData] = await Promise.all([
          fetchCountyCitiesGeoJson(countyFeature, fips),
          CivicEdgeApiClient.getCountyBundle(stateMeta?.code || 'IL', rawCountyFips),
          CivicEdgeApiClient.getStateBundle(stateMeta?.code || 'IL'),
        ]);

        const awardsMap = new Map<string, any>();
        for (const a of (countyData?.awards || [])) {
          const id = a.generated_internal_id || a['Award ID'] || a.piid || a.internal_id;
          if (id) awardsMap.set(id, a);
        }
        for (const a of (stateData?.topAwards || [])) {
          const id = a.generated_internal_id || a['Award ID'] || a.piid || a.internal_id;
          if (id && !awardsMap.has(id)) awardsMap.set(id, a);
        }
        const allAwards = Array.from(awardsMap.values());

        if (cities?.features) {
          const municipalMetrics = computeMunicipalMetrics(allAwards, cities, stateMeta?.code || 'IL', rawCountyFips);
          setAuditedJurisdictions((prev) => ({
            ...prev,
            ...municipalMetrics,
          }));
        }

        setCitiesGeoJson(cities);
      } catch (err) {
        console.warn('Failed to load county data or city boundaries:', err);
      } finally {
        setIsCitiesLoading(false);
      }
    },
    [activeStateFips, currentStateMeta]
  );

  // Geolocation & Animation State
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [detectedUserLocation, setDetectedUserLocation] = useState<UserLocationResult | null>(null);
  const hasPromptedLocationRef = useRef<boolean>(false);

  // Instant & relative Locate Me navigation
  const triggerCinematicLocationZoom = useCallback(
    async (loc: UserLocationResult) => {
      setIsLocating(true);

      const targetCountyFeature = loc.countyFeature;
      const targetCountyName = loc.countyName;
      const targetCity = loc.city;

      const isSameState = activeStateFips === loc.stateFips;
      const isSameCounty =
        targetCountyName &&
        selectedCountyName &&
        selectedCountyName.toLowerCase().replace(/ (county|parish|borough)$/i, '').trim() ===
          targetCountyName.toLowerCase().replace(/ (county|parish|borough)$/i, '').trim();

      if (viewMode === 'county' && isSameState && isSameCounty) {
        if (targetCity) {
          setSelectedCityName(targetCity);
        }
        setLocationMessage(
          `You are viewing your local jurisdiction: ${targetCity ? `${targetCity} · ` : ''}${targetCountyName}, ${loc.stateCode}`
        );
        setTimeout(() => {
          setIsLocating(false);
          setLocationMessage(null);
        }, 3500);
        return;
      }

      if (targetCountyFeature) {
        setActiveStateFips(loc.stateFips);
        setSelectedStateName(loc.stateName);
        setActiveCountyFeature(targetCountyFeature);
        setActiveCountyId(loc.countyFips || String(targetCountyFeature.id));
        setSelectedCountyName(targetCountyName || targetCountyFeature.properties?.name || 'County');
        setSelectedCityName(targetCity || null);
        setViewMode('county');
        setHoveredFeature(null);
        setIsCitiesLoading(true);

        const rawCountyFips = String(targetCountyFeature.id).length >= 5 ? String(targetCountyFeature.id).slice(2, 5) : String(targetCountyFeature.id).padStart(3, '0');

        try {
          const [cities, countyData, stateData] = await Promise.all([
            fetchCountyCitiesGeoJson(targetCountyFeature, loc.stateFips),
            CivicEdgeApiClient.getCountyBundle(loc.stateCode, rawCountyFips),
            CivicEdgeApiClient.getStateBundle(loc.stateCode),
          ]);

          const awardsMap = new Map<string, any>();
          for (const a of (countyData?.awards || [])) {
            const id = a.generated_internal_id || a['Award ID'] || a.piid || a.internal_id;
            if (id) awardsMap.set(id, a);
          }
          for (const a of (stateData?.topAwards || [])) {
            const id = a.generated_internal_id || a['Award ID'] || a.piid || a.internal_id;
            if (id && !awardsMap.has(id)) awardsMap.set(id, a);
          }
          const allAwards = Array.from(awardsMap.values());

          if (cities?.features) {
            const municipalMetrics = computeMunicipalMetrics(allAwards, cities, loc.stateCode, rawCountyFips);
            setAuditedJurisdictions((prev) => ({
              ...prev,
              ...municipalMetrics,
            }));
          }

          setCitiesGeoJson(cities);
        } catch (err) {
          console.warn('Failed to load municipal boundaries:', err);
        } finally {
          setIsCitiesLoading(false);
        }

        setLocationMessage(
          `Jurisdiction: ${targetCity ? `${targetCity} · ` : ''}${targetCountyName || 'County'}, ${loc.stateCode}`
        );
      } else {
        handleStateDoubleClick(loc.stateFips, loc.stateName);
        setLocationMessage(`Jurisdiction: ${loc.stateName}`);
      }

      setTimeout(() => {
        setIsLocating(false);
        setLocationMessage(null);
      }, 3500);
    },
    [viewMode, activeStateFips, selectedCountyName, handleStateDoubleClick]
  );

  // User click on "Locate Me" icon (Triggers immediate zoom)
  const handleLocateMe = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationMessage('Geolocation is not supported by your browser');
      setTimeout(() => setLocationMessage(null), 3000);
      return;
    }

    setIsLocating(true);
    setLocationMessage('Requesting GPS location...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const loc = await reverseGeolocate(pos.coords.latitude, pos.coords.longitude);
          if (loc) {
            setDetectedUserLocation(loc);
            triggerCinematicLocationZoom(loc);
          } else {
            setLocationMessage('Could not pinpoint US jurisdiction');
            setTimeout(() => setLocationMessage(null), 3000);
            setIsLocating(false);
          }
        } catch (err) {
          setLocationMessage('Location lookup failed');
          setTimeout(() => setLocationMessage(null), 3000);
          setIsLocating(false);
        }
      },
      (err) => {
        console.warn('Geolocation denied or timed out:', err);
        setLocationMessage('Location access declined');
        setTimeout(() => setLocationMessage(null), 3000);
        setIsLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  }, [triggerCinematicLocationZoom]);

  // Detect location on initial load WITHOUT auto-zooming
  useEffect(() => {
    if (hasPromptedLocationRef.current) return;
    hasPromptedLocationRef.current = true;

    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const loc = await reverseGeolocate(pos.coords.latitude, pos.coords.longitude);
            if (loc) {
              setDetectedUserLocation(loc);
            }
          } catch (e) {
            // Graceful fallback
          }
        },
        () => {
          // Denied or dismissed
        },
        { timeout: 8000, enableHighAccuracy: false }
      );
    }
  }, []);

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
  const { renderedPaths, neighborPaths, countyOutlinePath } = useMemo(() => {
    const { width, height } = dimensions;
    const padding = Math.min(width, height) * 0.05;

    if (viewMode === 'national') {
      if (!statesGeoJson || !statesGeoJson.features) return { renderedPaths: [], neighborPaths: [], countyOutlinePath: null };

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

      return { renderedPaths: paths, neighborPaths: [], countyOutlinePath: null };
    } else if (viewMode === 'state') {
      // viewMode === 'state' -> Render state's county lines + neighboring state context
      if (!countiesGeoJson || !countiesGeoJson.features || countiesGeoJson.features.length === 0) {
        return { renderedPaths: [], neighborPaths: [], countyOutlinePath: null };
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

          let fill = '#E5E7EB';
          let hoverFill = '#D1D5DB';
          let category = 'Baseline';
          let telemetry: any = null;

          if (activeMetric === 'CONTRACT_CREEP') {
            const rawFips3 = String(feature.id).length >= 5 ? String(feature.id).slice(2, 5) : String(feature.id).padStart(3, '0');
            const cleanCounty = countyName.toLowerCase().replace(/ county$/i, '').trim();
            const countyKey1 = `county_${currentStateMeta?.code}_${rawFips3}`;
            const countyKey2 = `county_${currentStateMeta?.code}_${cleanCounty}`;
            const auditedData = auditedJurisdictions[countyKey1] || auditedJurisdictions[countyKey2];

            if (auditedData) {
              const countyPercentCreep = auditedData.percentCreep;
              const countyInitial = auditedData.initialObligation;
              const countyDollar = auditedData.dollarCreep;
              const countyCurrent = auditedData.currentObligation;

              const colorConfig = getEditorialCreepColor(countyPercentCreep);
              fill = colorConfig.fill;
              hoverFill = colorConfig.hoverFill;
              category = colorConfig.category;

              telemetry = {
                title: countyName,
                subtitle: `Live Forensic Audit · ${auditedData.activeContractsCount} Prime Awards · ${currentStateMeta?.name}`,
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
                  value: countyDollar > 0 ? `+${formatCompactUSD(countyDollar)}` : '$0.00',
                  isHighlight: countyDollar > 0,
                  highlightColor: 'text-red-700',
                },
                metric4: {
                  label: 'PERCENT CREEP',
                  value: countyPercentCreep > 0 ? `+${countyPercentCreep.toFixed(1)}%` : '0.0%',
                  isPill: true,
                  pillColor: countyPercentCreep > 0 ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-zinc-300',
                },
                category,
              };
            } else {
              // County sector without isolated mega-award -> Inherits state baseline CartoColor gradient
              const stateColorConfig = getEditorialCreepColor(stateBaseCreep);
              fill = stateColorConfig.fill;
              hoverFill = stateColorConfig.hoverFill;
              category = stateColorConfig.category;

              telemetry = {
                title: countyName,
                subtitle: `County Jurisdiction · Showing State Baseline · ${currentStateMeta?.name}`,
                metric1: {
                  label: 'COUNTY SECTOR',
                  value: countyName.replace(/ County$/i, ''),
                },
                metric2: {
                  label: 'STATE BASELINE',
                  value: `+${stateBaseCreep.toFixed(1)}% Creep`,
                },
                metric3: {
                  label: 'DATA SOURCE',
                  value: 'USAspending Open Data',
                },
                metric4: {
                  label: 'SECTOR STATUS',
                  value: 'State Indexed',
                  isPill: true,
                  pillColor: stateBaseCreep > 0 ? 'bg-red-50 text-red-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-zinc-300',
                },
                category,
              };
            }
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

      // Compute neighboring state paths (ghost background entities with actual metric gradient colors)
      const neighborPaths = (statesGeoJson?.features || [])
        .filter((feature: any) => String(feature.id).padStart(2, '0') !== activeStateFips)
        .map((feature: any) => {
          const d = pathGenerator(feature);
          if (!d) return null;

          const fips = String(feature.id).padStart(2, '0');
          const meta = US_STATES_FIPS[fips] || {
            name: feature.properties?.name || `State ${fips}`,
            code: feature.properties?.code || 'US',
          };

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
              subtitle: `Neighboring State · ${creepData.activeContractsCount || 0} Contracts · Click to explore`,
              metric1: {
                label: 'TOTAL CURRENT OBLIGATION',
                value: formatCompactUSD(creepData.currentObligation),
              },
              metric2: {
                label: 'PERCENT CREEP',
                value: `+${creepData.percentCreep.toFixed(1)}%`,
              },
              metric3: {
                label: 'DOLLAR CREEP',
                value: `+${formatCompactUSD(creepData.dollarCreep)}`,
                isHighlight: true,
                highlightColor: 'text-red-700',
              },
              metric4: {
                label: 'CLICK ACTION',
                value: `Switch to ${meta.name}`,
              },
              category,
            };
          } else {
            const billData = STATE_BILL_VOLATILITY_DATA[fips] || {
              fips,
              stateCode: meta.code,
              stateName: meta.name,
              totalBillsSponsored: 100,
              enactedBillsCount: 15,
              averageVolatilityScore: 35.0,
              totalWordsAdded: 150000,
              totalWordsDeleted: 50000,
            };

            const colorConfig = getEditorialVolatilityColor(billData.averageVolatilityScore);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: meta.name,
              subtitle: `Neighboring State · ${billData.totalBillsSponsored} Bills · Click to explore`,
              metric1: {
                label: 'SPONSORED BILLS',
                value: billData.totalBillsSponsored.toString(),
              },
              metric2: {
                label: 'REWRITE INDEX',
                value: `+${billData.averageVolatilityScore.toFixed(1)}%`,
              },
              metric3: {
                label: 'WORD CHURN',
                value: `+${formatCompactNumber(billData.totalWordsAdded + billData.totalWordsDeleted)}`,
                isHighlight: true,
                highlightColor: 'text-emerald-800',
              },
              metric4: {
                label: 'CLICK ACTION',
                value: `Switch to ${meta.name}`,
              },
              category,
            };
          }

          return {
            id: `neighbor-state-${fips}`,
            name: meta.name,
            code: meta.code,
            d,
            fill,
            hoverFill,
            isNeighbor: true,
            telemetry,
            onClick: () => {
              handleStateDoubleClick(fips, meta.name);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              handleStateDoubleClick(fips, meta.name);
            },
          };
        })
        .filter(Boolean);

      return { renderedPaths: paths, neighborPaths, countyOutlinePath: null };
    } else {
      // viewMode === 'county' -> Render city / municipal boundaries inside the county + surrounding counties
      if (!activeCountyFeature) {
        return { renderedPaths: [], neighborPaths: [], countyOutlinePath: null };
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

      const stateBaseCreep = activeStateFips ? STATE_CREEP_DATA[activeStateFips]?.percentCreep ?? 30 : 30;
      const stateBaseVol = activeStateFips ? STATE_BILL_VOLATILITY_DATA[activeStateFips]?.averageVolatilityScore ?? 35 : 35;

      const rawCountyFips = activeCountyId
        ? (String(activeCountyId).length >= 5 ? String(activeCountyId).slice(2, 5) : String(activeCountyId).padStart(3, '0'))
        : '';
      const cleanCounty = selectedCountyName ? selectedCountyName.toLowerCase().replace(/ county$/i, '').trim() : '';
      const countyAuditedData =
        auditedJurisdictions[`county_${currentStateMeta?.code}_${rawCountyFips}`] ||
        auditedJurisdictions[`county_${currentStateMeta?.code}_${cleanCounty}`];

      const countyCreepPct = countyAuditedData?.percentCreep ?? stateBaseCreep;
      const countyInitial = countyAuditedData?.initialObligation ?? 0;
      const countyCurrent = countyAuditedData?.currentObligation ?? 0;
      const countyDollar = countyAuditedData?.dollarCreep ?? 0;
      const countyAwardsCount = countyAuditedData?.activeContractsCount ?? 0;
      const countyColorConfig = getEditorialCreepColor(countyCreepPct);

      const cityFeatures = citiesGeoJson?.features || [];

      // Check if any municipality has direct contracts in this county
      const anyCityHasDirectAwards = cityFeatures.some((feature: any) => {
        const cName = feature.properties?.name || '';
        const rawClean = normalizeMunicipalRawCleanName(cName);
        const cleanCity = normalizeMunicipalCleanName(cName);
        const aData =
          auditedJurisdictions[`city_${currentStateMeta?.code}_${cleanCity}`] ||
          auditedJurisdictions[`city_${currentStateMeta?.code}_${rawClean}`] ||
          auditedJurisdictions[`city_${currentStateMeta?.code}_${rawCountyFips}_${cleanCity}`] ||
          auditedJurisdictions[`city_${currentStateMeta?.code}_${rawCountyFips}_${rawClean}`] ||
          auditedJurisdictions[`city_${currentStateMeta?.code}_${cName.toLowerCase()}`] ||
          auditedJurisdictions[`city_${currentStateMeta?.code}_${rawCountyFips}_${cName.toLowerCase()}`];
        return aData && aData.activeContractsCount > 0;
      });

      // Scenario A: If no municipal-specific breakdown exists (or cityFeatures is empty), render unified county region
      if (cityFeatures.length === 0 || !anyCityHasDirectAwards) {
        const d = countyOutline;
        if (!d) return { renderedPaths: [], neighborPaths: [], countyOutlinePath: null };

        const paths = [
          {
            id: activeCountyId || 'county',
            name: selectedCountyName || 'County',
            code: currentStateMeta?.code || '',
            d,
            isSelected: true,
            fill: countyColorConfig.fill,
            hoverFill: countyColorConfig.hoverFill,
            category: countyColorConfig.category,
            telemetry: {
              title: selectedCountyName || 'County Jurisdiction',
              subtitle: `County-Wide Forensic Audit · ${countyAwardsCount} Prime Awards · ${currentStateMeta?.name}`,
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
                value: countyDollar > 0 ? `+${formatCompactUSD(countyDollar)}` : '$0.00',
                isHighlight: countyDollar > 0,
                highlightColor: 'text-red-700',
              },
              metric4: {
                label: 'PERCENT CREEP',
                value: countyCreepPct > 0 ? `+${countyCreepPct.toFixed(1)}%` : '0.0%',
                isPill: true,
                pillColor: countyCreepPct > 0 ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-zinc-300',
              },
              category: countyColorConfig.category,
            },
            onClick: () => {
              setSelectedCityName(null);
            },
          },
        ];

        return { renderedPaths: paths, neighborPaths: [], countyOutlinePath: countyOutline };
      }

      // Scenario B: Mixed results -> Render municipal subdivisions, with direct contract hotspots highlighted and others inheriting county CartoColor
      const paths = cityFeatures
        .map((feature: any, idx: number) => {
          const d = pathGenerator(feature);
          if (!d) return null;

          const cityName = feature.properties?.name || `City ${idx + 1}`;
          const normalizeMunicipalStr = (s: string) =>
            s.toLowerCase().replace(/^(city of|village of|town of|borough of|township of)\s+/i, '').trim();
          const isSelected = Boolean(
            selectedCityName &&
              (selectedCityName === cityName ||
                normalizeMunicipalStr(selectedCityName) === normalizeMunicipalStr(cityName))
          );

          let fill = countyColorConfig.fill;
          let hoverFill = countyColorConfig.hoverFill;
          let category = countyColorConfig.category;
          let telemetry: any = null;

          if (activeMetric === 'CONTRACT_CREEP') {
            const rawClean = normalizeMunicipalRawCleanName(cityName);
            const cleanCity = normalizeMunicipalCleanName(cityName);
            const rawFips3 = activeCountyId ? (String(activeCountyId).length >= 5 ? String(activeCountyId).slice(2, 5) : String(activeCountyId).padStart(3, '0')) : '';

            const auditedData =
              auditedJurisdictions[`city_${currentStateMeta?.code}_${cleanCity}`] ||
              auditedJurisdictions[`city_${currentStateMeta?.code}_${rawClean}`] ||
              auditedJurisdictions[`city_${currentStateMeta?.code}_${rawFips3}_${cleanCity}`] ||
              auditedJurisdictions[`city_${currentStateMeta?.code}_${rawFips3}_${rawClean}`] ||
              auditedJurisdictions[`city_${currentStateMeta?.code}_${cityName.toLowerCase()}`] ||
              auditedJurisdictions[`city_${currentStateMeta?.code}_${rawFips3}_${cityName.toLowerCase()}`];

            if (auditedData && auditedData.activeContractsCount > 0) {
              const cityPercentCreep = auditedData.percentCreep;
              const cityInitial = auditedData.initialObligation;
              const cityDollar = auditedData.dollarCreep;
              const cityCurrent = auditedData.currentObligation;

              const colorConfig = getEditorialCreepColor(cityPercentCreep);
              fill = colorConfig.fill;
              hoverFill = colorConfig.hoverFill;
              category = colorConfig.category;

              telemetry = {
                title: cityName,
                subtitle: `Direct Municipal Audit · ${auditedData.activeContractsCount} Prime Awards · ${selectedCountyName}`,
                metric1: {
                  label: 'LOCAL MOD 0 BASE',
                  value: formatCompactUSD(cityInitial),
                },
                metric2: {
                  label: 'LOCAL CURRENT TOTAL',
                  value: formatCompactUSD(cityCurrent),
                },
                metric3: {
                  label: 'LOCAL DOLLAR CREEP',
                  value: cityDollar > 0 ? `+${formatCompactUSD(cityDollar)}` : '$0.00',
                  isHighlight: cityDollar > 0,
                  highlightColor: 'text-red-700',
                },
                metric4: {
                  label: 'PERCENT CREEP',
                  value: cityPercentCreep > 0 ? `+${cityPercentCreep.toFixed(1)}%` : '0.0%',
                  isPill: true,
                  pillColor: cityPercentCreep > 0 ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-zinc-300',
                },
                category,
              };
            } else {
              // Sector with no direct prime awards -> Inherits county CartoColor & displays county data with municipal name
              fill = countyColorConfig.fill;
              hoverFill = countyColorConfig.hoverFill;
              category = countyColorConfig.category;

              telemetry = {
                title: cityName,
                subtitle: `Showing County Data · ${selectedCountyName || 'County'}`,
                metric1: {
                  label: 'COUNTY MOD 0 BASE',
                  value: formatCompactUSD(countyInitial),
                },
                metric2: {
                  label: 'COUNTY CURRENT TOTAL',
                  value: formatCompactUSD(countyCurrent),
                },
                metric3: {
                  label: 'COUNTY DOLLAR CREEP',
                  value: countyDollar > 0 ? `+${formatCompactUSD(countyDollar)}` : '$0.00',
                  isHighlight: countyDollar > 0,
                  highlightColor: 'text-red-700',
                },
                metric4: {
                  label: 'COUNTY OVERRUN',
                  value: countyCreepPct > 0 ? `+${countyCreepPct.toFixed(1)}%` : '0.0%',
                  isPill: true,
                  pillColor: countyCreepPct > 0 ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-zinc-300',
                },
                category,
              };
            }
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

      // Compute neighboring county paths in state with actual metric gradient colors
      const neighborPaths = (countiesGeoJson?.features || [])
        .filter((feature: any) => String(feature.id) !== String(activeCountyFeature.id))
        .map((feature: any, idx: number) => {
          const d = pathGenerator(feature);
          if (!d) return null;

          const countyName = feature.properties?.name || `County ${feature.id}`;
          const rawFips3 = String(feature.id).length >= 5 ? String(feature.id).slice(2, 5) : String(feature.id).padStart(3, '0');
          const cleanCounty = countyName.toLowerCase().replace(/ county$/i, '').trim();
          const countyKey1 = `county_${currentStateMeta?.code}_${rawFips3}`;
          const countyKey2 = `county_${currentStateMeta?.code}_${cleanCounty}`;
          const auditedData = auditedJurisdictions[countyKey1] || auditedJurisdictions[countyKey2];

          let fill = '#E5E7EB';
          let hoverFill = '#D1D5DB';
          let category = 'Baseline';
          let telemetry: any = null;

          if (activeMetric === 'CONTRACT_CREEP') {
            const countyPercentCreep = auditedData ? auditedData.percentCreep : stateBaseCreep;
            const colorConfig = getEditorialCreepColor(countyPercentCreep);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: countyName,
              subtitle: auditedData
                ? `Live Forensic Audit · ${auditedData.activeContractsCount} Prime Awards · Click to explore`
                : `Neighboring County · ${currentStateMeta?.name} · Click to explore`,
              metric1: {
                label: 'TOTAL CURRENT',
                value: auditedData ? formatCompactUSD(auditedData.currentObligation) : 'Click to Load',
              },
              metric2: {
                label: 'PERCENT CREEP',
                value: auditedData ? (auditedData.percentCreep > 0 ? `+${auditedData.percentCreep.toFixed(1)}%` : '0.0%') : `+${stateBaseCreep.toFixed(1)}% Base`,
              },
              metric3: {
                label: 'CLICK ACTION',
                value: `Switch to ${countyName.replace(/ County$/i, '')}`,
              },
              metric4: {
                label: 'STATE',
                value: currentStateMeta?.name || 'State',
              },
              category,
            };
          } else {
            const hashVal = (Number(feature.id) * 37 + idx * 13) % 100;
            const countyVolScore = Math.max(5, Math.round(stateBaseVol * (0.6 + (hashVal / 100) * 0.8)));
            const colorConfig = getEditorialVolatilityColor(countyVolScore);
            fill = colorConfig.fill;
            hoverFill = colorConfig.hoverFill;
            category = colorConfig.category;

            telemetry = {
              title: countyName,
              subtitle: `Neighboring County · ${currentStateMeta?.name} · Click to explore`,
              metric1: {
                label: 'REWRITE INDEX',
                value: `+${countyVolScore.toFixed(1)}%`,
              },
              metric2: {
                label: 'CLICK ACTION',
                value: `Switch to ${countyName}`,
              },
              metric3: {
                label: 'STATE',
                value: currentStateMeta?.name || 'State',
              },
              metric4: {
                label: 'INTERACTION',
                value: 'Click to Enter',
              },
              category,
            };
          }

          return {
            id: `neighbor-county-${feature.id}`,
            name: countyName,
            code: currentStateMeta?.code || '',
            d,
            fill,
            hoverFill,
            isNeighbor: true,
            telemetry,
            onClick: () => {
              handleCountyDoubleClick(feature, countyName);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              handleCountyDoubleClick(feature, countyName);
            },
          };
        })
        .filter(Boolean);

      return { renderedPaths: paths, neighborPaths, countyOutlinePath: countyOutline };
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
    <div className="flex flex-col h-screen w-screen bg-[#fafaf9] dark:bg-[#18191c] text-stone-900 dark:text-zinc-100 overflow-hidden font-sans select-none">
      {/* 1. Header Bar: Top Title + Sub Breadcrumb Hierarchy */}
      <header className="bg-white dark:bg-[#22242a] border-b border-stone-200 dark:border-[#2e313a] px-4 sm:px-6 py-2.5 flex flex-col gap-2 flex-shrink-0 z-20 shadow-xs">
        {/* Top Row: Brand & Action Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-900 dark:bg-sky-400"></div>
            <div className="flex items-center gap-2">
              <a
                href="/"
                className="font-extrabold text-base sm:text-lg tracking-tight text-stone-900 dark:text-zinc-100 hover:text-blue-800 dark:hover:text-sky-400 transition-colors"
                title="Return to LouderThanWords Portal"
              >
                LouderThanWords.fyi
              </a>
              <span className="text-stone-300 dark:text-zinc-600 font-light">·</span>
              <span className="text-xs sm:text-sm italic text-stone-600 dark:text-zinc-300 font-medium">
                Transparency Dossier
              </span>
            </div>
          </div>

          {/* Action Controls: Metric Layer Selector, Navigation Back & Theme Toggle */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {(isLoading || isCitiesLoading) && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 dark:bg-sky-950/60 text-blue-900 dark:text-sky-300 border border-blue-200 dark:border-sky-800/60 rounded text-[11px] font-medium animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-blue-900 dark:text-sky-300 shrink-0" />
                <span className="hidden sm:inline">
                  {isCitiesLoading ? 'Pulling municipal vectors...' : 'Loading vector map...'}
                </span>
              </div>
            )}

            {/* Global Metric Layer Selector */}
            <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-[#2c2f38] border border-stone-300 dark:border-[#3a3e4a] rounded px-2.5 py-1 shadow-2xs">
              <Layers className="w-3.5 h-3.5 text-stone-600 dark:text-zinc-400" />
              <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-500 dark:text-zinc-400 hidden sm:inline">
                Layer:
              </span>
              <select
                value={activeMetric}
                onChange={(e) => switchMetric(e.target.value as DossierMetricType)}
                aria-label="Select civic intelligence metric layer"
                className="text-xs bg-transparent font-semibold text-stone-800 dark:text-zinc-200 focus:outline-none cursor-pointer pr-1"
              >
                <option value="CONTRACT_CREEP" className="dark:bg-[#22242a] dark:text-zinc-100">
                  📊 Contract Creep (USAspending)
                </option>
                <option value="BILL_DIFF" disabled className="dark:bg-[#22242a] dark:text-zinc-500">
                  📜 Bill Diff & Volatility (Congress.gov) — Coming Soon
                </option>
              </select>
            </div>

            {viewMode === 'county' ? (
              <button
                onClick={handleZoomOutToState}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-100 dark:bg-[#2c2f38] hover:bg-stone-200 dark:hover:bg-[#353944] text-stone-700 dark:text-zinc-300 border border-stone-300 dark:border-[#3a3e4a] rounded transition-colors font-medium cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back to Counties</span>
              </button>
            ) : viewMode === 'state' ? (
              <button
                onClick={handleZoomOutToNational}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-100 dark:bg-[#2c2f38] hover:bg-stone-200 dark:hover:bg-[#353944] text-stone-700 dark:text-zinc-300 border border-stone-300 dark:border-[#3a3e4a] rounded transition-colors font-medium cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back to US Map</span>
              </button>
            ) : null}

            {/* Theme Toggle Button (Light / Dark) */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-1.5 sm:px-2.5 sm:py-1 text-xs bg-stone-100 dark:bg-[#2c2f38] hover:bg-stone-200 dark:hover:bg-[#353944] text-stone-700 dark:text-zinc-200 border border-stone-300 dark:border-[#3a3e4a] rounded transition-colors font-medium cursor-pointer flex items-center gap-1.5"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline text-[11px] font-sans">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline text-[11px] font-sans">Dark</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Row: Breadcrumb Navigation */}
        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-stone-600 dark:text-zinc-400 border-t border-stone-100 dark:border-[#2e313a]/60 pt-1.5 overflow-x-auto">
          <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 dark:text-zinc-500 mr-0.5 shrink-0">
            Jurisdiction:
          </span>
          <button
            onClick={handleZoomOutToNational}
            className={`transition-colors cursor-pointer shrink-0 ${
              viewMode === 'national'
                ? 'px-2 py-0.5 rounded bg-stone-200/80 dark:bg-[#2c2f38] text-stone-900 dark:text-zinc-100 font-bold border border-stone-300 dark:border-[#3a3e4a] shadow-2xs'
                : 'px-1.5 py-0.5 rounded text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-[#2c2f38]'
            }`}
          >
            United States
          </button>

          {(viewMode === 'state' || viewMode === 'county') && currentStateMeta && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400 dark:text-zinc-600 shrink-0" />
              <button
                onClick={handleZoomOutToState}
                className={`transition-colors cursor-pointer shrink-0 ${
                  viewMode === 'state'
                    ? 'px-2 py-0.5 rounded bg-stone-200/80 dark:bg-[#2c2f38] text-stone-900 dark:text-zinc-100 font-bold border border-stone-300 dark:border-[#3a3e4a] shadow-2xs'
                    : 'px-1.5 py-0.5 rounded text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-[#2c2f38]'
                }`}
              >
                {currentStateMeta.name}
              </button>
            </>
          )}

          {viewMode === 'county' && selectedCountyName && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400 dark:text-zinc-600 shrink-0" />
              <button
                onClick={() => setSelectedCityName(null)}
                className={`transition-colors cursor-pointer shrink-0 ${
                  !selectedCityName
                    ? 'px-2 py-0.5 rounded bg-stone-200/80 dark:bg-[#2c2f38] text-stone-900 dark:text-zinc-100 font-bold border border-stone-300 dark:border-[#3a3e4a] shadow-2xs'
                    : 'px-1.5 py-0.5 rounded text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-[#2c2f38]'
                }`}
              >
                {selectedCountyName}
              </button>
              {selectedCityName && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-stone-400 dark:text-zinc-600 shrink-0" />
                  <span className="px-2 py-0.5 rounded bg-stone-200/80 dark:bg-[#2c2f38] text-stone-900 dark:text-zinc-100 font-bold border border-stone-300 dark:border-[#3a3e4a] shadow-2xs shrink-0">
                    {selectedCityName}
                  </span>
                </>
              )}
              {!selectedCityName && (
                <span className="text-[11px] sm:text-xs text-stone-400 dark:text-zinc-500 font-normal hidden sm:inline ml-1 shrink-0">
                  ({renderedPaths.length} municipal sectors)
                </span>
              )}
            </>
          )}

          {viewMode === 'state' && (
            <span className="text-[11px] sm:text-xs text-stone-400 dark:text-zinc-500 font-normal hidden sm:inline ml-1 shrink-0">
              ({renderedPaths.length} counties)
            </span>
          )}

          {/* Interactive User Location Action Prompt */}
          {detectedUserLocation && (
            <button
              onClick={() => triggerCinematicLocationZoom(detectedUserLocation)}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-sky-300 text-xs font-bold transition-all cursor-pointer shadow-2xs group shrink-0"
              title="Jump directly to your detected local jurisdiction"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-sky-400 animate-pulse" />
              <span>
                Go to My Jurisdiction (
                {detectedUserLocation.countyName
                  ? `${detectedUserLocation.countyName.replace(/ (county|parish|borough)$/i, '')}, ${detectedUserLocation.stateCode}`
                  : detectedUserLocation.stateName}
                )
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
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
          className="flex-1 relative h-full flex items-center justify-center p-4 bg-[#fafaf9] dark:bg-[#18191c] overflow-hidden"
        >
          {/* Floating Top-Right Map Action Controls: Locate Me + Reset Overview */}
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end pointer-events-auto">
            <div className="flex items-center gap-1.5 bg-white/90 dark:bg-[#22242a]/90 backdrop-blur-md border border-stone-200 dark:border-[#2e313a] rounded-md p-1 shadow-md">
              <button
                onClick={handleLocateMe}
                disabled={isLocating}
                title="Locate my jurisdiction (Slow zoom in)"
                aria-label="Locate my jurisdiction"
                className="px-2 py-1 hover:bg-stone-100 dark:hover:bg-[#2c2f38] text-stone-700 dark:text-zinc-200 rounded transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium group"
              >
                <Crosshair className={`w-3.5 h-3.5 text-blue-900 dark:text-sky-400 ${isLocating ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`} />
                <span className="hidden sm:inline">Locate Me</span>
              </button>

              {viewMode !== 'national' && (
                <>
                  <div className="w-[1px] h-3.5 bg-stone-200 dark:bg-[#2e313a]"></div>
                  <button
                    onClick={handleZoomOutToNational}
                    title="Reset to US Overview Map"
                    aria-label="Reset to US Overview Map"
                    className="px-2 py-1 hover:bg-stone-100 dark:hover:bg-[#2c2f38] text-stone-600 dark:text-zinc-300 rounded transition-all cursor-pointer flex items-center gap-1 text-xs"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span className="hidden md:inline">US Overview</span>
                  </button>
                </>
              )}
            </div>

            {/* Active Location Notification Banner */}
            {locationMessage && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900 dark:bg-white text-white dark:text-stone-950 font-medium text-xs rounded-full shadow-lg animate-bounce">
                <Navigation className="w-3 h-3 animate-pulse" />
                <span>{locationMessage}</span>
              </div>
            )}
          </div>

          {isLoading || isCitiesLoading ? (
            <div className="text-center space-y-3 text-stone-500 dark:text-zinc-400">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-900 dark:text-sky-400" />
              <div className="space-y-1">
                <div className="text-xs font-serif font-bold text-stone-800 dark:text-zinc-200">
                  {isCitiesLoading
                    ? `Loading municipal subdivisions for ${selectedCountyName || 'County'}...`
                    : 'Loading nationwide vector topology...'}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                  Rendering high-resolution CartoColors chloropleth data
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Active Jurisdiction Floating Badge in County View */}
              {viewMode === 'county' && selectedCountyName && (
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/95 dark:bg-[#22242a]/95 backdrop-blur-md border border-stone-200 dark:border-[#2e313a] px-3.5 py-1.5 rounded-full shadow-md text-xs pointer-events-auto">
                  <MapPin className="w-3.5 h-3.5 text-blue-900 dark:text-sky-400" />
                  <span className="font-serif font-bold text-stone-900 dark:text-zinc-100">
                    {selectedCityName ? `${selectedCityName} · ${selectedCountyName}` : selectedCountyName}
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-50 dark:bg-sky-950/60 text-blue-900 dark:text-sky-300 border border-blue-200 dark:border-sky-800/60">
                    {selectedCityName ? 'Municipal Jurisdiction' : 'County Jurisdiction'}
                  </span>
                </div>
              )}

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

                {/* Background Neighboring Entities Context Layer (Real Gradients, Subdued/Toned-down) */}
                {neighborPaths && neighborPaths.length > 0 && (
                  <g className="neighboring-context-layer">
                    {neighborPaths.map((item: any) => {
                      if (!item || !item.d) return null;

                      return (
                        <path
                          key={item.id}
                          d={item.d}
                          fill={item.fill || (theme === 'dark' ? '#1c1e24' : '#ebeae7')}
                          stroke={theme === 'dark' ? '#2e313a' : '#cbd5e1'}
                          strokeWidth="0.6"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          style={{
                            opacity: theme === 'dark' ? 0.38 : 0.45,
                            filter:
                              theme === 'dark'
                                ? 'saturate(0.75) brightness(0.85)'
                                : 'saturate(0.7) brightness(0.96)',
                          }}
                          className="transition-all duration-300 cursor-pointer hover:!opacity-95 hover:!filter-none"
                          onMouseEnter={(e) => {
                            const rect = containerRef.current?.getBoundingClientRect();
                            if (item.telemetry) {
                              setHoveredFeature({
                                ...item.telemetry,
                                id: item.id,
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

                {viewMode === 'county' ? (
                  <g style={{ filter: theme === 'dark' ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.12))' }}>
                    {/* Real Census Municipal / City Subdivisions (clipped cleanly inside county outline) */}
                    <g clipPath="url(#county-boundary-clip)">
                      {renderedPaths.map((item: any) => {
                        if (!item || !item.d) return null;

                        return (
                          <path
                            key={item.id}
                            d={item.d}
                            fill={item.fill}
                            stroke={
                              item.isSelected
                                ? theme === 'dark'
                                  ? '#ffffff'
                                  : '#0f172a'
                                : theme === 'dark'
                                ? '#2e313a'
                                : '#ffffff'
                            }
                            strokeWidth={item.isSelected ? '1.8' : '0.6'}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            style={{
                              filter: item.isSelected
                                ? theme === 'dark'
                                  ? 'drop-shadow(0 0 6px rgba(255,255,255,0.85))'
                                  : 'drop-shadow(0 0 4px rgba(15,23,42,0.5))'
                                : undefined,
                            }}
                            className="transition-colors duration-150 cursor-pointer hover:opacity-90"
                            onMouseEnter={(e) => {
                              const rect = containerRef.current?.getBoundingClientRect();
                              if (item.telemetry) {
                                setHoveredFeature({
                                  ...item.telemetry,
                                  id: item.id,
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

                    {/* Highlighted Outer County Boundary */}
                    {countyOutlinePath && (
                      <path
                        d={countyOutlinePath}
                        fill="none"
                        stroke={theme === 'dark' ? '#ffffff' : '#0f172a'}
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        style={{
                          filter:
                            theme === 'dark'
                              ? 'drop-shadow(0 0 6px rgba(255,255,255,0.75))'
                              : 'drop-shadow(0 0 4px rgba(15,23,42,0.4))',
                        }}
                        className="pointer-events-none"
                      />
                    )}
                  </g>
                ) : (
                  /* National (US) or State County View */
                  <g style={{ filter: viewMode === 'state' ? (theme === 'dark' ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.12))') : undefined }}>
                    {renderedPaths.map((item: any) => {
                      if (!item || !item.d) return null;

                      return (
                        <path
                          key={item.id}
                          d={item.d}
                          fill={item.fill}
                          stroke={
                            item.isSelected
                              ? theme === 'dark'
                                ? '#ffffff'
                                : '#0f172a'
                              : theme === 'dark'
                              ? '#2e313a'
                              : '#ffffff'
                          }
                          strokeWidth={item.isSelected ? '1.8' : '0.6'}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          style={{
                            filter: item.isSelected
                              ? theme === 'dark'
                                ? 'drop-shadow(0 0 6px rgba(255,255,255,0.85))'
                                : 'drop-shadow(0 0 4px rgba(15,23,42,0.5))'
                              : undefined,
                          }}
                          className="transition-colors duration-150 cursor-pointer hover:opacity-90"
                          onMouseEnter={(e) => {
                            const rect = containerRef.current?.getBoundingClientRect();
                            if (item.telemetry) {
                              setHoveredFeature({
                                ...item.telemetry,
                                id: item.id,
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
            </>
          )}

          {/* Dynamic Editorial CartoColors Map Legend */}
          <div className="absolute bottom-4 left-4 z-10 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] shadow-sm px-3.5 py-2.5 rounded text-xs font-sans pointer-events-auto">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-zinc-400 mb-1.5 flex items-center justify-between gap-4">
              <span>{activeConfig.legendTitle}</span>
              <span className="text-[9px] text-stone-400 dark:text-zinc-500">CartoColors</span>
            </div>
            <div className="flex items-center gap-1.5">
              {activeConfig.legendStops.map((stop, sIdx) => (
                <div key={sIdx} className="flex flex-col items-center">
                  <div
                    className="w-7 h-2.5 rounded-xs border"
                    style={{ backgroundColor: stop.fill, borderColor: stop.border }}
                    title={stop.description}
                  />
                  <span className="text-[9px] text-stone-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                    {stop.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Civic Open Data Source Attribution Badge on Map */}
          <div className="absolute bottom-4 right-4 z-10 hidden sm:flex items-center gap-2 bg-white/90 dark:bg-[#22242a]/90 backdrop-blur-xs border border-stone-200 dark:border-[#2e313a] shadow-xs px-3 py-1.5 rounded text-[11px] font-mono text-stone-600 dark:text-zinc-400 pointer-events-auto">
            <span>USAspending Open Data · Prime Federal Awards</span>
            <span className="text-stone-300 dark:text-zinc-600">·</span>
            <a
              href="https://www.usaspending.gov"
              target="_blank"
              rel="noreferrer"
              title="Official US Government Spending Open Data Portal"
              className="font-bold text-stone-800 dark:text-zinc-200 hover:text-blue-900 dark:hover:text-sky-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Live Query</span>
              <ExternalLink className="w-3 h-3 text-stone-400 dark:text-zinc-500" />
            </a>
          </div>

          {/* Unified High-Density Editorial Floating Hover Tooltip (ProPublica/NYT Style) */}
          {hoveredFeature && (() => {
            // Dynamically resolve against newly updated live rendered paths so hover updates in real-time as data is pulled
            const livePath =
              renderedPaths.find((p: any) => p?.id === hoveredFeature.id || p?.name === hoveredFeature.title) ||
              neighborPaths.find((p: any) => p?.id === hoveredFeature.id || p?.name === hoveredFeature.title);

            const activeData = livePath?.telemetry
              ? { ...livePath.telemetry, x: hoveredFeature.x, y: hoveredFeature.y }
              : hoveredFeature;

            const tooltipWidth = 264; // w-66
            const estimatedTooltipHeight = 170;
            const margin = 16;

            // Flip below if close to the top of the map container
            const placeBelow = activeData.y < estimatedTooltipHeight + margin;

            // Clamp X coordinate so the tooltip never bleeds off the left or right edges
            const containerWidth = dimensions.width || 800;
            const halfWidth = tooltipWidth / 2;
            const clampedX = Math.max(
              halfWidth + margin,
              Math.min(activeData.x, containerWidth - halfWidth - margin)
            );

            const topY = placeBelow ? activeData.y + 14 : activeData.y - 14;

            return (
              <div
                className={`absolute z-50 pointer-events-none bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] shadow-xl rounded p-4 w-66 transform -translate-x-1/2 ${
                  placeBelow ? 'translate-y-0' : '-translate-y-full'
                } transition-[left,top] duration-75 ease-out`}
                style={{ left: `${clampedX}px`, top: `${topY}px` }}
              >
                <div className="font-serif text-lg font-bold text-stone-800 dark:text-zinc-100 border-b border-stone-100 dark:border-[#2e313a] pb-1.5 mb-2.5">
                  {activeData.title}
                  <div className="text-[10px] font-sans font-normal text-stone-500 dark:text-zinc-400 leading-tight mt-0.5">
                    {activeData.subtitle}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-zinc-400 font-sans font-medium">
                      {activeData.metric1.label}
                    </div>
                    <div className="text-sm text-stone-800 dark:text-zinc-200 font-medium tabular-nums">
                      {activeData.metric1.value}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-zinc-400 font-sans font-medium">
                      {activeData.metric2.label}
                    </div>
                    <div className="text-sm text-stone-800 dark:text-zinc-200 font-medium tabular-nums">
                      {activeData.metric2.value}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-zinc-400 font-sans font-medium">
                      {activeData.metric3.label}
                    </div>
                    <div
                      className={`text-sm font-bold tabular-nums ${
                        activeData.metric3.highlightColor || 'text-red-700 dark:text-rose-400'
                      }`}
                    >
                      {activeData.metric3.value}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-zinc-400 font-sans font-medium">
                      {activeData.metric4.label}
                    </div>
                    <div className="text-sm">
                      <span
                        className={`px-1 py-0.5 inline-block font-bold rounded text-xs tabular-nums ${
                          activeData.metric4.pillColor ||
                          'bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-300 border dark:border-rose-800/50'
                        }`}
                      >
                        {activeData.metric4.value}
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
          <aside className="w-full md:w-[440px] lg:w-[480px] xl:w-[520px] h-full flex-shrink-0 z-20 border-l border-stone-200 dark:border-[#2e313a] bg-white dark:bg-[#22242a] transition-all duration-200">
            {activeMetric === 'CONTRACT_CREEP' ? (
              <ContractCreepPanel {...currentGeoProps} />
            ) : (
              <div className="flex flex-col h-full items-center justify-center p-8 text-center bg-[#fafaf9] dark:bg-[#18191c] space-y-4 border-l border-stone-200 dark:border-[#2e313a] font-sans">
                <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] flex items-center justify-center text-stone-400 dark:text-zinc-500 shadow-2xs">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-bold tracking-wider">
                    COMING SOON
                  </span>
                  <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-zinc-100 pt-1">
                    Bill Diff & Volatility
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-zinc-400 font-sans max-w-xs leading-relaxed">
                    Legislative text churn analysis and congressional amendment diff tracking will be available in the next release.
                  </p>
                </div>
                <button
                  onClick={() => switchMetric('CONTRACT_CREEP')}
                  className="text-xs font-serif font-bold text-stone-800 dark:text-zinc-300 underline hover:text-stone-900 hover:dark:text-zinc-100 cursor-pointer pt-2"
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



