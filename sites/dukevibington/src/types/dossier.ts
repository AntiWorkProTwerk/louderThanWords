export type DossierMetricType = 'CONTRACT_CREEP' | 'BILL_DIFF';

export interface DossierMetricConfig {
  id: DossierMetricType;
  label: string;
  shortName: string;
  categoryLabel: string;
  description: string;
  source: string;
  sourceUrl: string;
  unit: string;
  legendTitle: string;
  legendStops: {
    label: string;
    range: string;
    fill: string;
    border: string;
    description: string;
  }[];
}

export interface DossierHoverTelemetry {
  id?: string;
  title: string;
  subtitle: string;
  badgeLabel?: string;
  metric1: { label: string; value: string };
  metric2: { label: string; value: string };
  metric3: { label: string; value: string; isHighlight?: boolean; highlightColor?: string };
  metric4: { label: string; value: string; isPill?: boolean; pillColor?: string };
  category: string;
  x: number;
  y: number;
}

export interface DossierMapPolygonFeature {
  id: string;
  name: string;
  code: string;
  d: string;
  isSelected: boolean;
  fill: string;
  hoverFill: string;
  category: string;
  telemetry: DossierHoverTelemetry;
  rawMetricValue: number;
  feature?: any;
  onClick: () => void;
  onDoubleClick: (e: any) => void;
}

// Bill Diff Specific Data Types
export type LegislativeStage =
  | 'introduced'
  | 'reported'
  | 'passed_chamber'
  | 'enrolled';

export interface BillVersionItem {
  stage: LegislativeStage;
  stageName: string;
  chamber: 'House' | 'Senate' | 'Joint';
  versionCode: string; // e.g., "IH", "RH", "EAS", "ENR"
  actionDate: string;
  wordCount: number;
  sectionCount: number;
  govInfoPackageId?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  fullText?: string;
}

export interface BillDiffChunk {
  type: 'unchanged' | 'added' | 'deleted';
  text: string;
  sectionTitle?: string;
}

export interface BillMetadataItem {
  id: string; // e.g., "118-hr-1"
  congress: number;
  billType: 'hr' | 's' | 'hjres' | 'sjres';
  billNumber: number;
  displayNumber: string; // e.g., "H.R. 1"
  title: string;
  shortTitle: string;
  sponsorName: string;
  sponsorParty: 'D' | 'R' | 'I';
  sponsorState: string;
  sponsorDistrict?: string;
  introducedDate: string;
  latestActionDate: string;
  latestActionText: string;
  policyArea: string;
  volatilityScore: number; // 0 - 100% Rewrite Index
  initialWordCount: number;
  currentWordCount: number;
  wordsAdded: number;
  wordsDeleted: number;
  versions: BillVersionItem[];
  diffSummary?: {
    sectionsAltered: number;
    majorSubstitutions: number;
    earmarkCount?: number;
  };
}
