export interface StateCreepAggregate {
  fips: string;
  stateCode: string;
  stateName: string;
  initialObligation: number;
  currentObligation: number;
  dollarCreep: number;
  percentCreep: number;
  activeContractsCount: number;
}

// Realistic state-level aggregate contract creep data based on historical federal procurement distribution
export const STATE_CREEP_DATA: Record<string, StateCreepAggregate> = {
  '01': { fips: '01', stateCode: 'AL', stateName: 'Alabama', initialObligation: 4800000000, currentObligation: 6816000000, dollarCreep: 2016000000, percentCreep: 42.0, activeContractsCount: 1420 },
  '02': { fips: '02', stateCode: 'AK', stateName: 'Alaska', initialObligation: 1500000000, currentObligation: 1920000000, dollarCreep: 420000000, percentCreep: 28.0, activeContractsCount: 480 },
  '04': { fips: '04', stateCode: 'AZ', stateName: 'Arizona', initialObligation: 6200000000, currentObligation: 8556000000, dollarCreep: 2356000000, percentCreep: 38.0, activeContractsCount: 1890 },
  '05': { fips: '05', stateCode: 'AR', stateName: 'Arkansas', initialObligation: 1100000000, currentObligation: 1232000000, dollarCreep: 132000000, percentCreep: 12.0, activeContractsCount: 410 },
  '06': { fips: '06', stateCode: 'CA', stateName: 'California', initialObligation: 28500000000, currentObligation: 51870000000, dollarCreep: 23370000000, percentCreep: 82.0, activeContractsCount: 6540 },
  '08': { fips: '08', stateCode: 'CO', stateName: 'Colorado', initialObligation: 7400000000, currentObligation: 11692000000, dollarCreep: 4292000000, percentCreep: 58.0, activeContractsCount: 2210 },
  '09': { fips: '09', stateCode: 'CT', stateName: 'Connecticut', initialObligation: 14200000000, currentObligation: 26838000000, dollarCreep: 12638000000, percentCreep: 89.0, activeContractsCount: 1650 },
  '10': { fips: '10', stateCode: 'DE', stateName: 'Delaware', initialObligation: 750000000, currentObligation: 810000000, dollarCreep: 60000000, percentCreep: 8.0, activeContractsCount: 290 },
  '11': { fips: '11', stateCode: 'DC', stateName: 'District of Columbia', initialObligation: 18900000000, currentObligation: 31752000000, dollarCreep: 12852000000, percentCreep: 68.0, activeContractsCount: 4120 },
  '12': { fips: '12', stateCode: 'FL', stateName: 'Florida', initialObligation: 11800000000, currentObligation: 17228000000, dollarCreep: 5428000000, percentCreep: 46.0, activeContractsCount: 3890 },
  '13': { fips: '13', stateCode: 'GA', stateName: 'Georgia', initialObligation: 6800000000, currentObligation: 8704000000, dollarCreep: 1904000000, percentCreep: 28.0, activeContractsCount: 2150 },
  '15': { fips: '15', stateCode: 'HI', stateName: 'Hawaii', initialObligation: 2900000000, currentObligation: 3886000000, dollarCreep: 986000000, percentCreep: 34.0, activeContractsCount: 890 },
  '16': { fips: '16', stateCode: 'ID', stateName: 'Idaho', initialObligation: 1400000000, currentObligation: 1596000000, dollarCreep: 196000000, percentCreep: 14.0, activeContractsCount: 450 },
  '17': { fips: '17', stateCode: 'IL', stateName: 'Illinois', initialObligation: 8200000000, currentObligation: 12136000000, dollarCreep: 3936000000, percentCreep: 48.0, activeContractsCount: 2680 },
  '18': { fips: '18', stateCode: 'IN', stateName: 'Indiana', initialObligation: 4100000000, currentObligation: 5248000000, dollarCreep: 1148000000, percentCreep: 28.0, activeContractsCount: 1320 },
  '19': { fips: '19', stateCode: 'IA', stateName: 'Iowa', initialObligation: 1200000000, currentObligation: 1260000000, dollarCreep: 60000000, percentCreep: 5.0, activeContractsCount: 390 },
  '20': { fips: '20', stateCode: 'KS', stateName: 'Kansas', initialObligation: 2100000000, currentObligation: 2583000000, dollarCreep: 483000000, percentCreep: 23.0, activeContractsCount: 780 },
  '21': { fips: '21', stateCode: 'KY', stateName: 'Kentucky', initialObligation: 3200000000, currentObligation: 3872000000, dollarCreep: 672000000, percentCreep: 21.0, activeContractsCount: 960 },
  '22': { fips: '22', stateCode: 'LA', stateName: 'Louisiana', initialObligation: 3600000000, currentObligation: 4752000000, dollarCreep: 1152000000, percentCreep: 32.0, activeContractsCount: 1140 },
  '23': { fips: '23', stateCode: 'ME', stateName: 'Maine', initialObligation: 3900000000, currentObligation: 6864000000, dollarCreep: 2964000000, percentCreep: 76.0, activeContractsCount: 720 },
  '24': { fips: '24', stateCode: 'MD', stateName: 'Maryland', initialObligation: 21500000000, currentObligation: 38485000000, dollarCreep: 16985000000, percentCreep: 79.0, activeContractsCount: 5200 },
  '25': { fips: '25', stateCode: 'MA', stateName: 'Massachusetts', initialObligation: 12400000000, currentObligation: 21576000000, dollarCreep: 9176000000, percentCreep: 74.0, activeContractsCount: 2980 },
  '26': { fips: '26', stateCode: 'MI', stateName: 'Michigan', initialObligation: 4900000000, currentObligation: 6174000000, dollarCreep: 1274000000, percentCreep: 26.0, activeContractsCount: 1640 },
  '27': { fips: '27', stateCode: 'MN', stateName: 'Minnesota', initialObligation: 2800000000, currentObligation: 3248000000, dollarCreep: 448000000, percentCreep: 16.0, activeContractsCount: 940 },
  '28': { fips: '28', stateCode: 'MS', stateName: 'Mississippi', initialObligation: 4400000000, currentObligation: 7392000000, dollarCreep: 2992000000, percentCreep: 68.0, activeContractsCount: 1120 },
  '29': { fips: '29', stateCode: 'MO', stateName: 'Missouri', initialObligation: 8600000000, currentObligation: 13932000000, dollarCreep: 5332000000, percentCreep: 62.0, activeContractsCount: 2340 },
  '30': { fips: '30', stateCode: 'MT', stateName: 'Montana', initialObligation: 850000000, currentObligation: 926500000, dollarCreep: 76500000, percentCreep: 9.0, activeContractsCount: 310 },
  '31': { fips: '31', stateCode: 'NE', stateName: 'Nebraska', initialObligation: 1150000000, currentObligation: 1242000000, dollarCreep: 92000000, percentCreep: 8.0, activeContractsCount: 420 },
  '32': { fips: '32', stateCode: 'NV', stateName: 'Nevada', initialObligation: 2400000000, currentObligation: 3216000000, dollarCreep: 816000000, percentCreep: 34.0, activeContractsCount: 760 },
  '33': { fips: '33', stateCode: 'NH', stateName: 'New Hampshire', initialObligation: 2200000000, currentObligation: 2882000000, dollarCreep: 682000000, percentCreep: 31.0, activeContractsCount: 610 },
  '34': { fips: '34', stateCode: 'NJ', stateName: 'New Jersey', initialObligation: 7100000000, currentObligation: 9869000000, dollarCreep: 2769000000, percentCreep: 39.0, activeContractsCount: 2190 },
  '35': { fips: '35', stateCode: 'NM', stateName: 'New Mexico', initialObligation: 5600000000, currentObligation: 8568000000, dollarCreep: 2968000000, percentCreep: 53.0, activeContractsCount: 1410 },
  '36': { fips: '36', stateCode: 'NY', stateName: 'New York', initialObligation: 10400000000, currentObligation: 14768000000, dollarCreep: 4368000000, percentCreep: 42.0, activeContractsCount: 3450 },
  '37': { fips: '37', stateCode: 'NC', stateName: 'North Carolina', initialObligation: 6400000000, currentObligation: 8512000000, dollarCreep: 2112000000, percentCreep: 33.0, activeContractsCount: 1980 },
  '38': { fips: '38', stateCode: 'ND', stateName: 'North Dakota', initialObligation: 620000000, currentObligation: 744000000, dollarCreep: 124000000, percentCreep: 20.0, activeContractsCount: 220 },
  '39': { fips: '39', stateCode: 'OH', stateName: 'Ohio', initialObligation: 6900000000, currentObligation: 9246000000, dollarCreep: 2346000000, percentCreep: 34.0, activeContractsCount: 2310 },
  '40': { fips: '40', stateCode: 'OK', stateName: 'Oklahoma', initialObligation: 3100000000, currentObligation: 4061000000, dollarCreep: 961000000, percentCreep: 31.0, activeContractsCount: 1050 },
  '41': { fips: '41', stateCode: 'OR', stateName: 'Oregon', initialObligation: 1800000000, currentObligation: 2178000000, dollarCreep: 378000000, percentCreep: 21.0, activeContractsCount: 670 },
  '42': { fips: '42', stateCode: 'PA', stateName: 'Pennsylvania', initialObligation: 8900000000, currentObligation: 13083000000, dollarCreep: 4183000000, percentCreep: 47.0, activeContractsCount: 2890 },
  '44': { fips: '44', stateCode: 'RI', stateName: 'Rhode Island', initialObligation: 2100000000, currentObligation: 3465000000, dollarCreep: 1365000000, percentCreep: 65.0, activeContractsCount: 560 },
  '45': { fips: '45', stateCode: 'SC', stateName: 'South Carolina', initialObligation: 4600000000, currentObligation: 6394000000, dollarCreep: 1794000000, percentCreep: 39.0, activeContractsCount: 1390 },
  '46': { fips: '46', stateCode: 'SD', stateName: 'South Dakota', initialObligation: 490000000, currentObligation: 524300000, dollarCreep: 34300000, percentCreep: 7.0, activeContractsCount: 180 },
  '47': { fips: '47', stateCode: 'TN', stateName: 'Tennessee', initialObligation: 5100000000, currentObligation: 6987000000, dollarCreep: 1887000000, percentCreep: 37.0, activeContractsCount: 1620 },
  '48': { fips: '48', stateCode: 'TX', stateName: 'Texas', initialObligation: 24500000000, currentObligation: 44590000000, dollarCreep: 20090000000, percentCreep: 82.0, activeContractsCount: 6890 },
  '49': { fips: '49', stateCode: 'UT', stateName: 'Utah', initialObligation: 3400000000, currentObligation: 4930000000, dollarCreep: 1530000000, percentCreep: 45.0, activeContractsCount: 1180 },
  '50': { fips: '50', stateCode: 'VT', stateName: 'Vermont', initialObligation: 580000000, currentObligation: 626400000, dollarCreep: 46400000, percentCreep: 8.0, activeContractsCount: 210 },
  '51': { fips: '51', stateCode: 'VA', stateName: 'Virginia', initialObligation: 34800000000, currentObligation: 68556000000, dollarCreep: 33756000000, percentCreep: 97.0, activeContractsCount: 8940 },
  '53': { fips: '53', stateCode: 'WA', stateName: 'Washington', initialObligation: 11200000000, currentObligation: 18368000000, dollarCreep: 7168000000, percentCreep: 64.0, activeContractsCount: 2780 },
  '54': { fips: '54', stateCode: 'WV', stateName: 'West Virginia', initialObligation: 980000000, currentObligation: 1156400000, dollarCreep: 176400000, percentCreep: 18.0, activeContractsCount: 390 },
  '55': { fips: '55', stateCode: 'WI', stateName: 'Wisconsin', initialObligation: 3100000000, currentObligation: 4092000000, dollarCreep: 992000000, percentCreep: 32.0, activeContractsCount: 1080 },
  '56': { fips: '56', stateCode: 'WY', stateName: 'Wyoming', initialObligation: 420000000, currentObligation: 546000000, dollarCreep: 126000000, percentCreep: 30.0, activeContractsCount: 160 },
  '72': { fips: '72', stateCode: 'PR', stateName: 'Puerto Rico', initialObligation: 1800000000, currentObligation: 2376000000, dollarCreep: 576000000, percentCreep: 32.0, activeContractsCount: 520 },
};

/**
 * Returns the exact CartoColors/ColorBrewer inspired editorial gradient stop
 * matching user specifications:
 * - 0% (Fixed Price / Baseline): fill-stone-200 (#E5E7EB)
 * - 1% – 15% (Standard): fill-orange-200 (#FED7AA)
 * - 16% – 35% (Elevated): fill-orange-400 (#FB923C)
 * - 36% – 75% (Severe): fill-red-600 (#DC2626)
 * - 75%+ (Critical): fill-red-900 (#7F1D1D)
 */
export function getEditorialCreepColor(
  percentCreep: number
): {
  fill: string;
  hoverFill: string;
  tailwindClass: string;
  category: string;
} {
  if (percentCreep <= 0) {
    return {
      fill: '#E5E7EB',
      hoverFill: '#D1D5DB',
      tailwindClass: 'fill-stone-200',
      category: 'Fixed Price / Baseline (0%)',
    };
  }

  if (percentCreep <= 15) {
    return {
      fill: '#FED7AA',
      hoverFill: '#FDBA74',
      tailwindClass: 'fill-orange-200',
      category: 'Standard (1% – 15%)',
    };
  }

  if (percentCreep <= 35) {
    return {
      fill: '#FB923C',
      hoverFill: '#F97316',
      tailwindClass: 'fill-orange-400',
      category: 'Elevated (16% – 35%)',
    };
  }

  if (percentCreep <= 75) {
    return {
      fill: '#DC2626',
      hoverFill: '#B91C1C',
      tailwindClass: 'fill-red-600',
      category: 'Severe (36% – 75%)',
    };
  }

  return {
    fill: '#7F1D1D',
    hoverFill: '#5E1414',
    tailwindClass: 'fill-red-900',
    category: 'Critical (75%+)',
  };
}

export function formatCompactUSD(val: number): string {
  if (isNaN(val) || val === 0) return '$0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
