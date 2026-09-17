<script lang="ts">
  import { base } from '$app/paths';
  import { onDestroy, onMount, tick } from 'svelte';
  import { geoAlbersUsa, geoPath } from 'd3-geo';
  import {
    feature as topojsonFeature,
    merge as topojsonMerge,
    mesh as topojsonMesh,
    neighbors as topojsonNeighbors
  } from 'topojson-client';
  import type { Feature, FeatureCollection, Geometry } from 'geojson';
  import type {
    GeometryCollection as TopologyGeometryCollection,
    MultiPolygon as TopologyMultiPolygon,
    Polygon as TopologyPolygon,
    Topology
  } from 'topojson-specification';

  const MAP_WIDTH = 1000;
  const MAP_HEIGHT = 610;
  const REVEAL_DURATION = 1500;
  const MAP_MOVE_DURATION = 1100;
  const NATIONAL_VIEW: [number, number, number, number] = [0, 0, MAP_WIDTH, MAP_HEIGHT];

  type PartyCode = 'D' | 'R' | 'I' | string;

  type StateMeta = { name: string; code: string };
  type StateShape = StateMeta & {
    id: string;
    path: string;
    bounds: [[number, number], [number, number]];
    label: [number, number];
    anchor: [number, number];
    hasLeader: boolean;
    revealStep: number;
  };
  type CountyShape = {
    id: string;
    path: string;
    label: string;
  };
  type Senator = {
    id: string;
    name: string;
    party: PartyCode;
    state: string;
    class: string;
    website: string;
  };
  type Representative = {
    id: string;
    name: string;
    party: PartyCode;
    state: string;
    district: number;
    role: 'Representative' | 'Delegate';
  };
  type OfficialsData = {
    metadata: {
      congress: number;
      retrievedOn: string;
      senatePublished: string;
      housePublished: string;
      senateSource: string;
      houseSource: string;
    };
    senators: Senator[];
    representatives: Representative[];
  };
  type DistrictProperties = {
    STATE: string;
    CD119: string;
    GEOID: string;
    NAME: string;
  };
  type DistrictShape = {
    id: string;
    stateId: string;
    district: number;
    path: string;
    label: [number, number];
  };
  type ElectionYear = 2016 | 2020 | 2024;
  type ElectionResult = {
    d: number;
    r: number;
    t: number;
  };
  type ElectionYearData = {
    source: string;
    states: Record<string, ElectionResult>;
    counties: Record<string, ElectionResult>;
  };
  type ElectionData = {
    metadata: {
      normalizedOn: string;
      office: string;
      years: ElectionYear[];
      sourceRepository: string;
      officialStateReference: string;
      notes: string[];
    };
    elections: Record<string, ElectionYearData>;
  };
  type AnalysisMode = 'map' | 'bills';
  type GeographyMode = 'counties' | 'districts';
  type BillVoteMember = {
    id: string;
    lisId?: string;
    name: string;
    party: PartyCode;
    state: string;
    vote: string;
  };
  type BillVote = {
    id: string;
    chamber: 'House' | 'Senate';
    congress: number;
    session: number;
    roll: number;
    date: string;
    question: string;
    description: string;
    result: string;
    threshold: string;
    counts: Record<string, number>;
    source: string;
    members: BillVoteMember[];
  };
  type BillRecord = {
    id: string;
    congress: number;
    type: string;
    number: string;
    displayNumber: string;
    title: string;
    officialTitle: string;
    introducedDate: string;
    originChamber: string;
    policyArea: string;
    sponsor: { id: string; name: string; party: PartyCode; state: string; district: number };
    cosponsorCount: number;
    summary: string;
    summaryStage: string;
    summaryDate: string;
    latestAction: { date: string; text: string };
    congressUrl: string;
    actions: { date: string; time: string; text: string; type: string }[];
    votes: BillVote[];
  };
  type BillsData = {
    metadata: { congress: number; retrievedOn: string; source: string; notes: string[] };
    bills: BillRecord[];
  };
  type StateTopology = Topology<{ states: TopologyGeometryCollection }>;
  type CountyTopology = Topology<{ counties: TopologyGeometryCollection }>;

  const statesByFips: Record<string, StateMeta> = {
    '01': { name: 'Alabama', code: 'AL' },
    '02': { name: 'Alaska', code: 'AK' },
    '04': { name: 'Arizona', code: 'AZ' },
    '05': { name: 'Arkansas', code: 'AR' },
    '06': { name: 'California', code: 'CA' },
    '08': { name: 'Colorado', code: 'CO' },
    '09': { name: 'Connecticut', code: 'CT' },
    '10': { name: 'Delaware', code: 'DE' },
    '11': { name: 'District of Columbia', code: 'DC' },
    '12': { name: 'Florida', code: 'FL' },
    '13': { name: 'Georgia', code: 'GA' },
    '15': { name: 'Hawaii', code: 'HI' },
    '16': { name: 'Idaho', code: 'ID' },
    '17': { name: 'Illinois', code: 'IL' },
    '18': { name: 'Indiana', code: 'IN' },
    '19': { name: 'Iowa', code: 'IA' },
    '20': { name: 'Kansas', code: 'KS' },
    '21': { name: 'Kentucky', code: 'KY' },
    '22': { name: 'Louisiana', code: 'LA' },
    '23': { name: 'Maine', code: 'ME' },
    '24': { name: 'Maryland', code: 'MD' },
    '25': { name: 'Massachusetts', code: 'MA' },
    '26': { name: 'Michigan', code: 'MI' },
    '27': { name: 'Minnesota', code: 'MN' },
    '28': { name: 'Mississippi', code: 'MS' },
    '29': { name: 'Missouri', code: 'MO' },
    '30': { name: 'Montana', code: 'MT' },
    '31': { name: 'Nebraska', code: 'NE' },
    '32': { name: 'Nevada', code: 'NV' },
    '33': { name: 'New Hampshire', code: 'NH' },
    '34': { name: 'New Jersey', code: 'NJ' },
    '35': { name: 'New Mexico', code: 'NM' },
    '36': { name: 'New York', code: 'NY' },
    '37': { name: 'North Carolina', code: 'NC' },
    '38': { name: 'North Dakota', code: 'ND' },
    '39': { name: 'Ohio', code: 'OH' },
    '40': { name: 'Oklahoma', code: 'OK' },
    '41': { name: 'Oregon', code: 'OR' },
    '42': { name: 'Pennsylvania', code: 'PA' },
    '44': { name: 'Rhode Island', code: 'RI' },
    '45': { name: 'South Carolina', code: 'SC' },
    '46': { name: 'South Dakota', code: 'SD' },
    '47': { name: 'Tennessee', code: 'TN' },
    '48': { name: 'Texas', code: 'TX' },
    '49': { name: 'Utah', code: 'UT' },
    '50': { name: 'Vermont', code: 'VT' },
    '51': { name: 'Virginia', code: 'VA' },
    '53': { name: 'Washington', code: 'WA' },
    '54': { name: 'West Virginia', code: 'WV' },
    '55': { name: 'Wisconsin', code: 'WI' },
    '56': { name: 'Wyoming', code: 'WY' }
  };

  const internalLabelPositions: Record<string, [number, number]> = {
    '12': [784, 488],
    '22': [602, 449],
    '26': [699, 192],
    '50': [861, 157]
  };

  const northeastCalloutPositions: Record<string, [number, number]> = {
    '33': [948, 150],
    '25': [948, 174],
    '44': [948, 196],
    '09': [948, 218],
    '34': [948, 242],
    '10': [948, 264],
    '24': [948, 286],
    '11': [948, 308]
  };

  let entered = false;
  let revealing = false;
  let loading = true;
  let loadError = false;
  let officialsLoading = true;
  let officialsLoadError = false;
  let electionLoading = true;
  let electionLoadError = false;
  let billsLoading = true;
  let billsLoadError = false;
  let shapes: StateShape[] = [];
  let countyFeatures: Feature<Geometry>[] = [];
  let countyTopology: CountyTopology | null = null;
  let districtFeatures: Feature<Geometry, DistrictProperties>[] = [];
  let districtShapes: DistrictShape[] = [];
  let officialsData: OfficialsData | null = null;
  let electionData: ElectionData | null = null;
  let billsData: BillsData | null = null;
  let selectedElectionYear: ElectionYear = 2024;
  let analysisMode: AnalysisMode = 'map';
  let geographyMode: GeographyMode = 'counties';
  let selectedBillVoteId = 'senate-119-2-234';
  let billMemberQuery = '';
  let colorHelpOpen = false;
  let colorHelpButton: HTMLButtonElement | undefined;
  let makePath: ReturnType<typeof geoPath> | null = null;
  let internalBordersPath = '';
  let nationalOutlinePath = '';
  let selectedId: string | null = null;
  let hoveredId: string | null = null;
  let selectedCounties: CountyShape[] = [];
  let selectedCountyBordersPath = '';
  let hoveredCountyId: string | null = null;
  let hoveredRepresentativeId: string | null = null;
  let pinnedRepresentativeId: string | null = null;
  let currentViewBox: [number, number, number, number] = [...NATIONAL_VIEW];
  let mapElement: SVGSVGElement | undefined;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let countyClearTimer: ReturnType<typeof setTimeout> | undefined;
  let mapAnimationFrame: number | undefined;

  $: selectedState = shapes.find((state) => state.id === selectedId) ?? null;
  $: hoveredState = shapes.find((state) => state.id === hoveredId) ?? null;
  $: hoveredCounty = selectedCounties.find((county) => county.id === hoveredCountyId) ?? null;
  $: readoutState = hoveredState ?? selectedState;
  $: readoutElection = hoveredCounty
    ? getElectionResult(electionData, selectedElectionYear, 'counties', hoveredCounty.id)
    : readoutState
      ? getElectionResult(electionData, selectedElectionYear, 'states', readoutState.id)
      : null;
  $: selectedStateElection = selectedState
    ? getElectionResult(electionData, selectedElectionYear, 'states', selectedState.id)
    : null;
  $: selectedSenators = selectedState && officialsData
    ? officialsData.senators.filter((senator) => senator.state === selectedState.code)
    : [];
  $: selectedRepresentatives = selectedState && officialsData
    ? officialsData.representatives
      .filter((representative) => representative.state === selectedState.code)
      .sort((left, right) => left.district - right.district)
    : [];
  $: selectedDistricts = selectedState
    ? districtShapes.filter((district) => district.stateId === selectedState.id)
    : [];
  $: activeRepresentativeId = hoveredRepresentativeId ?? pinnedRepresentativeId;
  $: activeRepresentative = selectedRepresentatives.find(
    (representative) => representative.id === activeRepresentativeId
  ) ?? null;
  $: activeDistrict = activeRepresentative && selectedState
    ? districtShapes.find((district) =>
      district.stateId === selectedState.id &&
      district.district === censusDistrictNumber(selectedState.id, activeRepresentative.district)
    ) ?? null
    : null;
  $: selectedBill = billsData?.bills[0] ?? null;
  $: selectedBillVote = selectedBill?.votes.find((vote) => vote.id === selectedBillVoteId)
    ?? selectedBill?.votes[0]
    ?? null;
  $: selectedBillVoteMembers = selectedBillVote
    ? selectedBillVote.members.filter((member) => {
        const query = billMemberQuery.trim().toLowerCase();
        if (!query) return true;
        return [officialNameForVote(member), member.state, member.party, member.vote]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
    : [];

  onMount(() => {
    void loadMap();
    void loadOfficials();
    void loadElectionData();
    void loadBillData();
  });

  onDestroy(() => {
    if (revealTimer) clearTimeout(revealTimer);
    if (countyClearTimer) clearTimeout(countyClearTimer);
    if (mapAnimationFrame) cancelAnimationFrame(mapAnimationFrame);
  });

  async function loadMap() {
    try {
      const [statesResponse, countiesResponse] = await Promise.all([
        fetch(`${base}/data/us-states-10m.json`),
        fetch(`${base}/data/us-counties-10m.json`)
      ]);
      if (!statesResponse.ok || !countiesResponse.ok) {
        throw new Error(`Map request failed: ${statesResponse.status}/${countiesResponse.status}`);
      }

      const [statesTopology, countiesTopology] = await Promise.all([
        statesResponse.json(),
        countiesResponse.json()
      ]) as [StateTopology, CountyTopology];
      const stateCollection = topojsonFeature(
        statesTopology,
        statesTopology.objects.states
      ) as unknown as FeatureCollection<Geometry>;
      const countyCollection = topojsonFeature(
        countiesTopology,
        countiesTopology.objects.counties
      ) as unknown as FeatureCollection<Geometry>;

      const stateFeatures = stateCollection.features.filter((item) => {
        const id = String(item.id).padStart(2, '0');
        return Boolean(statesByFips[id]);
      });
      const stateGeometries = statesTopology.objects.states.geometries.filter((item) => {
        const id = String(item.id).padStart(2, '0');
        return Boolean(statesByFips[id]);
      });
      const revealSteps = getRevealSteps(
        stateGeometries.map((item) => String(item.id).padStart(2, '0')),
        topojsonNeighbors(stateGeometries)
      );
      const visibleStates: FeatureCollection<Geometry> = {
        type: 'FeatureCollection',
        features: stateFeatures
      };
      const projection = geoAlbersUsa().fitExtent(
        [[68, 52], [MAP_WIDTH - 68, MAP_HEIGHT - 52]],
        visibleStates
      );
      makePath = geoPath(projection);
      const visibleStateGeometry: TopologyGeometryCollection = {
        type: 'GeometryCollection',
        geometries: stateGeometries
      };
      const interiorBorders = topojsonMesh(
        statesTopology,
        visibleStateGeometry,
        (left, right) => left !== right
      );
      const nationalOutline = topojsonMerge(
        statesTopology,
        stateGeometries as Array<TopologyPolygon | TopologyMultiPolygon>
      );
      internalBordersPath = makePath(interiorBorders) ?? '';
      nationalOutlinePath = makePath(nationalOutline) ?? '';

      shapes = stateFeatures.flatMap((item) => {
        if (!makePath) return [];
        const id = String(item.id).padStart(2, '0');
        const meta = statesByFips[id];
        const path = makePath(item);
        if (!meta || !path) return [];

        const anchor = makePath.centroid(item) as [number, number];
        const callout = northeastCalloutPositions[id];
        const label = callout ?? internalLabelPositions[id] ?? anchor;
        return [{
          ...meta,
          id,
          path,
          bounds: makePath.bounds(item) as [[number, number], [number, number]],
          anchor,
          label,
          hasLeader: Boolean(callout),
          revealStep: revealSteps.get(id) ?? 0
        }];
      });
      countyFeatures = countyCollection.features;
      countyTopology = countiesTopology;
      buildDistrictShapes();
    } catch (error) {
      console.error(error);
      loadError = true;
    } finally {
      loading = false;
    }
  }

  async function loadOfficials() {
    try {
      const [officialsResponse, districtsResponse] = await Promise.all([
        fetch(`${base}/data/federal-officials-119.json`),
        fetch(`${base}/data/congressional-districts-119.geojson`)
      ]);
      if (!officialsResponse.ok || !districtsResponse.ok) {
        throw new Error(
          `Officials request failed: ${officialsResponse.status}/${districtsResponse.status}`
        );
      }

      const [officials, districts] = await Promise.all([
        officialsResponse.json(),
        districtsResponse.json()
      ]) as [OfficialsData, FeatureCollection<Geometry, DistrictProperties>];

      officialsData = officials;
      districtFeatures = districts.features;
      buildDistrictShapes();
    } catch (error) {
      console.error(error);
      officialsLoadError = true;
    } finally {
      officialsLoading = false;
    }
  }

  async function loadElectionData() {
    try {
      const response = await fetch(`${base}/data/presidential-election-results.json`);
      if (!response.ok) {
        throw new Error(`Election data request failed: ${response.status}`);
      }
      electionData = await response.json() as ElectionData;
    } catch (error) {
      console.error(error);
      electionLoadError = true;
    } finally {
      electionLoading = false;
    }
  }

  async function loadBillData() {
    try {
      const response = await fetch(`${base}/data/federal-bills-119.json`);
      if (!response.ok) throw new Error(`Bill data request failed: ${response.status}`);
      billsData = await response.json() as BillsData;
    } catch (error) {
      console.error(error);
      billsLoadError = true;
    } finally {
      billsLoading = false;
    }
  }

  function buildDistrictShapes() {
    if (!makePath || districtFeatures.length === 0) return;

    districtShapes = districtFeatures.flatMap((district) => {
      const correctedDistrict = rewindDistrictFeature(district);
      const path = makePath?.(correctedDistrict);
      if (!path) return [];
      return [{
        id: district.properties.GEOID,
        stateId: district.properties.STATE,
        district: Number.parseInt(district.properties.CD119, 10),
        path,
        label: makePath?.centroid(correctedDistrict) as [number, number]
      }];
    });
  }

  function rewindDistrictFeature(
    district: Feature<Geometry, DistrictProperties>
  ): Feature<Geometry, DistrictProperties> {
    const geometry = district.geometry;

    if (geometry.type === 'Polygon') {
      return {
        ...district,
        geometry: {
          ...geometry,
          coordinates: geometry.coordinates.map((ring) => [...ring].reverse())
        }
      };
    }

    if (geometry.type === 'MultiPolygon') {
      return {
        ...district,
        geometry: {
          ...geometry,
          coordinates: geometry.coordinates.map((polygon) =>
            polygon.map((ring) => [...ring].reverse())
          )
        }
      };
    }

    return district;
  }

  function censusDistrictNumber(stateId: string, rosterDistrict: number) {
    return stateId === '11' ? 98 : rosterDistrict;
  }

  function representativeForDistrict(district: DistrictShape) {
    return selectedRepresentatives.find((representative) =>
      censusDistrictNumber(district.stateId, representative.district) === district.district
    ) ?? null;
  }

  function districtMapLabel(district: DistrictShape) {
    return district.district === 0 || district.district === 98 ? 'AL' : String(district.district);
  }

  function partyName(party: PartyCode) {
    if (party === 'D') return 'Democrat';
    if (party === 'R') return 'Republican';
    if (party === 'I') return 'Independent';
    return party || 'Party unavailable';
  }

  function partyClass(party: PartyCode) {
    if (party === 'D') return 'democrat';
    if (party === 'R') return 'republican';
    return 'other';
  }

  function districtLabel(representative: Representative) {
    return representative.district === 0 ? 'At large' : `District ${representative.district}`;
  }

  function rosterVintage() {
    if (!officialsData) return '119th Congress';
    return `119th Congress · House roster ${officialsData.metadata.housePublished}`;
  }

  function getElectionResult(
    data: ElectionData | null,
    year: ElectionYear,
    level: 'states' | 'counties',
    id: string
  ) {
    return data?.elections[String(year)]?.[level]?.[id] ?? null;
  }

  function electionStyle(result: ElectionResult | null) {
    if (!result || result.t <= 0) {
      return '--region-fill: #d8d8d6; --region-hover: #8c8c8a';
    }

    const democraticMargin = (result.d - result.r) / result.t;
    if (Math.abs(democraticMargin) < 0.0005) {
      return '--region-fill: #d8d8d6; --region-hover: #8c8c8a';
    }
    const strength = Math.min(Math.abs(democraticMargin) / 0.6, 1);
    const baseColor: [number, number, number] = democraticMargin > 0
      ? [36, 92, 166]
      : [181, 58, 54];
    const fillAmount = 0.2 + strength * 0.8;
    const hoverAmount = Math.min(fillAmount + 0.14, 1);
    return [
      `--region-fill: ${mixElectionColor(baseColor, fillAmount)}`,
      `--region-hover: ${mixElectionColor(baseColor, hoverAmount)}`
    ].join('; ');
  }

  function mixElectionColor(color: [number, number, number], amount: number) {
    const channels = color.map((channel) => Math.round(255 + (channel - 255) * amount));
    return `rgb(${channels.join(' ')})`;
  }

  function electionMargin(result: ElectionResult) {
    const margin = ((result.d - result.r) / result.t) * 100;
    if (Math.abs(margin) < 0.05) return 'Even';
    return `${margin > 0 ? 'D' : 'R'}+${Math.abs(margin).toFixed(1)}`;
  }

  function electionPartyClass(result: ElectionResult) {
    return result.d >= result.r ? 'democrat' : 'republican';
  }

  function voteShare(votes: number, total: number) {
    return total > 0 ? `${((votes / total) * 100).toFixed(1)}%` : '—';
  }

  function electionDescription(result: ElectionResult | null) {
    if (!result) return 'Result unavailable';
    return `${selectedElectionYear} presidential result: Democratic ${voteShare(result.d, result.t)}, Republican ${voteShare(result.r, result.t)}, ${electionMargin(result)}`;
  }

  function beginReveal() {
    if (revealing || entered) return;
    revealing = true;
    revealTimer = setTimeout(() => {
      entered = true;
    }, REVEAL_DURATION);
  }

  function getRevealSteps(ids: string[], adjacency: number[][]) {
    const steps = new Map<string, number>();
    const startIndex = Math.max(ids.indexOf('20'), 0);
    const distances = ids.map(() => -1);
    const queue = [startIndex];
    distances[startIndex] = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      for (const neighbor of adjacency[index] ?? []) {
        if (distances[neighbor] !== -1) continue;
        distances[neighbor] = distances[index] + 1;
        queue.push(neighbor);
      }
    }

    const lastConnectedStep = Math.max(...distances);
    ids.forEach((id, index) => {
      steps.set(id, distances[index] === -1 ? lastConnectedStep + 1 : distances[index]);
    });
    return steps;
  }

  function viewBoxForState(state: StateShape): [number, number, number, number] {
    const [[x0, y0], [x1, y1]] = state.bounds;
    const width = Math.max(x1 - x0, 1);
    const height = Math.max(y1 - y0, 1);
    const aspect = mapElement && mapElement.clientHeight > 0
      ? mapElement.clientWidth / mapElement.clientHeight
      : MAP_WIDTH / MAP_HEIGHT;
    let targetWidth = width * 1.06;
    let targetHeight = height * 1.06;

    if (targetWidth / targetHeight < aspect) {
      targetWidth = targetHeight * aspect;
    } else {
      targetHeight = targetWidth / aspect;
    }

    return [
      (x0 + x1 - targetWidth) / 2,
      (y0 + y1 - targetHeight) / 2,
      targetWidth,
      targetHeight
    ];
  }

  function animateViewBox(target: [number, number, number, number]) {
    if (mapAnimationFrame) cancelAnimationFrame(mapAnimationFrame);
    const start = [...currentViewBox] as [number, number, number, number];
    const startedAt = performance.now();

    function moveFrame(now: number) {
      const progress = Math.min((now - startedAt) / MAP_MOVE_DURATION, 1);
      const eased = progress < 0.5
        ? 16 * progress ** 5
        : 1 - (-2 * progress + 2) ** 5 / 2;

      currentViewBox = start.map((value, index) =>
        value + (target[index] - value) * eased
      ) as [number, number, number, number];

      if (progress < 1) {
        mapAnimationFrame = requestAnimationFrame(moveFrame);
      } else {
        mapAnimationFrame = undefined;
      }
    }

    mapAnimationFrame = requestAnimationFrame(moveFrame);
  }

  function countiesForState(stateId: string): CountyShape[] {
    if (!makePath) return [];

    return countyFeatures.flatMap((county) => {
      const id = String(county.id).padStart(5, '0');
      if (!id.startsWith(stateId)) return [];
      const path = makePath?.(county);
      if (!path) return [];
      const countyName = typeof county.properties?.name === 'string'
        ? county.properties.name
        : `County ${id.slice(2)}`;
      return [{ id, path, label: countyName }];
    });
  }

  function countyBordersForState(stateId: string) {
    if (!makePath || !countyTopology) return '';

    const geometries = countyTopology.objects.counties.geometries.filter((county) =>
      String(county.id).padStart(5, '0').startsWith(stateId)
    );
    const collection: TopologyGeometryCollection = {
      type: 'GeometryCollection',
      geometries
    };
    const borders = topojsonMesh(countyTopology, collection, (left, right) => left !== right);
    return makePath(borders) ?? '';
  }

  async function selectState(id: string) {
    if (countyClearTimer) clearTimeout(countyClearTimer);
    const state = shapes.find((item) => item.id === id);
    if (!state) return;

    selectedCounties = countiesForState(id);
    selectedCountyBordersPath = countyBordersForState(id);
    selectedId = id;
    hoveredId = null;
    hoveredCountyId = null;
    hoveredRepresentativeId = null;
    pinnedRepresentativeId = null;
    await tick();
    animateViewBox(viewBoxForState(state));
  }

  function resetMap() {
    selectedId = null;
    hoveredId = null;
    hoveredCountyId = null;
    hoveredRepresentativeId = null;
    pinnedRepresentativeId = null;
    geographyMode = 'counties';
    animateViewBox(NATIONAL_VIEW);
    countyClearTimer = setTimeout(() => {
      selectedCounties = [];
      selectedCountyBordersPath = '';
    }, 900);
  }

  function handleStateKeydown(event: KeyboardEvent, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectState(id);
    }
  }

  function previewRepresentative(id: string | null) {
    hoveredRepresentativeId = id;
    hoveredCountyId = null;
  }

  function toggleRepresentative(id: string) {
    if (!window.matchMedia('(hover: hover)').matches) {
      hoveredRepresentativeId = null;
    }
    pinnedRepresentativeId = pinnedRepresentativeId === id ? null : id;
  }

  function setGeographyMode(mode: GeographyMode) {
    geographyMode = mode;
    hoveredCountyId = null;
    hoveredRepresentativeId = null;
    colorHelpOpen = false;
  }

  function previewDistrict(district: DistrictShape, active: boolean) {
    const representative = representativeForDistrict(district);
    hoveredRepresentativeId = active ? representative?.id ?? null : null;
    hoveredCountyId = null;
  }

  function toggleDistrict(district: DistrictShape) {
    const representative = representativeForDistrict(district);
    if (representative) toggleRepresentative(representative.id);
  }

  function handleDistrictKeydown(event: KeyboardEvent, district: DistrictShape) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleDistrict(district);
    }
  }

  function toggleColorHelp(event: MouseEvent) {
    colorHelpOpen = !colorHelpOpen;
    if (!colorHelpOpen) (event.currentTarget as HTMLButtonElement).blur();
  }

  function switchAnalysis(mode: AnalysisMode) {
    analysisMode = mode;
    colorHelpOpen = false;
    if (mode === 'map') resetMap();
  }

  function formatBillDate(value: string) {
    if (!value) return 'Date unavailable';
    const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(date);
  }

  function officialNameForVote(member: BillVoteMember) {
    const official = officialsData
      ? [...officialsData.senators, ...officialsData.representatives].find((item) => item.id === member.id)
      : null;
    return official?.name ?? member.name;
  }

  function voteTone(vote: string) {
    if (vote === 'Yea' || vote === 'Aye') return 'yea';
    if (vote === 'Nay' || vote === 'No') return 'nay';
    return 'absent';
  }

  function proceduralNote(vote: BillVote) {
    if (vote.question.toLowerCase().includes('cloture')) {
      return 'This was a procedural vote on whether to advance to debate. It was not a final vote on passage of the bill.';
    }
    if (vote.question.toLowerCase().includes('passage')) {
      return 'This was a final passage vote in this chamber.';
    }
    return 'This roll call records the exact motion shown above; it should not be treated as final passage unless explicitly labeled that way.';
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && colorHelpOpen) {
      colorHelpOpen = false;
      colorHelpButton?.blur();
      return;
    }
    if (event.key === 'Escape' && selectedId) resetMap();
  }

  function handleWindowResize() {
    if (selectedState) currentViewBox = viewBoxForState(selectedState);
  }
</script>

<svelte:head>
  <title>Actions</title>
  <meta name="description" content="Explore actions across the United States, state by state." />
</svelte:head>

<svelte:window onkeydown={handleWindowKeydown} onresize={handleWindowResize} />

<div class:entered class:revealing class="site-shell">
  <section class="intro" aria-hidden={entered}>
    <button
      class="intro-action"
      onclick={beginReveal}
      disabled={revealing || entered}
      tabindex={revealing || entered ? -1 : 0}
      aria-label="Enter Actions"
    >
      <span class="intro-word">Actions</span>
    </button>
  </section>

  <header class="navbar">
    <div class="nav-primary">
      <button class="wordmark" onclick={() => switchAnalysis('map')} aria-label="Return to the national map">Actions</button>
      <nav class="nav-modes" aria-label="Primary analysis">
        <button
          class:active={analysisMode === 'map'}
          type="button"
          aria-current={analysisMode === 'map' ? 'page' : undefined}
          onclick={() => switchAnalysis('map')}
        >
          Explore
        </button>
        <button
          class:active={analysisMode === 'bills'}
          type="button"
          aria-current={analysisMode === 'bills' ? 'page' : undefined}
          onclick={() => switchAnalysis('bills')}
        >
          Learn
        </button>
      </nav>
    </div>
    <div class="nav-context" aria-live="polite">
      <span class="context-kicker">{analysisMode === 'bills' ? '119th Congress' : 'United States'}</span>
      <span class="context-name">{analysisMode === 'bills' ? 'Bill analysis' : selectedState?.name ?? 'National view'}</span>
    </div>
    <div class="nav-prompt">{analysisMode === 'bills' ? 'Official records' : selectedState ? 'County view' : 'Select a state'}</div>
  </header>

  {#if analysisMode === 'bills'}
    <main class="bills-workspace">
      <aside class="bill-index" aria-label="Bills">
        <header>
          <p class="section-kicker">Bill analysis</p>
          <h1>Federal legislation</h1>
          <p>Official bill history and recorded votes, kept procedurally distinct.</p>
        </header>

        {#if billsLoading}
          <p class="bill-status">Loading official bill data…</p>
        {:else if billsLoadError || !selectedBill}
          <p class="bill-status">Bill data is unavailable.</p>
        {:else}
          <button class="bill-index-card active" type="button" aria-current="true">
            <span>{selectedBill.displayNumber}</span>
            <strong>{selectedBill.title}</strong>
            <small>{selectedBill.policyArea}</small>
          </button>
        {/if}

        <p class="bill-index-note">The first reference case is live. Search and broader congressional coverage come next.</p>
      </aside>

      {#if selectedBill}
        <article class="bill-detail" aria-labelledby="bill-title">
          <header class="bill-detail-header">
            <div class="bill-heading-line">
              <span>{selectedBill.displayNumber}</span>
              <span>Introduced {formatBillDate(selectedBill.introducedDate)}</span>
            </div>
            <h1 id="bill-title">{selectedBill.title}</h1>
            <p class="bill-official-title">{selectedBill.officialTitle}</p>
            <div class="bill-metadata">
              <span>{selectedBill.policyArea}</span>
              <span>Sponsored by {selectedBill.sponsor.name}</span>
              <span>{selectedBill.cosponsorCount} cosponsors</span>
            </div>
            <div class="bill-latest-action">
              <span>Latest action · {formatBillDate(selectedBill.latestAction.date)}</span>
              <p>{selectedBill.latestAction.text}</p>
            </div>
            <a href={selectedBill.congressUrl} target="_blank" rel="noreferrer">View official bill record ↗</a>
          </header>

          <section class="bill-summary" aria-labelledby="bill-summary-title">
            <div class="bill-section-heading">
              <p class="section-kicker">CRS summary</p>
              <h2 id="bill-summary-title">What the bill does</h2>
              <span class="summary-vintage">{selectedBill.summaryStage} · {formatBillDate(selectedBill.summaryDate)}</span>
            </div>
            <p>{selectedBill.summary}</p>
          </section>

          <section class="bill-votes" aria-labelledby="bill-votes-title">
            <div class="bill-section-heading">
              <p class="section-kicker">Recorded votes</p>
              <h2 id="bill-votes-title">How Congress voted</h2>
            </div>

            <div class="bill-vote-tabs" role="tablist" aria-label="Recorded votes on this bill">
              {#each selectedBill.votes as vote (vote.id)}
                <button
                  class:active={selectedBillVote?.id === vote.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedBillVote?.id === vote.id}
                  onclick={() => {
                    selectedBillVoteId = vote.id;
                    billMemberQuery = '';
                  }}
                >
                  <span>{vote.chamber} · Roll {vote.roll}</span>
                  <strong>{vote.question}</strong>
                  <small>{formatBillDate(vote.date)}</small>
                </button>
              {/each}
            </div>

            {#if selectedBillVote}
              <div class="bill-vote-layout">
                <div class="vote-explanation">
                  <span class={`vote-result result-${selectedBillVote.result.toLowerCase().includes('reject') ? 'rejected' : 'passed'}`}>
                    {selectedBillVote.result}
                  </span>
                  <h3>{selectedBillVote.question}</h3>
                  {#if selectedBillVote.description}
                    <p>{selectedBillVote.description}</p>
                  {/if}
                  <p class="procedure-note">{proceduralNote(selectedBillVote)}</p>
                  <div class="vote-counts" aria-label="Vote totals">
                    {#each Object.entries(selectedBillVote.counts) as [position, count]}
                      <div class={`count-${voteTone(position)}`}>
                        <strong>{count}</strong>
                        <span>{position}</span>
                      </div>
                    {/each}
                  </div>
                  <p class="vote-threshold">Required: {selectedBillVote.threshold}</p>
                  <a href={selectedBillVote.source} target="_blank" rel="noreferrer">Official {selectedBillVote.chamber} roll call ↗</a>
                </div>

                <div class="member-votes">
                  <label>
                    <span>Find a legislator</span>
                    <input bind:value={billMemberQuery} type="search" placeholder="Name, state, party, or vote" />
                  </label>
                  <div class="member-vote-list" aria-live="polite">
                    {#each selectedBillVoteMembers as member (`${selectedBillVote.id}-${member.id}`)}
                      <div class={`member-vote-row party-${partyClass(member.party)}`}>
                        <span class="party-dot" aria-hidden="true"></span>
                        <span class="member-vote-name">{officialNameForVote(member)}</span>
                        <span class="member-vote-meta">{member.party} · {member.state}</span>
                        <strong class={`member-position position-${voteTone(member.vote)}`}>{member.vote}</strong>
                      </div>
                    {:else}
                      <p class="bill-status">No legislators match that search.</p>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </section>

          <details class="bill-timeline">
            <summary>Full action timeline <span>{selectedBill.actions.length}</span></summary>
            <ol>
              {#each selectedBill.actions as action}
                <li>
                  <time datetime={action.date}>{formatBillDate(action.date)}</time>
                  <p>{action.text}</p>
                </li>
              {/each}
            </ol>
          </details>
        </article>
      {/if}
    </main>
  {:else}
  <main class:state-focus={Boolean(selectedState)} class="state-workspace">
    <section class="map-shell" aria-label="Interactive map of the United States">
    <div class="map-toolbar">
      <div class="toolbar-actions">
      <button class:visible={Boolean(selectedState)} class="back-button" onclick={resetMap} tabindex={selectedState ? 0 : -1}>
        <span aria-hidden="true">←</span>
        All states
      </button>

        {#if selectedState}
          <div class="geography-control" role="group" aria-label="State geography">
            <button
              class:active={geographyMode === 'counties'}
              type="button"
              aria-pressed={geographyMode === 'counties'}
              onclick={() => setGeographyMode('counties')}
            >Counties</button>
            <button
              class:active={geographyMode === 'districts'}
              type="button"
              aria-pressed={geographyMode === 'districts'}
              onclick={() => setGeographyMode('districts')}
            >Districts</button>
          </div>
        {/if}

        {#if geographyMode === 'districts' && selectedState}
          <span class="district-vintage">House districts · 119th Congress</span>
        {:else}
          <label class="election-control">
            <span>Presidential vote</span>
            <select bind:value={selectedElectionYear} disabled={electionLoading}>
              <option value={2016}>2016</option>
              <option value={2020}>2020</option>
              <option value={2024}>2024</option>
            </select>
          </label>

          <div class:open={colorHelpOpen} class="election-help">
            <button
              bind:this={colorHelpButton}
              class="election-help-trigger"
              type="button"
              aria-label="Explain election map colors"
              aria-describedby="election-color-help"
              aria-expanded={colorHelpOpen}
              onclick={toggleColorHelp}
            >
              ?
            </button>
            <div class="election-help-popover" id="election-color-help" role="tooltip">
              <strong>How to read the colors</strong>
              <p>
                Blue shows a Democratic lead and red shows a Republican lead. Deeper color means a
                larger Democratic–Republican vote margin; paler color means a closer result.
              </p>
              <p>Hover temporarily darkens a region. Gray means tied or unavailable.</p>
            </div>
          </div>
        {/if}
      </div>

      <div class="state-readout" aria-live="polite">
        <div class="readout-place">
          {#if geographyMode === 'districts' && activeRepresentative}
            <span class="readout-code">{districtLabel(activeRepresentative)}</span>
            <span class="readout-name">{activeRepresentative.name}</span>
          {:else if hoveredCounty}
            <span class="readout-code">{hoveredCounty.id}</span>
            <span class="readout-name">{hoveredCounty.label}</span>
          {:else}
            <span class="readout-code">{hoveredState?.code ?? selectedState?.code ?? 'US'}</span>
            <span class="readout-name">{hoveredState?.name ?? selectedState?.name ?? 'Choose a state'}</span>
          {/if}
        </div>

        {#if geographyMode === 'districts'}
          {#if activeRepresentative}
            <div class={`district-readout party-${partyClass(activeRepresentative.party)}`}>
              <span>Representative party</span>
              <strong>{partyName(activeRepresentative.party)}</strong>
            </div>
          {:else}
            <span class="election-unavailable">Hover a district for its representative</span>
          {/if}
        {:else if readoutElection}
          <div class={`election-readout result-${electionPartyClass(readoutElection)}`}>
            <span>{selectedElectionYear} President</span>
            <strong>{electionMargin(readoutElection)}</strong>
            <span>D {voteShare(readoutElection.d, readoutElection.t)} · R {voteShare(readoutElection.r, readoutElection.t)}</span>
          </div>
        {:else if (hoveredCounty || readoutState) && !electionLoading}
          <span class="election-unavailable">Result unavailable for this geography</span>
        {:else if electionLoadError}
          <span class="election-unavailable">Election data unavailable</span>
        {:else}
          <span class="election-unavailable">Hover a state for {selectedElectionYear} results</span>
        {/if}
      </div>
    </div>

    <div class="map-frame">
      {#if loading}
        <p class="map-status">Preparing the map…</p>
      {:else if loadError}
        <p class="map-status">The map could not be loaded.</p>
      {:else}
        <svg
          bind:this={mapElement}
          class="us-map"
          viewBox={currentViewBox.join(' ')}
          role="group"
          aria-label={selectedState ? `Counties of ${selectedState.name}` : 'States of the United States'}
        >
          <defs>
            <mask
              id="boundary-reveal-mask"
              x="0"
              y="0"
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              maskUnits="userSpaceOnUse"
            >
              {#each shapes as state (state.id)}
                <path
                  class="boundary-mask-state"
                  d={state.path}
                  style={`--draw-delay: ${state.revealStep * 125}ms`}
                />
              {/each}
            </mask>
          </defs>

          <g class="state-layer">
            {#each shapes as state (state.id)}
              <path
                class:dimmed={Boolean(selectedId && selectedId !== state.id)}
                class:selected={selectedId === state.id}
                class:hovered={hoveredId === state.id}
                class="state-shape"
                d={state.path}
                style={`${electionStyle(getElectionResult(electionData, selectedElectionYear, 'states', state.id))}; --draw-delay: ${state.revealStep * 125}ms`}
                role="button"
                aria-label={`View ${state.name}. ${electionDescription(getElectionResult(electionData, selectedElectionYear, 'states', state.id))}`}
                tabindex={selectedId && selectedId !== state.id ? -1 : 0}
                onclick={() => selectState(state.id)}
                onkeydown={(event) => handleStateKeydown(event, state.id)}
                onmouseenter={() => (hoveredId = state.id)}
                onmouseleave={() => (hoveredId = null)}
                onfocus={() => (hoveredId = state.id)}
                onblur={() => (hoveredId = null)}
              />
            {/each}
          </g>

          <g
            class:hidden={Boolean(selectedState)}
            class="boundary-layer"
            mask="url(#boundary-reveal-mask)"
            aria-hidden="true"
          >
            <path class="state-boundaries" d={internalBordersPath} />
            <path class="national-outline" d={nationalOutlinePath} />
          </g>

          <g
            class:visible={Boolean(selectedState)}
            class:district-context={geographyMode === 'districts'}
            class="county-layer"
          >
            {#each selectedCounties as county (county.id)}
              <path
                class:hovered={hoveredCountyId === county.id}
                class="county-shape"
                d={county.path}
                style={geographyMode === 'counties'
                  ? electionStyle(getElectionResult(electionData, selectedElectionYear, 'counties', county.id))
                  : '--region-fill: #f3f3f1; --region-hover: #f3f3f1'}
                role={geographyMode === 'counties' ? 'img' : undefined}
                aria-label={`${county.label}, FIPS ${county.id}. ${electionDescription(getElectionResult(electionData, selectedElectionYear, 'counties', county.id))}`}
                onmouseenter={() => {
                  if (geographyMode === 'counties') hoveredCountyId = county.id;
                }}
                onmouseleave={() => (hoveredCountyId = null)}
              />
            {/each}
          </g>

          {#if geographyMode === 'districts' && selectedState}
            <g class="district-mode-fill-layer" aria-hidden="true">
              {#each selectedDistricts as district (district.id)}
                {@const representative = representativeForDistrict(district)}
                <path
                  class={`district-mode-fill party-${partyClass(representative?.party ?? '')}`}
                  d={district.path}
                />
              {/each}
            </g>
          {/if}

          {#if activeDistrict && geographyMode === 'counties'}
            {#key activeDistrict.id}
              <g
                class={`district-fill-layer party-${partyClass(activeRepresentative?.party ?? '')}`}
                aria-hidden="true"
              >
                <path
                  class="district-fill"
                  d={activeDistrict.path}
                />
              </g>
            {/key}
          {/if}

          <g
            class:visible={Boolean(selectedState)}
            class:district-context={geographyMode === 'districts'}
            class="county-border-layer"
            aria-hidden="true"
          >
            <path class="county-boundaries" d={selectedCountyBordersPath} />
          </g>

          {#if geographyMode === 'districts' && selectedState}
            <g class="district-mode-layer">
              {#each selectedDistricts as district (district.id)}
                {@const representative = representativeForDistrict(district)}
                <g
                  class:active={activeRepresentativeId === representative?.id}
                  class={`district-mode-region party-${partyClass(representative?.party ?? '')}`}
                  role="button"
                  aria-label={representative
                    ? `${districtLabel(representative)}, represented by ${representative.name}, ${partyName(representative.party)}`
                    : `Congressional district ${districtMapLabel(district)}, representative unavailable`}
                  tabindex="0"
                  onclick={() => toggleDistrict(district)}
                  onkeydown={(event) => handleDistrictKeydown(event, district)}
                  onmouseenter={() => previewDistrict(district, true)}
                  onmouseleave={() => previewDistrict(district, false)}
                  onfocus={() => previewDistrict(district, true)}
                  onblur={() => previewDistrict(district, false)}
                >
                  <path class="district-mode-separator" d={district.path} />
                  <path class="district-mode-hit" d={district.path} />
                  <text
                    class="district-mode-label"
                    x={district.label[0]}
                    y={district.label[1]}
                    style={`font-size: ${currentViewBox[2] * 0.009}px; stroke-width: ${currentViewBox[2] * 0.0028}px`}
                    text-anchor="middle"
                    dominant-baseline="central"
                  >{districtMapLabel(district)}</text>
                </g>
              {/each}
            </g>
          {/if}

          {#if activeDistrict && geographyMode === 'counties'}
            {#key activeDistrict.id}
              <g class="district-outline-layer" aria-hidden="true">
                <path class="district-outline-separator" d={activeDistrict.path} />
                <path class="district-outline" d={activeDistrict.path} />
              </g>
            {/key}
          {/if}

          <path
            class:visible={Boolean(selectedState)}
            class="state-focus-outline"
            d={selectedState?.path ?? ''}
            aria-hidden="true"
          />

          <g class:hidden={Boolean(selectedId)} class="leader-layer" aria-hidden="true">
            {#each shapes.filter((state) => state.hasLeader) as state (state.id)}
              <polyline
                class="label-leader"
                style={`--draw-delay: ${state.revealStep * 125}ms`}
                points={`${state.anchor[0]},${state.anchor[1]} 928,${state.label[1]} ${state.label[0] - 11},${state.label[1]}`}
              />
            {/each}
          </g>

          <g class:hidden={Boolean(selectedId)} class="label-layer">
            {#each shapes as state (state.id)}
              <g
                class:hovered={hoveredId === state.id}
                class="state-label"
                style={`--draw-delay: ${state.revealStep * 125}ms`}
                transform={`translate(${state.label[0]} ${state.label[1]})`}
                role="button"
                aria-label={`View ${state.name}`}
                tabindex="-1"
                onclick={() => selectState(state.id)}
                onkeydown={(event) => handleStateKeydown(event, state.id)}
                onmouseenter={() => (hoveredId = state.id)}
                onmouseleave={() => (hoveredId = null)}
              >
                <circle r={state.hasLeader ? 10 : 9} />
                <text text-anchor="middle" dominant-baseline="central">{state.code}</text>
              </g>
            {/each}
          </g>
        </svg>
      {/if}
    </div>

    <p class="map-footnote">
      {selectedState
        ? geographyMode === 'districts'
          ? 'District color represents the current House member’s affiliation'
          : 'Hover a representative to reveal their district'
        : 'Click a state to move closer'}
      <span>·</span>
      Press Esc to return
    </p>
    </section>

    {#if selectedState}
      <aside
        class="officials-panel"
        aria-labelledby="officials-panel-title"
        aria-busy={officialsLoading}
      >
        <header class="officials-header">
          <p class="section-kicker">Federal delegation</p>
          <div class="officials-title-row">
            <h2 id="officials-panel-title">{selectedState.name}</h2>
            <span>{selectedState.code}</span>
          </div>
          {#if geographyMode === 'districts'}
            <div class="panel-district-summary">
              <span>House districts</span>
              <strong>119th Congress</strong>
              <span>Color shows representative affiliation</span>
            </div>
          {:else if selectedStateElection}
            <div class={`panel-election-summary result-${electionPartyClass(selectedStateElection)}`}>
              <span>{selectedElectionYear} President</span>
              <strong>{electionMargin(selectedStateElection)}</strong>
              <span>D {voteShare(selectedStateElection.d, selectedStateElection.t)} · R {voteShare(selectedStateElection.r, selectedStateElection.t)}</span>
            </div>
          {/if}
          <p class="delegation-summary">
            {selectedState.code === 'DC' ? 'No senators' : `${selectedSenators.length} senators`}
            <span>·</span>
            {selectedRepresentatives.length} House {selectedRepresentatives.length === 1 ? 'seat' : 'seats'}
          </p>
          <p class="roster-vintage">{rosterVintage()}</p>
        </header>

        <section class="senators-section" aria-labelledby="senators-title">
          <div class="section-heading">
            <h3 id="senators-title">Senators</h3>
            <span>Pinned</span>
          </div>

          {#if officialsLoading}
            <p class="panel-status">Loading current roster…</p>
          {:else if officialsLoadError}
            <p class="panel-status">The federal roster is unavailable.</p>
          {:else if selectedState.code === 'DC'}
            <div class="no-senators">
              <span aria-hidden="true">—</span>
              <p>The District of Columbia has no U.S. senators.</p>
            </div>
          {:else if selectedSenators.length === 0}
            <p class="panel-status">No current senators were found.</p>
          {:else}
            <div class="senator-grid">
              {#each selectedSenators as senator (senator.id)}
                <article class={`senator-card party-${partyClass(senator.party)}`}>
                  <div class="official-card-topline">
                    <span class="party-dot" aria-hidden="true"></span>
                    <span>{partyName(senator.party)}</span>
                  </div>
                  <h4>{senator.name}</h4>
                  <p>U.S. Senator · Class {senator.class}</p>
                </article>
              {/each}
            </div>
          {/if}
        </section>

        <section class="representatives-section" aria-labelledby="representatives-title">
          <div class="section-heading representatives-heading">
            <h3 id="representatives-title">Representatives</h3>
            <span>{selectedRepresentatives.length}</span>
          </div>

          <div class="representative-list">
            {#if officialsLoading}
              <p class="panel-status">Loading House delegation…</p>
            {:else if officialsLoadError}
              <p class="panel-status">The House roster is unavailable.</p>
            {:else if selectedRepresentatives.length === 0}
              <p class="panel-status">No current House member was found.</p>
            {:else}
              {#each selectedRepresentatives as representative (representative.id)}
                <button
                  class:active={activeRepresentativeId === representative.id}
                  class:pinned={pinnedRepresentativeId === representative.id}
                  class={`representative-card party-${partyClass(representative.party)}`}
                  type="button"
                  aria-pressed={pinnedRepresentativeId === representative.id}
                  aria-label={`${representative.name}, ${partyName(representative.party)}, ${districtLabel(representative)}. Show district on map.`}
                  onclick={() => toggleRepresentative(representative.id)}
                  onmouseenter={() => previewRepresentative(representative.id)}
                  onmouseleave={() => previewRepresentative(null)}
                  onfocus={() => previewRepresentative(representative.id)}
                  onblur={() => previewRepresentative(null)}
                >
                  <span class="representative-district">
                    {representative.role === 'Delegate' ? 'Delegate · ' : ''}{districtLabel(representative)}
                  </span>
                  <span class="representative-name">{representative.name}</span>
                  <span class="representative-party">
                    <span class="party-dot" aria-hidden="true"></span>
                    {partyName(representative.party)}
                  </span>
                  <span class="district-action" aria-hidden="true">
                    {pinnedRepresentativeId === representative.id ? 'Pinned' : 'View district'}
                  </span>
                </button>
              {/each}
            {/if}
          </div>
        </section>
      </aside>
    {/if}
  </main>
  {/if}
</div>
