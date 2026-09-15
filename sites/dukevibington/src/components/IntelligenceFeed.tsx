import React, { useState } from 'react';
import { CivicIntelligenceData } from '../types/civic';
import { GovernmentBuilding } from '../types/buildings';
import { RepresentativeCard } from './cards/RepresentativeCard';
import { VotingRecordCard } from './cards/VotingRecordCard';
import { LegislationCard } from './cards/LegislationCard';
import { PublicMeetingsCard } from './cards/PublicMeetingsCard';
import { CivicUpdatesCard } from './cards/CivicUpdatesCard';
import { DataTransparencyCard } from './cards/DataTransparencyCard';
import { BuildingInspectorCard } from './cards/BuildingInspectorCard';
import { BoardGamePiece } from './pieces/BoardGamePiece';
import {
  Users,
  Vote,
  Calendar,
  Bell,
  ShieldCheck,
  Search,
  Building2,
  Sparkles,
} from 'lucide-react';

interface IntelligenceFeedProps {
  data: CivicIntelligenceData;
  buildings: GovernmentBuilding[];
  selectedBuilding: GovernmentBuilding | null;
  onSelectBuilding: (building: GovernmentBuilding | null) => void;
  isLoading?: boolean;
}

type TabType = 'buildings' | 'representatives' | 'legislation' | 'meetings' | 'updates' | 'transparency';

export const IntelligenceFeed: React.FC<IntelligenceFeedProps> = ({
  data,
  buildings,
  selectedBuilding,
  onSelectBuilding,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('buildings');
  const [filterQuery, setFilterQuery] = useState('');

  const tabs: Array<{
    id: TabType;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }> = [
    {
      id: 'buildings',
      label: '3D Game Pieces',
      icon: <Sparkles className="w-4 h-4 text-indigo-400" />,
      count: buildings.length,
    },
    {
      id: 'representatives',
      label: 'Officials',
      icon: <Users className="w-4 h-4" />,
      count: data.representatives.length,
    },
    {
      id: 'legislation',
      label: 'Votes & Bills',
      icon: <Vote className="w-4 h-4" />,
      count: data.recentVotes.length + data.sponsoredBills.length,
    },
    {
      id: 'meetings',
      label: 'Agendas',
      icon: <Calendar className="w-4 h-4" />,
      count: data.upcomingMeetings.length,
    },
    {
      id: 'updates',
      label: 'Filings',
      icon: <Bell className="w-4 h-4" />,
      count: data.civicBulletins.length,
    },
    {
      id: 'transparency',
      label: 'Sources',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
  ];

  // Filtered collections
  const filteredBuildings = buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      b.typeLabel.toLowerCase().includes(filterQuery.toLowerCase()) ||
      b.occupants.some((occ) => occ.toLowerCase().includes(filterQuery.toLowerCase()))
  );

  const filteredReps = data.representatives.filter(
    (r) =>
      r.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      r.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
      r.party.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const filteredVotes = data.recentVotes.filter(
    (v) =>
      v.billTitle.toLowerCase().includes(filterQuery.toLowerCase()) ||
      v.billNumber.toLowerCase().includes(filterQuery.toLowerCase()) ||
      v.category.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const filteredBills = data.sponsoredBills.filter(
    (b) =>
      b.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
      b.billNumber.toLowerCase().includes(filterQuery.toLowerCase()) ||
      b.policyArea.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const filteredMeetings = data.upcomingMeetings.filter(
    (m) =>
      m.bodyName.toLowerCase().includes(filterQuery.toLowerCase()) ||
      m.meetingType.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const filteredBulletins = data.civicBulletins.filter(
    (b) =>
      b.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
      b.type.toLowerCase().includes(filterQuery.toLowerCase()) ||
      b.entity.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Feed Header & Category Tabs */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 sm:px-6 pt-4 pb-0 flex-shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Civic Intelligence Feed</span>
              <span className="text-xs font-mono font-normal uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                {data.activeLevel} Level
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              {data.location.city}, {data.location.stateCode} · {data.location.county}
            </p>
          </div>

          {/* Filter */}
          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter feed..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg py-1 pl-8 pr-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800/80 -mb-px no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-medium ${
                      isActive
                        ? 'bg-indigo-900/80 text-indigo-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Feed Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* If a building piece is clicked on the map, show inspector card at top of feed */}
        {selectedBuilding && (
          <BuildingInspectorCard
            building={selectedBuilding}
            onClose={() => onSelectBuilding(null)}
          />
        )}

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <div className="inline-block w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs">Fetching verified public intelligence records...</p>
          </div>
        ) : (
          <>
            {/* TAB: 3D Board Game Building Pieces */}
            {activeTab === 'buildings' && (
              <div className="space-y-4">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>
                    Showing {filteredBuildings.length} key civic landmarks coded as 3D tabletop pieces.
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {filteredBuildings.map((bldg) => {
                    const isSelected = selectedBuilding?.id === bldg.id;
                    return (
                      <div
                        key={bldg.id}
                        onClick={() => onSelectBuilding(bldg)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 ${
                          isSelected
                            ? 'bg-slate-900 border-indigo-500 shadow-xl ring-1 ring-indigo-500/50'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="p-1 bg-slate-950 rounded-lg border border-slate-800 flex-shrink-0">
                          <BoardGamePiece
                            type={bldg.type}
                            size={44}
                            showPedestal={false}
                            isSelected={isSelected}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                              {bldg.typeLabel}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {bldg.jurisdictionLevel.toUpperCase()}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white truncate">{bldg.name}</h4>
                          <p className="text-xs text-slate-400 truncate">{bldg.address}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: Representatives */}
            {activeTab === 'representatives' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Showing {filteredReps.length} elected official
                    {filteredReps.length === 1 ? '' : 's'} with jurisdiction over your address.
                  </span>
                </div>
                {filteredReps.length === 0 ? (
                  <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                    No representatives matched your filter.
                  </div>
                ) : (
                  filteredReps.map((rep) => <RepresentativeCard key={rep.id} rep={rep} />)
                )}
              </div>
            )}

            {/* TAB: Votes & Legislation */}
            {activeTab === 'legislation' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Vote className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">Recent Roll-Call Votes</h3>
                  </div>
                  {filteredVotes.length === 0 ? (
                    <div className="p-6 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                      No roll-call voting records found matching query.
                    </div>
                  ) : (
                    filteredVotes.map((vote) => <VotingRecordCard key={vote.id} vote={vote} />)
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">Sponsored & Introduced Bills</h3>
                  </div>
                  {filteredBills.length === 0 ? (
                    <div className="p-6 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                      No sponsored bills found matching query.
                    </div>
                  ) : (
                    filteredBills.map((bill) => <LegislationCard key={bill.id} bill={bill} />)
                  )}
                </div>
              </div>
            )}

            {/* TAB: Meetings & Agendas */}
            {activeTab === 'meetings' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Upcoming public sessions with open citizen comment periods.</span>
                </div>
                {filteredMeetings.length === 0 ? (
                  <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                    No scheduled public meetings found for this jurisdiction level.
                  </div>
                ) : (
                  filteredMeetings.map((meet) => <PublicMeetingsCard key={meet.id} meeting={meet} />)
                )}
              </div>
            )}

            {/* TAB: Filings & Bulletins */}
            {activeTab === 'updates' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Audits, campaign finance disclosures, and regulatory notices.</span>
                </div>
                {filteredBulletins.length === 0 ? (
                  <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                    No recent civic filings found.
                  </div>
                ) : (
                  filteredBulletins.map((bulletin) => (
                    <CivicUpdatesCard key={bulletin.id} bulletin={bulletin} />
                  ))
                )}
              </div>
            )}

            {/* TAB: Data Transparency */}
            {activeTab === 'transparency' && (
              <div className="space-y-4">
                <DataTransparencyCard transparency={data.transparency} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
