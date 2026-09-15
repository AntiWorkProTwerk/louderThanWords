import React, { useState, useEffect, useRef } from 'react';
import { LocationContext } from '../types/civic';
import { searchAddress, getCurrentPosition, reverseGeocode, FEATURED_PRESETS } from '../services/geocodingService';
import {
  Building2,
  Search,
  Navigation,
  ShieldCheck,
  ChevronDown,
  Loader2,
  ExternalLink,
  MapPin,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Database,
} from 'lucide-react';

interface HeaderBarProps {
  currentLocation: LocationContext;
  onLocationChange: (loc: LocationContext) => void;
  onOpenLocationModal: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentLocation,
  onLocationChange,
  onOpenLocationModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<LocationContext[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const googleApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_CIVIC_API_KEY) as string | undefined;
  const isGoogleConnected = Boolean(googleApiKey && googleApiKey.trim().length > 10 && !googleApiKey.includes('YourActualKey'));

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchAddress(searchQuery);
        setSuggestions(results);
        setShowDropdown(true);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLocateMe = async () => {
    setIsLocating(true);
    try {
      const coords = await getCurrentPosition();
      const loc = await reverseGeocode(coords.lat, coords.lng);
      onLocationChange(loc);
    } catch (e) {
      console.warn('Geolocation error:', e);
      onOpenLocationModal();
    } finally {
      setIsLocating(false);
    }
  };

  const handleSelectSuggestion = (loc: LocationContext) => {
    onLocationChange(loc);
    setSearchQuery('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  return (
    <header className="h-16 bg-slate-950/95 border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-40 backdrop-blur-md">
      {/* Brand & Root Link */}
      <div className="flex items-center gap-3">
        <a
          href="/"
          className="text-xs text-slate-400 hover:text-slate-200 hidden md:inline-flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-1 rounded-md transition-colors"
          title="Return to louderthanwords.fyi"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>Home</span>
        </a>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-sm sm:text-base tracking-tight">CivicPulse</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 rounded">
                DukeVibington
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">Non-Partisan Public Intelligence</div>
          </div>
        </div>
      </div>

      {/* Center: Search & Location Switcher */}
      <div className="flex-1 max-w-lg relative" ref={dropdownRef}>
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            placeholder={`Search US address, city, or ZIP (Current: ${currentLocation.city}, ${currentLocation.stateCode})...`}
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl py-1.5 pl-9 pr-24 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />

          <button
            onClick={handleLocateMe}
            disabled={isLocating}
            title="Detect location automatically"
            className="absolute right-1.5 inline-flex items-center gap-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded-lg border border-slate-700 transition-colors"
          >
            {isLocating ? (
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            ) : (
              <Navigation className="w-3 h-3 text-indigo-400" />
            )}
            <span className="hidden sm:inline">GPS</span>
          </button>
        </div>

        {/* Dropdown Suggestions */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto">
            {isSearching && (
              <div className="p-3 text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                Searching nationwide open geocoding records...
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Matches & Addresses
                </div>
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSuggestion(s)}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-indigo-600/20 hover:text-white flex items-center gap-2.5 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    <div className="truncate flex-1">
                      <span className="font-semibold text-slate-100">{s.city}, {s.stateCode}</span>
                      <span className="text-[11px] text-slate-400 ml-1.5">({s.county} · Dist {s.congressionalDistrict})</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Quick presets in dropdown */}
            <div className="border-t border-slate-800 p-2 bg-slate-950/40">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider px-2 mb-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Demo Presets
              </div>
              <div className="grid grid-cols-2 gap-1">
                {FEATURED_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(p.context)}
                    className="text-left px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 text-[11px] text-slate-300 hover:text-white truncate border border-slate-800/80 transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Side: Live API Status & Privacy */}
      <div className="flex items-center gap-2">
        {/* API Status Badge */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-slate-900 border-slate-800">
          <span className={`w-2 h-2 rounded-full ${isGoogleConnected ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'}`}></span>
          <span className="text-[11px] font-mono text-slate-300">
            {isGoogleConnected ? 'Google APIs Live' : 'Open Standards'}
          </span>
        </div>

        {/* Privacy Popover */}
        <div className="relative">
          <button
            onClick={() => setShowPrivacyNotice(!showPrivacyNotice)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg transition-colors"
            title="Privacy and caching info"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">24hr Cache</span>
          </button>

          {showPrivacyNotice && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 shadow-2xl z-50 space-y-2.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Zero-Tracking & Compliant Caching
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Queries are cached client-side and at the Cloudflare edge for 24 hours to maximize performance and respect public API quotas.
              </p>
              <div className="space-y-1 text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono">
                <div className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> US Census TIGERweb (Live)
                </div>
                <div className="text-indigo-400 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Google Civic & Maps ({isGoogleConnected ? 'Active' : 'Standby'})
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
