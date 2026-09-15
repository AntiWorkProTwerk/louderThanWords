export type GovernmentBuildingType =
  | 'city_hall'
  | 'courthouse'
  | 'state_capitol'
  | 'federal_building'
  | 'public_safety'
  | 'library';

export interface GovernmentBuilding {
  id: string;
  name: string;
  type: GovernmentBuildingType;
  typeLabel: string;
  pieceTheme: 'pewter' | 'bronze' | 'gold' | 'emerald' | 'crimson' | 'sapphire';
  lat: number;
  lng: number;
  address: string;
  jurisdictionLevel: 'local' | 'county' | 'state' | 'federal';
  occupants: string[];
  publicServices: string[];
  hours: string;
  phone: string;
  websiteUrl: string;
  upcomingHearing?: {
    title: string;
    room: string;
    time: string;
  };
  boardGamePieceDescription: string;
}
