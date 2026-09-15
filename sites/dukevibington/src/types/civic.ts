export type MapViewLevel = 'national' | 'state' | 'county' | 'local';

export interface MapFeatureSelection {
  level: MapViewLevel;
  stateCode?: string;
  stateName?: string;
  stateFips?: string;
  countyName?: string;
  countyFips?: string;
  cityName?: string;
}

