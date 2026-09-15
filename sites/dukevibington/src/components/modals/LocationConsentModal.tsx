import React, { useState } from 'react';
import { LocationContext } from '../../types/civic';
import { FEATURED_PRESETS, getCurrentPosition, reverseGeocode, searchAddress } from '../../services/geocodingService';
import { MapPin, Navigation, ShieldCheck, Search, Loader2, Sparkles, Building2 } from 'lucide-react';

interface LocationConsentModalProps {
  isOpen: boolean;
  onSelectLocation: (loc: LocationContext) => void;
  onClose?: () => void;
}

export const LocationConsentModal: React.FC<LocationConsentModalProps> = ({
  isOpen,
  onSelectLocation,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationContext[]>([]);
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUseMyLocation = async () => {
    setIsLoadingGeo(true);
    setGeoError(null);
    try {
      const coords = await getCurrentPosition();
      const loc = await reverseGeocode(coords.lat, coords.lng);
      onSelectLocation(loc);
    } catch (err: any) {
      console.error(err);
      setGeoError(
        err.message || 'Unable to retrieve your location. Please enter your city or ZIP code below.'
      );
    } finally {
      setIsLoadingGeo(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchAddress(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 text-indigo-400 mb-1">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Explore Your Civic Representation
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Non-partisan intelligence on elected officials, council votes, county boards, and public meetings for your community.
          </p>
        </div>

        {/* Primary Action: Use Geolocation */}
        <div className="space-y-3">
          <button
            onClick={handleUseMyLocation}
            disabled={isLoadingGeo}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.99]"
          >
            {isLoadingGeo ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Detecting Local Jurisdiction...
              </>
            ) : (
              <>
                <Navigation className="w-5 h-5" />
                Use My Current Location
              </>
            )}
          </button>

          {geoError && (
            <div className="text-xs text-rose-400 bg-rose-950/50 border border-rose-800/60 p-2.5 rounded-lg text-center">
              {geoError}
            </div>
          )}

          {/* Privacy Guarantee */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>100% Client-Side Privacy: Location is never stored or tracked.</span>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 text-xs text-slate-500 uppercase tracking-widest font-mono">
          <div className="flex-1 h-px bg-slate-800"></div>
          <span>Or search manually</span>
          <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter City, State, or ZIP code (e.g., Austin, TX or 61820)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-24 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="absolute right-1.5 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg transition-colors"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
            </button>
          </div>

          {/* Search suggestions dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-slate-800 rounded-xl shadow-xl overflow-hidden z-20 max-h-48 overflow-y-auto">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectLocation(result)}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-200 hover:bg-slate-800/80 border-b border-slate-900 last:border-0 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium">{result.displayName}</span>
                  <span className="text-[11px] text-indigo-400 font-mono">Select</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Preset quick-picks */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Quick Demo Locations
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FEATURED_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectLocation(preset.context)}
                className="text-left p-2.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 rounded-xl transition-all group"
              >
                <div className="font-medium text-xs text-slate-200 group-hover:text-indigo-300">
                  {preset.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate">{preset.context.stateCode} · Dist {preset.context.congressionalDistrict}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
