export type JurisdictionLevel = 'local' | 'county' | 'state' | 'federal';

export interface LocationContext {
  lat: number;
  lng: number;
  displayName: string;
  city: string;
  county: string;
  state: string;
  stateCode: string;
  zip: string;
  congressionalDistrict: string;
  municipalWard?: string;
  formattedAddress?: string;
}

export interface Representative {
  id: string;
  name: string;
  title: string;
  role: string;
  chamber?: string;
  jurisdictionLevel: JurisdictionLevel;
  party: 'Nonpartisan' | 'Democratic' | 'Republican' | 'Independent' | string;
  photoUrl: string;
  termStart: string;
  termEnd: string;
  nextElection: string;
  phone: string;
  email: string;
  websiteUrl: string;
  officeAddress: string;
  socialHandles?: {
    twitter?: string;
    bluesky?: string;
    facebook?: string;
  };
  committeeAssignments: string[];
  sponsoredBillsCount: number;
  coSponsoredBillsCount: number;
  votingAttendanceRate: number; // percentage, e.g. 98.4
  biography: string;
}

export interface VoteRecord {
  id: string;
  billNumber: string;
  billTitle: string;
  billUrl: string;
  date: string;
  chamber: string;
  vote: 'Yea' | 'Nay' | 'Abstain' | 'Present' | 'Not Voting';
  result: 'Passed' | 'Failed' | 'Pending' | 'Enacted';
  nonPartisanSummary: string;
  category: 'Budget & Tax' | 'Infrastructure' | 'Public Safety' | 'Environment' | 'Healthcare' | 'Zoning' | 'Governance' | 'Education' | string;
  breakdown: {
    yea: number;
    nay: number;
    abstain?: number;
  };
  representativeVoted?: string;
}

export interface SponsoredBill {
  id: string;
  billNumber: string;
  title: string;
  introducedDate: string;
  status: 'Introduced' | 'In Committee' | 'Passed Chamber' | 'Enacted' | 'Vetoed';
  statusDate: string;
  summary: string;
  primarySponsor: string;
  coSponsorsCount: number;
  policyArea: string;
  fullTextUrl: string;
}

export interface PublicMeeting {
  id: string;
  bodyName: string;
  meetingType: 'Regular Meeting' | 'Work Session' | 'Special Meeting' | 'Public Hearing' | 'Board Session';
  date: string;
  time: string;
  location: string;
  isVirtual: boolean;
  streamUrl?: string;
  agendaUrl?: string;
  packetUrl?: string;
  minutesUrl?: string;
  publicCommentProcedure: string;
  agendaHighlights: string[];
}

export interface CivicBulletin {
  id: string;
  title: string;
  type: 'Public Notice' | 'Campaign Finance' | 'Audit / Inspection' | 'Regulatory Filing' | 'Executive Order';
  date: string;
  entity: string;
  summary: string;
  keyTakeaways: string[];
  sourceUrl: string;
  amountOrMetric?: string;
}

export interface DataSourceAttribution {
  name: string;
  url: string;
  agency: string;
  dataset: string;
  updateFrequency: string;
}

export interface TransparencyMetadata {
  jurisdictionLevel: JurisdictionLevel;
  primarySources: DataSourceAttribution[];
  lastUpdated: string;
  dataAccuracyStatus: 'Verified Public Record' | 'Official Open Data Feed' | 'Mock Demonstration Dataset';
  verificationNotes: string;
  apiEndpointsUsed: string[];
}

export interface BreadcrumbItem {
  level: JurisdictionLevel;
  label: string;
  shortName: string;
  subtitle: string;
}

export interface CivicIntelligenceData {
  location: LocationContext;
  activeLevel: JurisdictionLevel;
  breadcrumbs: BreadcrumbItem[];
  representatives: Representative[];
  recentVotes: VoteRecord[];
  sponsoredBills: SponsoredBill[];
  upcomingMeetings: PublicMeeting[];
  civicBulletins: CivicBulletin[];
  transparency: TransparencyMetadata;
  boundaryGeoJSON: GeoJSON.FeatureCollection | GeoJSON.Feature;
}
