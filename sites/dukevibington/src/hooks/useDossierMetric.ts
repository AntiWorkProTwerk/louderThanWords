import { useState, useMemo, useCallback } from 'react';
import { DossierMetricType, DossierMetricConfig } from '../types/dossier';

export const DOSSIER_METRICS: Record<DossierMetricType, DossierMetricConfig> = {
  CONTRACT_CREEP: {
    id: 'CONTRACT_CREEP',
    label: 'Contract Creep',
    shortName: 'Creep %',
    categoryLabel: 'Procurement Churn',
    description: 'Calculates obligation and ceiling growth between Day 1 award (Mod 0) and current funded total.',
    source: 'USAspending.gov API',
    sourceUrl: 'https://api.usaspending.gov',
    unit: '% Creep',
    legendTitle: 'Contract Creep Severity',
    legendStops: [
      { label: '0%', range: '0%', fill: '#E5E7EB', border: '#D1D5DB', description: 'Fixed Price / Baseline' },
      { label: '1-15%', range: '1% – 15%', fill: '#FED7AA', border: '#FDBA74', description: 'Standard Growth' },
      { label: '16-35%', range: '16% – 35%', fill: '#FB923C', border: '#F97316', description: 'Elevated Modifications' },
      { label: '36-75%', range: '36% – 75%', fill: '#DC2626', border: '#B91C1C', description: 'Severe Cost Creep' },
      { label: '75%+', range: '75%+', fill: '#7F1D1D', border: '#5E1414', description: 'Critical Scope Churn' },
    ],
  },
  BILL_DIFF: {
    id: 'BILL_DIFF',
    label: 'Bill Diff & Volatility',
    shortName: 'Rewrite %',
    categoryLabel: 'Legislative Churn',
    description: 'Measures text volatility and section rewrites between bill introduction and final enactment.',
    source: 'Congress.gov & GovInfo API',
    sourceUrl: 'https://api.congress.gov',
    unit: '% Volatility',
    legendTitle: 'Bill Volatility / Rewrite Index',
    legendStops: [
      { label: '0-15%', range: '0% – 15%', fill: '#E5E7EB', border: '#D1D5DB', description: 'Pristine / Low Churn' },
      { label: '16-35%', range: '16% – 35%', fill: '#FED7AA', border: '#FDBA74', description: 'Minor Amendments' },
      { label: '36-55%', range: '36% – 55%', fill: '#FB923C', border: '#F97316', description: 'Substantial Revisions' },
      { label: '56-75%', range: '56% – 75%', fill: '#DC2626', border: '#B91C1C', description: 'Major Rewrites' },
      { label: '76%+', range: '76%+', fill: '#7F1D1D', border: '#5E1414', description: 'Omnibus Substitutions' },
    ],
  },
};

export function useDossierMetric(initialMetric: DossierMetricType = 'CONTRACT_CREEP') {
  const [activeMetric, setActiveMetric] = useState<DossierMetricType>(initialMetric);

  const activeConfig = useMemo(() => DOSSIER_METRICS[activeMetric], [activeMetric]);

  const switchMetric = useCallback((metric: DossierMetricType) => {
    setActiveMetric(metric);
  }, []);

  return {
    activeMetric,
    activeConfig,
    switchMetric,
    availableMetrics: Object.values(DOSSIER_METRICS),
  };
}
