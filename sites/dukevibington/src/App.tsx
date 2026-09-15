import React, { useState, useEffect, useCallback } from 'react';
import { CivicIntelligenceData, JurisdictionLevel, LocationContext } from './types/civic';
import { FEATURED_PRESETS, reverseGeocode } from './services/geocodingService';
import { fetchCivicIntelligence } from './services/civicDataService';
import { HeaderBar } from './components/HeaderBar';
import { JurisdictionLevelBar } from './components/JurisdictionLevelBar';
import { CivicMapContainer } from './components/CivicMapContainer';
import { IntelligenceFeed } from './components/IntelligenceFeed';
import { LocationConsentModal } from './components/modals/LocationConsentModal';
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChevronUp,
  ChevronDown,
  Layers,
  Sparkles,
} from 'lucide-react';

export function App() {
  // State from URL or initial preset
  const [location, setLocation] = useState<LocationContext>(FEATURED_PRESETS[0].context);
  const [activeLevel, setActiveLevel] = useState<JurisdictionLevel>('local');
  const [data, setData] = useState<CivicIntelligenceData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);

  // Desktop sidebar collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Mobile Bottom Sheet state: 'peek' | 'full' | 'collapsed'
  const [mobileSheetState, setMobileSheetState] = useState<'peek' | 'full' | 'collapsed'>('peek');

  // Initialize from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLevel = params.get('level') as JurisdictionLevel | null;
    const urlLat = params.get('lat');
    const urlLng = params.get('lng');

    if (urlLat && urlLng) {
      const lat = parseFloat(urlLat);
      const lng = parseFloat(urlLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        reverseGeocode(lat, lng).then((resolvedLoc) => {
          setLocation(resolvedLoc);
        });
      }
    } else {
      // First-time visit: show lightweight onboarding modal
      const hasVisited = sessionStorage.getItem('civic_visited');
      if (!hasVisited) {
        setShowLocationModal(true);
        sessionStorage.setItem('civic_visited', 'true');
      }
    }

    if (urlLevel && ['local', 'county', 'state', 'federal'].includes(urlLevel)) {
      setActiveLevel(urlLevel);
    }
  }, []);

  // Update URL parameters without reload
  const updateURL = useCallback((lvl: JurisdictionLevel, loc: LocationContext) => {
    const params = new URLSearchParams();
    params.set('level', lvl);
    params.set('lat', loc.lat.toFixed(4));
    params.set('lng', loc.lng.toFixed(4));
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newURL);
  }, []);

  // Fetch Civic Data whenever location or activeLevel changes
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetchCivicIntelligence(activeLevel, location).then((result) => {
      if (isMounted) {
        setData(result);
        setIsLoading(false);
      }
    });

    updateURL(activeLevel, location);

    return () => {
      isMounted = false;
    };
  }, [activeLevel, location, updateURL]);

  const handleLocationChange = (newLoc: LocationContext) => {
    setLocation(newLoc);
    setShowLocationModal(false);
  };

  const handleLevelChange = (newLevel: JurisdictionLevel) => {
    setActiveLevel(newLevel);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Header Bar */}
      <HeaderBar
        currentLocation={location}
        onLocationChange={handleLocationChange}
        onOpenLocationModal={() => setShowLocationModal(true)}
      />

      {/* 2. 4-Tier Jurisdiction Switcher & Breadcrumbs */}
      <JurisdictionLevelBar
        activeLevel={activeLevel}
        onSelectLevel={handleLevelChange}
        breadcrumbs={data ? data.breadcrumbs : []}
      />

      {/* 3. Main Split-Screen Workspace */}
      <main className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* Left Side (Desktop: 55% or 100% when collapsed / Mobile: Full Background Map) */}
        <div
          className={`relative h-full transition-all duration-300 ${
            isSidebarCollapsed ? 'w-full' : 'w-full md:w-[55%]'
          }`}
        >
          {data && (
            <CivicMapContainer
              location={location}
              activeLevel={activeLevel}
              boundaryGeoJSON={data.boundaryGeoJSON}
            />
          )}

          {/* Desktop Toggle Button to Expand / Collapse Feed */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex absolute top-4 right-4 z-20 items-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white px-3 py-2 rounded-xl border border-slate-700/80 shadow-2xl transition-all text-xs font-semibold backdrop-blur-md"
            title={isSidebarCollapsed ? 'Show Intelligence Feed' : 'Expand Map'}
          >
            {isSidebarCollapsed ? (
              <>
                <PanelLeftOpen className="w-4 h-4 text-indigo-400" />
                <span>Show Panel</span>
              </>
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 text-indigo-400" />
                <span>Expand Map</span>
              </>
            )}
          </button>
        </div>

        {/* Right Side (Desktop: 45% Feed Panel / Mobile: Hidden in split mode, rendered in bottom-sheet) */}
        {!isSidebarCollapsed && (
          <div className="hidden md:flex md:w-[45%] h-full border-l border-slate-800/90 flex-col bg-slate-950 z-10 shadow-2xl">
            {data && <IntelligenceFeed data={data} isLoading={isLoading} />}
          </div>
        )}

        {/* Mobile Pull-Up Drawer / Bottom Sheet */}
        <div
          className={`md:hidden absolute inset-x-0 bottom-0 z-30 flex flex-col bg-slate-950/95 border-t border-slate-800 rounded-t-2xl shadow-2xl backdrop-blur-xl transition-all duration-300 ease-in-out ${
            mobileSheetState === 'full'
              ? 'h-[90%]'
              : mobileSheetState === 'peek'
              ? 'h-[46%]'
              : 'h-14'
          }`}
        >
          {/* Mobile Drawer Grab Bar & Header */}
          <div
            onClick={() => {
              if (mobileSheetState === 'collapsed') setMobileSheetState('peek');
              else if (mobileSheetState === 'peek') setMobileSheetState('full');
              else setMobileSheetState('peek');
            }}
            className="w-full py-2.5 px-4 flex flex-col items-center justify-center cursor-pointer border-b border-slate-800/60 flex-shrink-0 select-none"
          >
            <div className="w-10 h-1 bg-slate-700 rounded-full mb-1.5"></div>
            <div className="flex items-center justify-between w-full text-xs font-bold text-slate-200">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                {activeLevel.toUpperCase()} Intelligence Feed ({location.city})
              </span>
              <div className="flex items-center gap-1 text-slate-400">
                {mobileSheetState === 'full' ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </div>
            </div>
          </div>

          {/* Feed Content in Mobile Drawer */}
          <div className="flex-1 overflow-hidden">
            {data && <IntelligenceFeed data={data} isLoading={isLoading} />}
          </div>
        </div>
      </main>

      {/* 4. First-Time Location Consent & Address Modal */}
      <LocationConsentModal
        isOpen={showLocationModal}
        onSelectLocation={handleLocationChange}
        onClose={() => setShowLocationModal(false)}
      />
    </div>
  );
}
export default App;
