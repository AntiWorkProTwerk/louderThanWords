<script lang="ts">
  import {catalogViews} from '$lib/civic/catalog';
  import {mapScopeFor,mapViewDataKeys} from '$lib/civic/map-inspector';
  import { patternMapMetrics, type PatternsData } from '$lib/civic/patterns';
  import { onMount, untrack, setContext, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { createRepository } from '$lib/data/repository';
  import { panels, type Manifest, type StateSummary, type Panel } from '$lib/data/schema';
  import USMap from './USMap.svelte';
  import ExploreCatalog from './ExploreCatalog.svelte';
  import { mapFocusContext, type MapFocusContext } from '$lib/civic/map-focus';
  import { connectionStateCounts, type ConnectionsData } from '$lib/civic/connections';
  import PoliticianCard from './PoliticianCard.svelte';
  import ActionIcon from './ActionIcon.svelte';
  import DetailPanel from './DetailPanel.svelte';
  import type { Snippet } from 'svelte';
  import type { TrialData } from '$lib/civic/trials';
  import { filterResearch, researchFilters, type ResearchData } from '$lib/civic/research';
  import { paycheckSelection, paycheckRegions, type PaycheckData } from '$lib/civic/paycheck';
  import { complaintSelection, complaintPeriods, filterComplaints, type ComplaintData } from '$lib/civic/complaints';
  import { chartSelection, stateUnemployment, type EconomyData } from '$lib/civic/economy';
  import { wageSelection, filterWages } from '$lib/civic/wages';
  import type { WageIndex } from '$lib/civic/wage-index';
  import { filterLobbying, type LobbyingData } from '$lib/civic/lobbying';
  import { careerStateCounts, type RevolvingData } from '$lib/civic/revolving';
  import { billStateCounts, type GraveyardData } from '$lib/civic/graveyard';
  import { nursingMapContext, type NursingMapContext } from '$lib/civic/nursing-map';
  import type { NursingIndex } from '$lib/civic/nursing-index';
  import type { NursingSummary } from '$lib/civic/nursing';
  import { filterEcho, echoStateCounts, type EchoData } from '$lib/civic/echo';
  import { holdingStateCounts, type HoldingsData } from '$lib/civic/holdings';
  import { stakeStateCounts, type StakeData } from '$lib/civic/major-stakes';
  import { sharedStateCounts, type SharedData } from '$lib/civic/shared-investors';
  import { insiderStateCounts, type InsiderData } from "$lib/civic/insiders";
  import { waterStateCounts, type WaterData } from '$lib/civic/water';
  // Stable empty coverage: state highlighting must not invalidate the metric layer.
  const emptyMapCounts: Record<string, number> = {};
  let {
    manifest,
    initialSummary,
    children,
  }: { manifest: Manifest; initialSummary: StateSummary; children?: Snippet } = $props();
  const votesMode = $derived(page.url.pathname.includes('/records/votes'));
  const trialsMode = $derived(page.url.pathname.includes('/records/trials'));
  const rulesMode = $derived(page.url.pathname.includes('/records/rules'));
  const chartsMode = $derived(page.url.pathname.includes('/records/charts'));
  const researchMode = $derived(page.url.pathname.includes('/records/research'));
  const paycheckMode = $derived(page.url.pathname.includes('/records/paycheck'));
  const complaintsMode = $derived(page.url.pathname.includes('/records/complaints'));
  const wagesMode = $derived(page.url.pathname.includes('/records/wages'));
  const lobbyingMode = $derived(page.url.pathname.includes('/records/lobbying'));
  const revolvingMode = $derived(page.url.pathname.includes('/records/revolving'));
  const graveyardMode = $derived(page.url.pathname.includes('/records/graveyard'));
  const nursingMode = $derived(page.url.pathname.includes('/records/nursing'));
  const enforcementMode = $derived(page.url.pathname.includes('/records/enforcement'));
  const holdingsMode = $derived(page.url.pathname.includes('/records/holdings'));
  const connectionsMode = $derived(page.url.pathname.includes('/records/connections'));
  const patternsMode = $derived(page.url.pathname.includes('/records/patterns'));
  const stakesMode = $derived(page.url.pathname.includes('/records/major-stakes'));
  const sharedMode = $derived(page.url.pathname.includes('/records/shared-investors'));
  const insidersMode = $derived(page.url.pathname.includes("/records/insiders"));
  const waterMode = $derived(page.url.pathname.includes('/records/water'));
  const recordsMode = $derived(votesMode || trialsMode || rulesMode || chartsMode || researchMode || paycheckMode || complaintsMode || wagesMode || lobbyingMode || revolvingMode || graveyardMode || nursingMode || enforcementMode || waterMode || insidersMode || holdingsMode || sharedMode || stakesMode || connectionsMode || patternsMode);
  const evidenceMode = $derived(page.url.pathname.includes('/said-vs-did') || recordsMode);
  const mapViewId = $derived(catalogViews.find(v=>page.url.pathname.startsWith(`${base}${v.path}`))?.id);
  const repository = createRepository(base),
    client = useQueryClient();
  let activeManifest = $state(untrack(() => manifest)),
    nextManifest = $state<Manifest | null>(null),
    focusRequest = $state(0),
    expanded = $state(false),
    mounted = $state(false),
    actionsOpen = $state(false),
    refreshError = $state('');
  let detailTrigger: HTMLElement | undefined;
  let Diagnostics: any = $state(null);
  let evidenceLabelHeight = $state(280);
  let readingMode = $state(false), panelHidden = $state(false);
  let panelRestore: HTMLButtonElement | undefined = $state();
  async function hideEvidence() {
    panelHidden = true;
    await tick();
    panelRestore?.focus({preventScroll:true});
  }
  async function showEvidence() {
    panelHidden = false;
    await tick();
    document.querySelector<HTMLButtonElement>('.evidence-dock-bar button')?.focus({preventScroll:true});
  }
  const atlasRoute = $derived(page.url.pathname);
  $effect(() => { void atlasRoute; panelHidden = false; readingMode = false; });
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const mapScope = $derived(mapScopeFor(mapViewId, !evidenceMode || !!(page.data as Record<string,unknown>)[mapViewDataKeys[mapViewId??'']], params.get('metric')==='unemployment'));
  const trialData = $derived(page.data.trials?.data as TrialData | undefined);
  const researchData = $derived(page.data.research?.data as ResearchData | undefined);
  const paycheckData = $derived(page.data.paycheck?.data as PaycheckData | undefined);
  const complaintData = $derived(page.data.complaints?.data as ComplaintData | undefined);
  const wageData = $derived(page.data.wages?.data as WageIndex | undefined);
  const lobbyingData = $derived(page.data.lobbying?.data as LobbyingData | undefined);
  const revolvingData = $derived(page.data.revolving?.data as RevolvingData | undefined);
  const graveyardData = $derived(page.data.graveyard?.data as GraveyardData | undefined);
  const nursingData = $derived(page.data.nursing?.data as NursingIndex | undefined);
  const echoData = $derived(page.data.echo?.data as EchoData | undefined);
  const waterData = $derived(page.data.water?.data as WaterData | undefined);
  const connectionsData = $derived(page.data.connections?.data as ConnectionsData | undefined);
  const connectionsCounts = $derived(connectionsMode && connectionsData ? connectionStateCounts(connectionsData, params) : {});
  const patternsData = $derived(page.data.patterns?.data as PatternsData | undefined);
  const patternsMapKey = $derived(JSON.stringify(['year','pair'].filter(k => params.has(k)).map(k => [k,params.get(k)!])));
  const patternsLayer = $derived.by(() => {
    if (!patternsMode || !patternsData) return {metrics:{},available:false};
    try { return {metrics:patternMapMetrics(patternsData, new URLSearchParams(JSON.parse(patternsMapKey))),available:true}; } catch { return {metrics:{},available:false}; }
  });
  const patternsMetrics = $derived(patternsLayer.metrics);
  const patternsPeer = $derived(patternsMode && patternsData &&
    patternsData.states.some(s=>s.code===params.get('peer')) &&
    patternsData.states.some(s=>s.code===(params.get('state') ?? 'TX')) &&
    params.get('peer') !== (params.get('state') ?? 'TX') && patternsLayer.available
      ? activeManifest.states.find(s=>s.code===params.get('peer')) ?? null : null);
  const stakesData = $derived(page.data.majorStakes?.data as StakeData | undefined);
  const stakesMapKey = $derived(JSON.stringify(['q','issuer','form','initial'].map(k => [k,params.get(k) ?? ''])));
  const stakesCounts = $derived(stakesMode && stakesData ? stakeStateCounts(stakesData,new URLSearchParams(JSON.parse(stakesMapKey))) : {});
  const sharedData = $derived(page.data.sharedInvestors?.data as SharedData | undefined);
  const sharedCounts = $derived(sharedMode && sharedData ? sharedStateCounts(sharedData,params.get('group') ?? sharedData.catalog.groups[0]?.id) : {});
  const holdingsData = $derived(page.data.holdings?.data as HoldingsData | undefined);
  const holdingMapKey = $derived(params.get('manager') ?? '');
  const holdingsCounts = $derived(holdingsMode && holdingsData ? holdingStateCounts(holdingsData,new URLSearchParams({manager:holdingMapKey})) : {});
  const insiderData = $derived(page.data.insiders?.data as InsiderData | undefined);
  const catalogCompanyCik = $derived.by(() => {
    const cik = params.get('issuer') ?? params.get('company');
    if (!cik) return undefined;
    if (connectionsMode && connectionsData?.entities.some((e) => e.cik === cik)) return cik;
    if (stakesMode && stakesData?.issuers.some((e) => e.cik === cik)) return cik;
    if (insidersMode && insiderData?.issuers.some((e) => e.cik === cik)) return cik;
    if (sharedMode && sharedData?.companies.some((e) => e.cik === cik)) return cik;
    return undefined;
  });
  const insiderMapKey = $derived(JSON.stringify(["q","issuer","owner","form","kind","month","plan"].map(k => [k,params.get(k) ?? ""])));
  const insiderCounts = $derived(insidersMode && insiderData ? insiderStateCounts(insiderData,new URLSearchParams(JSON.parse(insiderMapKey))) : {});
  const waterMapKey = $derived(JSON.stringify(['q', 'type', 'kind'].map(k => [k, params.get(k) ?? ''])));
  const waterCounts = $derived(waterMode && waterData ? waterStateCounts(waterData, new URLSearchParams(JSON.parse(waterMapKey))) : {});
  const echoMapKey = $derived(JSON.stringify(['q', 'program', 'repeated'].map(k => [k, params.get(k) ?? ''])));
  const echoCounts = $derived(enforcementMode && echoData ? echoStateCounts(echoData, new URLSearchParams(JSON.parse(echoMapKey))) : {});
  const echoFacilities = $derived(enforcementMode && echoData ? filterEcho(echoData, new URLSearchParams(JSON.parse(echoMapKey))) : []);
  const echoSites = $derived(echoFacilities.filter(f => (!params.get('state') || f.state === params.get('state')) && (!params.get('facility') || f.id === params.get('facility')) && f.lat !== null && f.lon !== null).map(f => ({ id: f.id, label: `${f.name} · ${f.identitySystem} ${f.id} · EPA facility coordinates, may be approximate; not an exposure area`, lng: f.lon!, lat: f.lat! })));
  let nursingFiltered = $state<NursingSummary[] | null>(null);
  setContext<NursingMapContext>(nursingMapContext, { set: (facilities) => nursingFiltered = facilities });
  const nursingFacilities = $derived(nursingMode ? nursingFiltered ?? nursingData?.facilities ?? [] : []);
  const nursingCounts = $derived(nursingFacilities.reduce<Record<string, number>>((counts,f)=>{counts[f.state]=(counts[f.state]??0)+1;return counts;},{}));
  const nursingSites = $derived(nursingFacilities.filter(f => (!params.get('state') || f.state === params.get('state')) && (!params.get('facility') || f.id === params.get('facility')) && f.lat!==null && f.lon!==null).map(f=>({id:f.id,label:`${f.name} · CCN ${f.id} · CMS facility coordinates, may be approximate`,lng:f.lon!,lat:f.lat!})));
  const graveyardMapKey = $derived(JSON.stringify(['q','congress','chamber','policy','stage','quiet'].map(k=>[k,params.get(k)??''])));
  const graveyardCounts = $derived(graveyardMode && graveyardData ? billStateCounts(graveyardData,new URLSearchParams(JSON.parse(graveyardMapKey))) : {});
  const revolvingMapKey = $derived(JSON.stringify(['q','client','year','filing','positions'].map(k=>[k,params.get(k)??''])));
  const revolvingCounts = $derived(revolvingMode && revolvingData ? careerStateCounts(revolvingData,new URLSearchParams(JSON.parse(revolvingMapKey))) : {});
  const lobbyingMapKey = $derived(JSON.stringify(['q','client','year','issue'].map(k=>[k,params.get(k)??''])));
  const lobbyingCounts = $derived(lobbyingMode && lobbyingData ? filterLobbying(lobbyingData.records,new URLSearchParams(JSON.parse(lobbyingMapKey))).reduce<Record<string,number>>((counts,r)=>{if(r.client.country==='US'&&r.client.state)counts[r.client.state]=(counts[r.client.state]??0)+1;return counts;},{}) : {});
  const wageMapKey = $derived(JSON.stringify({...wageSelection(params),state:undefined}));
  const wageCounts = $derived(wagesMode && wageData ? filterWages(wageData,JSON.parse(wageMapKey)).reduce<Record<string,number>>((counts,r)=>{if(r.state)counts[r.state]=(counts[r.state]??0)+1;return counts;},{}) : {});
  const complaintCounts = $derived.by(()=>{
    if(!complaintsMode||!complaintData)return {};
    try{const selection=complaintSelection(complaintData,params),periods=complaintPeriods(complaintData,selection.split);return filterComplaints(complaintData,{...selection,state:undefined}).filter(r=>selection.period==='all'||(selection.period==='baseline'?r.received<periods.after.from:r.received>=periods.after.from)).reduce<Record<string,number>>((counts,r)=>{if(r.state)counts[r.state]=(counts[r.state]??0)+1;return counts;},{});}catch{return {}}
  });
  const paycheckMetrics = $derived.by(()=>{
    if(!paycheckMode||!paycheckData)return {};
    try{const selection=paycheckSelection(paycheckData,params),metric=params.get('metric')==='employment'?'employment':params.get('metric')==='nominal'?'nominal':'real';return Object.fromEntries(paycheckRegions(paycheckData,selection).filter(s=>s[metric]!==null).map(s=>[s.code,{value:s[metric]!,display:`Δ ${s[metric]!>0?'+':''}${s[metric]!.toFixed(1)}%`,color:s[metric]!>0?'#a6cbbb':s[metric]!<0?'#dfbc8d':'#dedbcf',label:`${s.name}: ${s[metric]!.toFixed(2)}% change in ${metric==='employment'?'private payroll jobs':metric==='real'?'hourly earnings after a common national CPI adjustment':'nominal hourly earnings'}, ${selection.from} to ${selection.through}. Not seasonally adjusted. State aggregate; point is a label anchor, not a workplace.`}]))}catch{return {}};
  });
  const researchProjects = $derived(researchData ? filterResearch(researchData, {...researchFilters(researchData,params),state:undefined}) : []);
  const researchCounts = $derived(researchProjects.reduce<Record<string,number>>((counts,p)=>{if(p.organization.state)counts[p.organization.state]=(counts[p.organization.state]??0)+1;return counts;},{}));
  const researchSelected = $derived(researchData?.projects.find(p=>p.id===params.get('project')));
  const researchSites = $derived((researchSelected ? researchData?.projects.filter(p=>p.core===researchSelected.core)??[] : researchProjects.filter(p=>!params.get('state')||p.organization.state===params.get('state'))).filter(p=>p.organization.lat!==null&&p.organization.lon!==null).map(p=>({id:p.id,label:`${p.organization.name} · FY ${p.year} · ${p.number} (NIH funded-organization location, not a study site or spending destination)`,lng:p.organization.lon!,lat:p.organization.lat!})));
  const economicData = $derived(page.data.economy?.data as EconomyData | undefined);
  const economicSelection = $derived(economicData ? chartSelection(economicData,params) : null);
  const economicMetrics = $derived(chartsMode && economicData && economicSelection?.metric === 'unemployment' ? Object.fromEntries(stateUnemployment(economicData,economicSelection.config.from,economicSelection.config.through).filter(s=>s.end!==null).map(s=>[s.code,{value:s.end!,label:`${s.name}: ${s.end!.toFixed(1)}% unemployment in ${economicSelection.config.through}; ${s.change===null?'start-month comparison unavailable':`${s.change.toFixed(1)} percentage-point change since ${economicSelection.config.from}`}. Seasonally adjusted; by residence.`}])) : {});
  const trialSites = $derived((trialData?.studies.find((s) => s.id === params.get('study'))?.locations ?? []).filter((s) => s.lat !== null && s.lon !== null).map((s,i) => ({ id: String(i), label: `${s.facility} · ${s.city}, ${s.reportedState} (registry location; may be approximate)`, lng: s.lon!, lat: s.lat! })));
  const selectedCode = $derived(
    activeManifest.states.some((s) => s.code === params.get('state'))
      ? params.get('state')!
      : (page.data.evidenceState ?? 'TX'),
  );
  const selected = $derived(activeManifest.states.find((s) => s.code === selectedCode)!);
  let contextualFocus = $state<string | null>(null);
  const mapSelected = $derived(activeManifest.states.find((s) => s.code === contextualFocus) ?? selected);
  setContext<MapFocusContext>(mapFocusContext, {
    focusState: async (code) => {
      if (!activeManifest.states.some((s) => s.code === code)) return;
      contextualFocus = code;
      expanded = false;
      focusRequest += 1;
      await tick();
      document.querySelector<HTMLElement>('[data-map-focus-current]')?.focus({preventScroll:true});
    },
  });
  $effect(() => {
    const location = page.url.href;
    untrack(() => { contextualFocus = null; });
  });
  const panel = $derived(
    panels.includes(params.get('panel') as Panel) ? (params.get('panel') as Panel) : 'people',
  );
  const personId = $derived(params.get('person') ?? '');
  const party = $derived(
    ['R', 'D', 'I'].includes(params.get('party') ?? '') ? params.get('party')! : 'all',
  );
  const search = $derived(params.get('q') ?? '');
  const stateQuery = createQuery(() => ({
    enabled: browser && !recordsMode,
    queryKey: ['state', activeManifest.release, selectedCode],
    queryFn: ({ signal }) => repository.getState(activeManifest.release, selectedCode, signal),
    initialData:
      selectedCode === 'TX' && activeManifest.release === manifest.release
        ? initialSummary
        : undefined,
  }));
  const people = $derived(
    (stateQuery.data?.people ?? []).filter(
      (p) =>
        (party === 'all' || p.party === party) &&
        `${p.name} ${p.role} ${p.issues.join(' ')}`.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const actionItems: [Panel, string, string, string][] = [
    ['call', 'Call representative', 'Connect directly', 'red'],
    ['votes', 'Track votes', 'Follow the record', 'blue'],
    ['donors', 'Review donor activity', 'See who funds them', 'yellow'],
    ['compare', 'Compare issue positions', 'Align your values', 'black'],
    ['bills', 'See related bills', 'Explore connections', 'red'],
  ];
  async function navigate(changes: Record<string, string | null>, replace = false) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
  }
  async function chooseState(code: string) {
    if (evidenceMode) {
      const url = new URL(page.url);
      url.pathname = `${base}/${patternsMode ? 'records/patterns' : connectionsMode ? 'records/connections' : stakesMode ? 'records/major-stakes' : sharedMode ? 'records/shared-investors' : holdingsMode ? "records/holdings" : insidersMode ? "records/insiders" : waterMode ? 'records/water' : enforcementMode ? 'records/enforcement' : votesMode ? 'records/votes' : trialsMode ? 'records/trials' : rulesMode ? 'records/rules' : chartsMode ? 'records/charts' : researchMode ? 'records/research' : paycheckMode ? 'records/paycheck' : complaintsMode ? 'records/complaints' : wagesMode ? 'records/wages' : lobbyingMode ? 'records/lobbying' : revolvingMode ? 'records/revolving' : graveyardMode ? 'records/graveyard' : nursingMode ? 'records/nursing' : 'said-vs-did'}/`;
      if (code) url.searchParams.set('state', code);
      else url.searchParams.delete('state');
      if (votesMode) url.searchParams.delete('receipt');
      else if (trialsMode) { url.searchParams.delete('study'); url.searchParams.delete('links'); }
      else if (chartsMode) { url.searchParams.set('metric','unemployment'); url.searchParams.set('adjustment','nominal'); if(page.data.economy?.release) url.searchParams.set('release',page.data.economy.release); }
      else if (researchMode) { url.searchParams.delete('project'); url.searchParams.delete('links'); }
      else if (paycheckMode) { if(page.data.paycheck?.release) url.searchParams.set('release',page.data.paycheck.release); }
      else if (complaintsMode) url.searchParams.delete('complaint');
      else if (wagesMode) url.searchParams.delete('case');
      else if (lobbyingMode) url.searchParams.delete('filing');
      else if (revolvingMode) { url.searchParams.delete('lobbyist'); url.searchParams.delete('source'); }
      else if (graveyardMode) url.searchParams.delete('bill');
      else if (nursingMode) url.searchParams.delete('facility');
      else if (patternsMode) { if (page.data.patterns?.release) url.searchParams.set('release', page.data.patterns.release); }
      else if (connectionsMode) url.searchParams.delete('company');
      else if (stakesMode) for (const key of ['series','filing','reporter']) url.searchParams.delete(key);
      else if (sharedMode) for (const key of ['company','cell']) url.searchParams.delete(key);
      else if (holdingsMode) for (const key of ['manager','before','after','position','filing']) url.searchParams.delete(key);
      else if (insidersMode) url.searchParams.delete("filing");
      else if (waterMode) ['system', 'year', 'status'].forEach(k => url.searchParams.delete(k));
      else if (enforcementMode) ['facility', 'from', 'through', 'source', 'kind'].forEach(k => url.searchParams.delete(k));
      else if (!rulesMode) url.search = `?state=${code}`;
      await goto(url, { noScroll: true, keepFocus: true });
      if (code) focusRequest += 1;
      return;
    }
    await navigate({ state: code, panel: null, person: null, party: null, q: null });
    focusRequest += 1;
  }
  function openPanel(value: Panel, id?: string) {
    if (evidenceMode) {
      goto(`${base}/?state=${selectedCode}${value === 'people' ? '' : `&panel=${value}`}`);
      return;
    }
    if (panel === 'people')
      detailTrigger =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    actionsOpen = false;
    expanded = true;
    navigate({ panel: value === 'people' ? null : value, person: id ?? null });
  }
  async function closePanel() {
    await navigate({ panel: null, person: null });
    detailTrigger?.focus();
  }
  function preload(id: string) {
    client.prefetchQuery({
      queryKey: ['person', activeManifest.release, id],
      queryFn: ({ signal }) => repository.getPolitician(activeManifest.release, id, signal),
      staleTime: Infinity,
    });
  }
  async function checkRelease() {
    try {
      const next = await repository.getManifest();
      if (next.release !== activeManifest.release) nextManifest = next;
      refreshError = '';
    } catch {
      refreshError = 'Could not check for updates. Your current dataset remains available.';
    }
  }
  async function refreshRelease() {
    if (!nextManifest) return;
    const next = nextManifest;
    try {
      await client.fetchQuery({
        queryKey: ['state', next.release, selectedCode],
        queryFn: ({ signal }) => repository.getState(next.release, selectedCode, signal),
      });
      activeManifest = next;
      nextManifest = null;
      refreshError = '';
    } catch {
      refreshError = 'The new dataset is unavailable. Continuing with the current version.';
    }
  }
  onMount(() => {
    mounted = true;
    if (page.url.searchParams.get('diagnostics') === '1')
      import('$lib/said-did/DiagnosticsPanel.svelte').then((module) => {
        Diagnostics = module.default;
      });
    const timer = window.setInterval(checkRelease, 60_000);
    checkRelease();
    return () => clearInterval(timer);
  });
</script>

<a class="skip-link" href={evidenceMode ? '#evidence-content' : '#politicians'}
  >{evidenceMode ? 'Skip to evidence' : 'Skip to representatives'}</a
>
<header class="masthead" class:atlas-masthead={evidenceMode}>
  <div>
    <a class="brand" href={`${base}/`}><span></span>Louder Than Words</a>
    <nav aria-label="Primary">
      <ExploreCatalog companyCik={catalogCompanyCik} />
      <a class="primary-shortcut" class:active={connectionsMode} href={`${base}/records/connections/`}>Connections</a>
      <a class="primary-shortcut" class:active={patternsMode} href={`${base}/records/patterns/`}>Patterns</a>
      <button class="primary-shortcut" onclick={() => openPanel('people')}>People</button>
      <button class="primary-shortcut" onclick={() => openPanel('saved')}>Saved</button>
    </nav>
  </div>
  <div class="header-right">
    <button class="account-button" onclick={() => openPanel('account')}
      >My account <span>↗</span></button
    >
    <p class="masthead-note">Data drives<br />a more open<br />democracy<span></span></p>
  </div>
</header>
<main
  class="dashboard explorer-dashboard"
  class:sheet-expanded={expanded}
  class:evidence-mode={evidenceMode}
  class:patterns-mode={patternsMode}
  class:reading-mode={readingMode}
  class:map-only={panelHidden}
  style={`--evidence-label-height:${evidenceLabelHeight}px`}
>
  <USMap
    release={activeManifest.release}
    states={activeManifest.states}
    selected={mapSelected}
    comparisonState={patternsPeer}
    {focusRequest}
    onselect={chooseState}
    {evidenceMode}
    layoutKey={`${evidenceMode}-${readingMode}-${panelHidden}-${evidenceLabelHeight}`}
    {mapScope}
    inspectionKey={page.url.href}
    evidenceCounts={patternsMode ? emptyMapCounts : connectionsMode ? connectionsCounts : stakesMode ? stakesCounts : sharedMode ? sharedCounts : holdingsMode ? holdingsCounts : insidersMode ? insiderCounts : waterMode ? waterCounts : enforcementMode ? echoCounts : nursingMode ? nursingCounts : votesMode ? page.data.votes?.data.states ?? {} : trialsMode ? page.data.trials?.data.states ?? {} : researchMode ? researchCounts : complaintsMode ? complaintCounts : wagesMode ? wageCounts : lobbyingMode ? lobbyingCounts : revolvingMode ? revolvingCounts : graveyardMode ? graveyardCounts : page.data.evidence?.manifest.states ?? {}}
    showEvidencePoints={connectionsMode || stakesMode || sharedMode || holdingsMode || insidersMode || waterMode || enforcementMode || nursingMode || votesMode || trialsMode || researchMode || paycheckMode || complaintsMode || wagesMode || lobbyingMode || revolvingMode || graveyardMode || (chartsMode && economicSelection?.metric === 'unemployment')}
    evidenceUnit={patternsMode ? "state-level change directions, not people, workplaces, causal effects or a ranking" : connectionsMode ? "companies joined across collected datasets by exact SEC issuer ID; captured business-address states must agree; anchors, not transactions or causal relationships" : stakesMode ? "selected issuers with collected ownership disclosures by captured business-address state; state-label anchors, not investor homes, trade locations or ownership totals" : sharedMode ? "selected companies by captured business-address state; state-label anchors, not investment destinations, ownership control or exact offices" : holdingsMode ? "selected reporting managers by latest collected cover-page state; state-label anchors, not investment or trade locations, asset totals or returns" : insidersMode ? "collected SEC filings by issuer business-address state as captured; state-label anchors, not owner residences, transaction locations, trade volumes or investment signals" : waterMode ? 'collected water systems by PWSID state jurisdiction; anchors, not water-system coordinates, service areas or safety rankings' : enforcementMode ? 'collected EPA facilities by reported state; not violation rates, severity, exposure or nationally complete coverage' : nursingMode ? 'collected CMS facilities by facility state; not quality rankings or nationally complete ownership portfolios' : graveyardMode ? 'collected bills by reported sponsor state; label anchors, not action locations, policy impact or a success ranking' : trialsMode ? 'completed studies with listed U.S. sites' : researchMode ? 'collected NIH applications by funded-organization state in the selected fiscal year' : complaintsMode ? 'collected complaint records by reported consumer state in the selected period; allegations, not findings or per-customer rates' : wagesMode ? 'concluded WHD cases in this collection by reported employer state; includes zero recorded violations, not a rate or employer ranking' : lobbyingMode ? 'captured LDA filings including amendments, by client state as retrieved; label anchors, not lobbying locations or influence' : revolvingMode ? 'distinct LDA person IDs in filtered filings by reported client state; not residence, government jobs, meetings or influence' : chartsMode ? 'state unemployment observations for the selected end month; absence is not a zero rate' : 'sample receipts by represented state'}
    recordSites={enforcementMode ? echoSites : nursingMode ? nursingSites : trialsMode ? trialSites : researchMode ? researchSites : []}
    onrecordselect={nursingMode || enforcementMode ? async (id) => { expanded = true; await navigate(enforcementMode ? { facility: id, from: null, through: null, source: null, kind: null } : { facility: id }); await tick(); const detail = document.querySelector<HTMLElement>(enforcementMode ? '.echo-detail' : '.facility-detail'); detail?.focus({preventScroll:true}); detail?.scrollIntoView({block:'start'}); } : undefined}
    connectSites={(trialsMode || (researchMode && !!researchSelected) || (nursingMode && !!params.get('owner'))) && params.get('links') === '1'}
    highlightSelection={!!contextualFocus || (patternsMode ? !!patternsMetrics[params.get('state') ?? 'TX'] : !recordsMode || !!params.get('state'))}
    selectionOutlineColor={patternsMode ? '#264e60' : 'transparent'}
    selectionColor={patternsMode ? patternsMetrics[selectedCode]?.color ?? '#e1ebf3' : connectionsMode ? "#9ebdbc" : stakesMode ? "#b9a8c9" : sharedMode ? "#a5c6cf" : holdingsMode ? "#a6bda9" : insidersMode ? "#b6a8c6" : waterMode ? '#9bbfba' : enforcementMode ? '#c7a477' : nursingMode ? '#9bb997' : graveyardMode ? '#b89473' : rulesMode ? '#d5cceb' : chartsMode ? '#badce6' : researchMode ? '#80aaa0' : paycheckMode ? paycheckMetrics[selectedCode]?.color ?? '#e1ebf3' : complaintsMode ? '#785266' : wagesMode ? '#b77950' : lobbyingMode ? '#718ca4' : revolvingMode ? '#719989' : '#ff1638'}
    metricValues={patternsMode ? patternsMetrics : paycheckMode ? paycheckMetrics : economicMetrics}
  />
  {#if evidenceMode}
    <aside class="evidence-map-label" bind:clientHeight={evidenceLabelHeight}>
      <div class="map-context-heading"><span class="map-context-mark" aria-hidden="true">◎</span><div><p class="map-context-caption">Public record atlas</p><h1>{mapScope.title}</h1></div></div>
      <label for="evidence-state">{rulesMode ? 'Geographic context · not a rule filter' : chartsMode ? 'Explore state unemployment' : 'Explore a state'}</label>
      <select
        id="evidence-state"
        disabled={!mounted}
        value={patternsMode ? params.get('state') ?? 'TX' : recordsMode ? params.get('state') ?? '' : selectedCode}
        onchange={(e) => chooseState(e.currentTarget.value)}
      >
        {#if recordsMode && !patternsMode}<option value="">{rulesMode ? 'U.S. geographic context' : chartsMode || paycheckMode ? 'National series' : 'All collected states'}</option>{/if}
        {#each activeManifest.states as state}<option value={state.code}>{state.name}</option
          >{/each}
      </select>
      <a href={`${base}/?state=${selectedCode}`}>← Back to representatives</a>
      <details class="map-context-notes"><summary>What the map shows</summary><p class="map-evidence-key">
        {#if patternsMode}Colors = change directions for both measures.<br />Compare the same region and year.<br />Every region has equal weight in the chart.<br />Patterns are not causal effects.{:else if connectionsMode}Counts = connected companies.<br />Exact SEC issuer IDs across datasets.<br />Captured business-address states must agree.<br />Connections are not proof of causation.{:else if stakesMode}Counts = selected issuer companies.<br />Captured business-address states.<br />State-label anchors, not investor homes.<br />Disclosures are not trades or takeover signals.{:else if sharedMode}Counts = selected peer companies.<br />Captured business-address states.<br />State-label anchors, not investment destinations.<br />Connections are not control or collusion.{:else if holdingsMode}Counts = selected reporting managers.<br />Latest collected cover-page states.<br />State-label anchors, not investment locations.<br />Delayed holdings, not live trades.{:else if insidersMode}Counts = collected SEC filings.<br />Issuer business-address states as captured.<br />Points are state-label anchors, not trade locations.<br />No owner residences or investment signals.{:else if waterMode}Counts = collected water systems.<br />Geography = PWSID state jurisdiction.<br />Points are state-label anchors, not supply locations.<br />Not service boundaries or tap-water safety.{:else if enforcementMode}Counts = filtered facilities in this collection.<br />Teal points = EPA facility coordinates.<br />Not exposure areas or violation rates.<br />Missing records do not mean no response.{:else if nursingMode}Counts = filtered CMS facilities.<br />Teal points = reported facility coordinates.<br />Lines group a disclosed party’s facilities.<br />Not headquarters, transfers, quality or causation.{:else if graveyardMode}Counts = bills by sponsor state.<br />Points are state-label anchors.<br />Not policy impact, action locations, or a success ranking.<br />Quiet does not mean secretly killed.{:else if revolvingMode}Counts = distinct source-person IDs.<br />Geography = client states as retrieved.<br />Not homes, government offices or influence.<br />A person can appear in multiple client states.{:else}
        {#if lobbyingMode}Counts = source filings, including amendments.<br />Client states as retrieved; not historical offices.<br />Points are state-label anchors.<br />Not locations or measures of influence.{:else if wagesMode}Counts = concluded cases in this slice.<br />Includes zero recorded violations.<br />Reported employer states; label anchors, not workplaces.<br />Not violation rates or company rankings.{:else if complaintsMode}Counts = captured records in the selected period.<br />Reported consumer states, not bank locations.<br />Points are label anchors, not homes.<br />Not findings or rates per customer.{:else if paycheckMode}Statewide percent changes in the selected measure.<br />Green = increase · amber = decrease.<br />Missing comparisons have no colored point.<br />Locations are label anchors, not workplaces.{:else if chartsMode}{#if economicSelection?.metric==='unemployment'}Dots = state-level observations<br />Labels = {economicSelection.config.through} unemployment rate<br />Missing months have no point.<br />Locations are label anchors, not workers.{:else}Earnings and CPI cover national populations.<br />Choose a state to explore its unemployment series.<br />No state or ZIP-level inflation is inferred.{/if}{:else}
        {#if rulesMode}No verified rule-impact locations.<br />State selection leaves this collection unchanged.<br />Use it to explore representatives and other records.{:else}<span></span>Blue = published sample coverage<br />{votesMode ? 'Dots = receipts by represented state' : trialsMode ? 'Dots = studies with listed sites' : 'Not a score or ranking'}{/if}
        {#if trialsMode && trialSites.length}<br />Teal = selected study’s registry locations<br />{params.get('links')==='1' ? 'Lines group study sites, not travel' : 'Coordinates may be approximate'}{/if}
        {/if}
        {/if}
      </p></details>
    </aside>
    {#if panelHidden}<button class="restore-evidence" bind:this={panelRestore} onclick={showEvidence}>Open records <span aria-hidden="true">↗</span></button>{/if}
    <section class="evidence-workspace" id="evidence-content" aria-label={patternsMode ? "State pattern comparisons" : connectionsMode ? "Connected public records" : stakesMode ? "Major-stake disclosure evidence" : sharedMode ? "Shared investment evidence" : holdingsMode ? "Quarterly investment holdings" : insidersMode ? "Insider ownership records" : waterMode ? 'Water system records' : enforcementMode ? 'EPA facility evidence' : nursingMode ? 'Nursing facility ownership evidence' : graveyardMode ? 'Bill progress evidence' : votesMode ? 'Vote receipts' : trialsMode ? 'Trial results' : rulesMode ? 'Quiet rulebook' : chartsMode ? 'Chart window explorer' : researchMode ? 'Research funding' : paycheckMode ? 'Regional paycheck comparisons' : complaintsMode ? 'Consumer complaint radar' : wagesMode ? 'Wage violations ledger' : lobbyingMode ? 'Washington lobbying agenda' : revolvingMode ? 'Disclosed career connections' : 'Said versus Did evidence'}>
      <div class="evidence-dock-bar">
        <span><i aria-hidden="true"></i>{mapScope.title}</span>
        <div><button disabled={!mounted} aria-label={readingMode ? 'Return to compact records' : 'Expand reading view'} aria-pressed={readingMode} onclick={() => readingMode = !readingMode}>{readingMode ? 'Compact' : 'Expand'} <span aria-hidden="true">⤢</span></button><button disabled={!mounted} onclick={hideEvidence} aria-label="Hide records and show map only">Map only <span aria-hidden="true">×</span></button></div>
      </div>
      <button
        class="evidence-sheet-toggle"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse evidence panel' : 'Expand evidence panel'}
        disabled={!mounted}
        onclick={() => (expanded = !expanded)}><span aria-hidden="true"></span><strong>{expanded ? 'Back to map ↓' : 'Explore evidence ↑'}</strong></button
      >
      {#if Diagnostics}<Diagnostics />{/if}
      {@render children?.()}
    </section>
  {:else}
    <section
      class="actions-panel"
      class:actions-open={actionsOpen}
      aria-labelledby="actions-heading"
    >
      <div class="section-tick"></div>
      <div class="state-picker">
        <label class="eyebrow selected-state" for="selected-state"
          ><span></span>Selected state</label
        ><select
          id="selected-state"
          value={selectedCode}
          onchange={(e) => chooseState(e.currentTarget.value)}
          >{#each activeManifest.states as state}<option value={state.code}>{state.name}</option
            >{/each}</select
        >
      </div>
      <h1 id="actions-heading">Actions</h1>
      <p class="tagline">Be informed. Make an impact.</p>
      <div class="section-tick heading-tick"></div>
      <div class="action-list">
        <a class="evidence-entry" href={`${base}/records/connections/`}><span>EXPLORE THE CONNECTIONS</span><strong>Follow the record <b>↗</b></strong><small>One company. Multiple sources. A clearer picture.</small></a>
        <a class="evidence-entry" href={`${base}/said-vs-did/?state=${selectedCode}`}
          ><span>NEW · THE EVIDENCE LEDGER</span><strong>Said <i>/</i> Did <b>↗</b></strong><small
            >Recorded words. Legislative actions. Full context.</small
          ></a
        >
        {#each actionItems as [id, title, subtitle, color]}<button
            class="action"
            data-action={id}
            onclick={() => openPanel(id)}
            ><span class={`action-icon ${color}`}><ActionIcon name={id} /></span><span
              class="action-text"><strong>{title}</strong><span>{subtitle}</span></span
            ><span class="chevron" aria-hidden="true">›</span></button
          >{/each}
      </div>
      <div class="actions-foot">
        <div class="section-tick"></div>
        <p>Civic data<br />for a stronger<br />tomorrow</p>
        <a href="https://louderthanwords.fyi">louderthanwords.fyi ↗</a>
      </div>
    </section>
    <div class="mobile-state-bar">
      <label for="mobile-state">Explore</label><select
        id="mobile-state"
        value={selectedCode}
        onchange={(e) => chooseState(e.currentTarget.value)}
        >{#each activeManifest.states as state}<option value={state.code}>{state.name}</option
          >{/each}</select
      ><button
        class:active={actionsOpen}
        onclick={() => (actionsOpen = !actionsOpen)}
        aria-expanded={actionsOpen}
        aria-controls="actions-heading"
        >{actionsOpen ? 'Close' : 'Take action'} <span>↗</span></button
      >
    </div>
    <section class="politicians-panel" id="politicians" aria-labelledby="politicians-heading">
      <button
        class="sheet-handle"
        disabled={!mounted}
        onclick={() => (expanded = !expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse representative panel' : 'Expand representative panel'}
        ><span></span></button
      >
      <div class="section-bars"><span></span><span></span></div>
      <div class="panel-heading">
        <h2 id="politicians-heading">Politicians</h2>
        <span class="result-count" aria-label={`${people.length} results`}
          >{people.length.toString().padStart(2, '0')}</span
        >
      </div>
      <p class="tagline">{selected.name} delegation / U.S. Congress</p>
      <div class="explorer-filters">
        <label class="sr-only" for="people-search">Search representatives or issues</label><input
          id="people-search"
          type="search"
          placeholder="Search people or issues"
          value={search}
          oninput={(e) => navigate({ q: e.currentTarget.value || null }, true)}
        /><label class="sr-only" for="party-filter">Filter by party</label><select
          id="party-filter"
          value={party}
          onchange={(e) =>
            navigate({ party: e.currentTarget.value === 'all' ? null : e.currentTarget.value })}
          ><option value="all">All parties</option><option value="D">Democrat</option><option
            value="R">Republican</option
          ><option value="I">Independent</option></select
        >
      </div>
      <div class="politician-list" aria-live="polite" aria-busy={stateQuery.isPending}>
        {#if stateQuery.isPending}{#each [1, 2, 3] as i}<div
              class="card-skeleton"
              aria-hidden="true"
            ></div>{/each}
          <p class="sr-only">Loading {selected.name} representatives</p>
        {:else if stateQuery.isError}<div class="empty-state">
            <h3>Couldn’t load this delegation.</h3>
            <p>{stateQuery.error.message}</p>
            <button class="primary-button" onclick={() => stateQuery.refetch()}>Try again</button>
          </div>
        {:else if people.length === 0}<div class="empty-state">
            <h3>No matching representatives.</h3>
            <p>Try a different name, issue, or party.</p>
            <button onclick={() => navigate({ q: null, party: null })}>Clear filters</button>
          </div>
        {:else}{#each people as person (person.id)}<PoliticianCard
              {person}
              onopen={(id) => openPanel('profile', id)}
              onpreload={preload}
            />{/each}{/if}
      </div>
      <p class="data-note"><span></span>Demo experience · Illustrative political data</p>
      {#if nextManifest}<button class="release-update" onclick={refreshRelease}
          >New data available · Refresh view ↻</button
        >{/if}
      {#if refreshError}<p class="data-note" role="status">{refreshError}</p>{/if}
      <p class="panel-signoff">People <b>›</b> Policy <b>›</b> Progress <span></span></p>
    </section>
    {@render children?.()}
  {/if}
</main>
{#if !evidenceMode && panel !== 'people'}<DetailPanel
    {panel}
    personId={personId || stateQuery.data?.people[0]?.id || ''}
    summary={stateQuery.data}
    release={activeManifest.release}
    onclose={closePanel}
    onnavigate={(p, id) => openPanel(p, id)}
  />{/if}
