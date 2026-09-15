import { GovernmentBuilding } from '../types/buildings';
import { JurisdictionLevel, LocationContext } from '../types/civic';

export function getGovernmentBuildings(
  level: JurisdictionLevel,
  location: LocationContext
): GovernmentBuilding[] {
  const { city, county, state, stateCode, lat, lng, congressionalDistrict } = location;
  const isIllinois = stateCode === 'IL' || state.toLowerCase().includes('illinois');

  switch (level) {
    case 'local':
      // Local city-specific buildings (e.g., Champaign City Hall & Library)
      return [
        {
          id: `bldg-city-hall-${city.toLowerCase()}`,
          name: `${city} City Hall & Council Chambers`,
          type: 'city_hall',
          typeLabel: 'Municipal City Hall',
          pieceTheme: 'gold',
          lat: isIllinois && city.toLowerCase().includes('champaign') ? 40.1179 : lat + 0.002,
          lng: isIllinois && city.toLowerCase().includes('champaign') ? -88.2435 : lng - 0.003,
          address: isIllinois && city.toLowerCase().includes('champaign')
            ? `102 N Neil St, Champaign, IL 61820`
            : `100 Main St, ${city}, ${stateCode}`,
          jurisdictionLevel: 'local',
          occupants: [
            `Office of the Mayor`,
            `${city} City Council Chambers`,
            `Department of Planning & Development`,
            `City Clerk Public Records Office`,
          ],
          publicServices: [
            'Building Permits & Zoning Inspections',
            'Municipal Utility Billing & Parking',
            'City Council Public Speaking Registration',
            'Voter Registration & Municipal Licenses',
          ],
          hours: 'Mon – Fri: 8:00 AM – 5:00 PM',
          phone: '(555) 201-4000',
          websiteUrl: `https://${city.toLowerCase().replace(/\s+/g, '')}.gov/city-hall`,
          upcomingHearing: {
            title: 'City Council Regular Action Session',
            room: 'Council Chambers 2nd Floor',
            time: 'Tuesday, 7:00 PM',
          },
          boardGamePieceDescription: 'Monopoly Town Hall token in polished brass with 3D portico pediment and clock tower.',
        },
        {
          id: `bldg-library-${city.toLowerCase()}`,
          name: `${city} Public Library & Municipal Archives`,
          type: 'library',
          typeLabel: 'Civic Library & Open Archives',
          pieceTheme: 'emerald',
          lat: isIllinois && city.toLowerCase().includes('champaign') ? 40.1118 : lat - 0.003,
          lng: isIllinois && city.toLowerCase().includes('champaign') ? -88.2464 : lng + 0.004,
          address: isIllinois && city.toLowerCase().includes('champaign')
            ? `200 W Green St, Champaign, IL 61820`
            : `200 W Green St, ${city}, ${stateCode}`,
          jurisdictionLevel: 'local',
          occupants: [
            `Main Public Library & Literacy Lab`,
            `Local History & Municipal Ordinance Archive`,
            `Civic Forum Room`,
            `Digital Community Lab`,
          ],
          publicServices: [
            'Historical Municipal Records & Ordinances',
            'Free Public Internet & Workspace',
            'Civic Meeting Space Reservations',
            'Public Notary Services',
          ],
          hours: 'Mon – Thu: 9 AM – 9 PM, Fri – Sat: 9 AM – 6 PM',
          phone: '(555) 403-2000',
          websiteUrl: `https://${city.toLowerCase().replace(/\s+/g, '')}publiclibrary.org`,
          boardGamePieceDescription: 'Tabletop academy token with open book pediment and carved portico.',
        },
      ];

    case 'county':
      // County-specific buildings (e.g., Champaign County Courthouse in Urbana, County Sheriff HQ)
      return [
        {
          id: `bldg-courthouse-${county.toLowerCase()}`,
          name: `${county} Courthouse & Justice Center`,
          type: 'courthouse',
          typeLabel: 'County Courthouse',
          pieceTheme: 'bronze',
          lat: isIllinois && county.toLowerCase().includes('champaign') ? 40.1126 : lat - 0.005,
          lng: isIllinois && county.toLowerCase().includes('champaign') ? -88.2073 : lng + 0.006,
          address: isIllinois && county.toLowerCase().includes('champaign')
            ? `101 E Main St, Urbana, IL 61801`
            : `202 E Washington Ave, ${city}, ${stateCode}`,
          jurisdictionLevel: 'county',
          occupants: [
            `${county} 6th Judicial Circuit Court`,
            `County Board of Commissioners Assembly Room`,
            `County Clerk & Recorder of Deeds`,
            `County Treasurer & Assessor`,
          ],
          publicServices: [
            'Marriage Licenses & Birth/Death Records',
            'Property Tax Assessment & Appeals',
            'Jury Duty Processing',
            'Civil & Criminal Court Filings',
          ],
          hours: 'Mon – Fri: 8:00 AM – 4:30 PM',
          phone: '(555) 349-8000',
          websiteUrl: `https://${county.toLowerCase().replace(/\s+/g, '')}.gov/courthouse`,
          upcomingHearing: {
            title: 'County Board of Commissioners Meeting',
            room: 'County Hearing Room 1',
            time: 'Thursday, 6:30 PM',
          },
          boardGamePieceDescription: 'Tabletop justice temple token with ionic pillars and scale of justice crest.',
        },
        {
          id: `bldg-safety-${county.toLowerCase()}`,
          name: `${county} Sheriff's Headquarters & Public Safety Center`,
          type: 'public_safety',
          typeLabel: 'County Sheriff HQ',
          pieceTheme: 'crimson',
          lat: isIllinois && county.toLowerCase().includes('champaign') ? 40.1122 : lat + 0.006,
          lng: isIllinois && county.toLowerCase().includes('champaign') ? -88.2058 : lng - 0.007,
          address: isIllinois && county.toLowerCase().includes('champaign')
            ? `204 E Main St, Urbana, IL 61801`
            : `505 S 1st St, ${city}, ${stateCode}`,
          jurisdictionLevel: 'county',
          occupants: [
            `${county} Sheriff's Department`,
            `County 911 Emergency Communications Dispatch`,
            `Emergency Management Agency (EMA)`,
          ],
          publicServices: [
            'Non-Emergency Sheriff Reports',
            'Background Checks & Fingerprinting',
            'Civil Process & Court Security',
            'Emergency Alert Registration',
          ],
          hours: '24/7 Operations · Public Window: 8 AM – 5 PM',
          phone: '(555) 349-8900',
          websiteUrl: `https://${county.toLowerCase().replace(/\s+/g, '')}.gov/sheriff`,
          boardGamePieceDescription: 'Carcassonne-style fortified bastion watchtower piece with golden shield emblem.',
        },
      ];

    case 'state':
      // State level: State Capitol (Springfield) + Major Economic/Population Hub (Chicago)
      return [
        {
          id: `bldg-capitol-${stateCode.toLowerCase()}`,
          name: `Illinois State Capitol & General Assembly (Springfield)`,
          type: 'state_capitol',
          typeLabel: 'State Capitol',
          pieceTheme: 'pewter',
          lat: 39.7984,
          lng: -89.6549,
          address: `401 S 2nd St, Springfield, IL 62701`,
          jurisdictionLevel: 'state',
          occupants: [
            `Office of the Governor of Illinois`,
            `Illinois State Senate Chambers`,
            `Illinois House of Representatives Chambers`,
            `Legislative Reference Bureau`,
          ],
          publicServices: [
            'State Legislative Committee Sessions & Witness Slips',
            'State Constituent Inquiries',
            'Public Capitol Rotunda Tours',
            'State Legislative Library & Archives',
          ],
          hours: 'Mon – Fri: 8:00 AM – 5:00 PM (Rotunda Tours Daily)',
          phone: '(217) 782-2000',
          websiteUrl: `https://ilga.gov`,
          upcomingHearing: {
            title: 'Senate Appropriations Committee Session',
            room: 'Capitol Room 400',
            time: 'Wednesday, 10:00 AM',
          },
          boardGamePieceDescription: 'Grand Wonder Monument piece with tiered 3D rotunda dome and flagpole spire in Springfield.',
        },
        {
          id: `bldg-mansion-springfield`,
          name: `Illinois Governor's Executive Mansion (Springfield)`,
          type: 'state_capitol',
          typeLabel: 'Executive Mansion',
          pieceTheme: 'gold',
          lat: 39.7946,
          lng: -89.6517,
          address: `410 E Jackson St, Springfield, IL 62701`,
          jurisdictionLevel: 'state',
          occupants: [
            `Official Residence & Executive Office of the Governor`,
            `Governor's Policy & Press Briefing Room`,
          ],
          publicServices: [
            'Public Historic Tours (by advance registration)',
            'Executive Proclamation Requests',
          ],
          hours: 'Tue – Sat: 1:00 PM – 4:00 PM',
          phone: '(217) 782-6450',
          websiteUrl: `https://illinoismansion.org`,
          boardGamePieceDescription: 'Historic executive mansion piece with neoclassical portico and lawn pedestal.',
        },
        {
          id: `bldg-chicago-city-hall`,
          name: `Chicago City Hall & Cook County Building (Largest Economic City)`,
          type: 'city_hall',
          typeLabel: 'Major Economic City Hub',
          pieceTheme: 'sapphire',
          lat: 41.8839,
          lng: -87.6324,
          address: `121 N LaSalle St, Chicago, IL 60602`,
          jurisdictionLevel: 'state',
          occupants: [
            `Office of the Mayor of Chicago (Brandon Johnson)`,
            `Chicago City Council Chambers`,
            `Cook County Government Headquarters`,
          ],
          publicServices: [
            'Major Economic & Business Development Coordination',
            'City Council Public Hearings',
            'Regional Transit & Infrastructure Authority',
          ],
          hours: 'Mon – Fri: 8:30 AM – 5:00 PM',
          phone: '(312) 744-5000',
          websiteUrl: `https://chicago.gov`,
          upcomingHearing: {
            title: 'Chicago City Council Monthly Meeting',
            room: 'Chambers 2nd Floor',
            time: 'Wednesday, 10:00 AM',
          },
          boardGamePieceDescription: 'Monopoly-scale metropolitan municipal skyscraper piece representing Illinois’ largest economic engine.',
        },
      ];

    case 'federal':
      // Federal level: Washington D.C. (The White House & Capitol) + State Capitals & Major Hubs
      return [
        {
          id: `bldg-white-house`,
          name: `The White House (Executive Branch)`,
          type: 'state_capitol',
          typeLabel: 'The White House',
          pieceTheme: 'gold',
          lat: 38.8977,
          lng: -77.0365,
          address: `1600 Pennsylvania Avenue NW, Washington, DC 20500`,
          jurisdictionLevel: 'federal',
          occupants: [
            `President of the United States`,
            `Vice President of the United States`,
            `Executive Office of the President`,
            `National Security Council (West Wing)`,
          ],
          publicServices: [
            'Presidential Casework & Inquiries',
            'Public Tour Requests via Congressional Offices',
            'Official Federal Proclamations & Executive Actions',
          ],
          hours: 'Executive Office 24/7 · Public Tours: Tue – Sat morning',
          phone: '(202) 456-1111',
          websiteUrl: `https://whitehouse.gov`,
          boardGamePieceDescription: 'The iconic White House neoclassical portico token in gold and white finish.',
        },
        {
          id: `bldg-us-capitol`,
          name: `United States Capitol (119th Congress)`,
          type: 'federal_building',
          typeLabel: 'U.S. Capitol',
          pieceTheme: 'pewter',
          lat: 38.8899,
          lng: -77.0091,
          address: `First St SE, Washington, DC 20004`,
          jurisdictionLevel: 'federal',
          occupants: [
            `U.S. House of Representatives Chamber`,
            `United States Senate Chamber`,
            `Office of the Speaker of the House`,
            `Congressional Leadership Suites`,
          ],
          publicServices: [
            'Congressional Gallery Passes & Floor Debates',
            'U.S. Capitol Visitor Center Guided Tours',
            'Federal Legislative Hearing Attendance',
          ],
          hours: 'Mon – Sat: 8:30 AM – 4:30 PM',
          phone: '(202) 224-3121',
          websiteUrl: `https://visitthecapitol.gov`,
          upcomingHearing: {
            title: 'House Energy & Commerce Committee Session',
            room: 'Rayburn 2123',
            time: 'Wednesday, 10:00 AM EDT',
          },
          boardGamePieceDescription: 'Grand U.S. Capitol Rotunda Monument with cast-iron dome and Statue of Freedom.',
        },
        {
          id: `bldg-fed-il-springfield`,
          name: `Illinois State Capitol (State Capital Hub)`,
          type: 'state_capitol',
          typeLabel: 'State Capital Hub',
          pieceTheme: 'bronze',
          lat: 39.7984,
          lng: -89.6549,
          address: `401 S 2nd St, Springfield, IL 62701`,
          jurisdictionLevel: 'federal',
          occupants: [
            `Illinois State Government`,
            `Federal Congressional Liaison Office`,
          ],
          publicServices: ['Federal-State Grant Coordination', 'State Delegation Services'],
          hours: 'Mon – Fri: 8 AM – 5 PM',
          phone: '(217) 782-2000',
          websiteUrl: `https://ilga.gov`,
          boardGamePieceDescription: 'State capital marker connecting the federal system to Illinois.',
        },
        {
          id: `bldg-fed-chicago`,
          name: `Federal Reserve Bank & Chicago Metropolitan Hub (Largest Economic City)`,
          type: 'federal_building',
          typeLabel: 'Economic Powerhouse Hub',
          pieceTheme: 'sapphire',
          lat: 41.8790,
          lng: -87.6322,
          address: `230 S LaSalle St, Chicago, IL 60604`,
          jurisdictionLevel: 'federal',
          occupants: [
            `Federal Reserve Bank of Chicago (7th District)`,
            `Everett McKinley Dirksen U.S. Courthouse`,
            `U.S. Department of Commerce Regional HQ`,
          ],
          publicServices: ['Regional Economic Data', 'U.S. Court of Appeals 7th Circuit', 'Federal Public Records'],
          hours: 'Mon – Fri: 9:00 AM – 4:30 PM',
          phone: '(312) 322-5000',
          websiteUrl: `https://chicagofed.org`,
          boardGamePieceDescription: 'Financial & federal commerce token representing the Midwest economic engine.',
        },
      ];
  }
}
