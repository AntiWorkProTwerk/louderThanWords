<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { createRepository } from '$lib/data/repository';
  import { panels, type Manifest, type StateSummary, type Panel } from '$lib/data/schema';
  import USMap from './USMap.svelte';
  import PoliticianCard from './PoliticianCard.svelte';
  import ActionIcon from './ActionIcon.svelte';
  import DetailPanel from './DetailPanel.svelte';
  let { manifest, initialSummary }: { manifest: Manifest; initialSummary: StateSummary } = $props();
  const repository = createRepository(base),
    client = useQueryClient();
  let activeManifest = $state(untrack(() => manifest)),
    nextManifest = $state<Manifest | null>(null),
    focusRequest = $state(0),
    expanded = $state(false),
    actionsOpen = $state(false),
    refreshError = $state('');
  let detailTrigger: HTMLElement | undefined;
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const selectedCode = $derived(
    activeManifest.states.some((s) => s.code === params.get('state')) ? params.get('state')! : 'TX',
  );
  const selected = $derived(activeManifest.states.find((s) => s.code === selectedCode)!);
  const panel = $derived(
    panels.includes(params.get('panel') as Panel) ? (params.get('panel') as Panel) : 'people',
  );
  const personId = $derived(params.get('person') ?? '');
  const party = $derived(
    ['R', 'D', 'I'].includes(params.get('party') ?? '') ? params.get('party')! : 'all',
  );
  const search = $derived(params.get('q') ?? '');
  const stateQuery = createQuery(() => ({
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
    await navigate({ state: code, panel: null, person: null, party: null, q: null });
    focusRequest += 1;
  }
  function openPanel(value: Panel, id?: string) {
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
    const timer = window.setInterval(checkRelease, 60_000);
    checkRelease();
    return () => clearInterval(timer);
  });
</script>

<a class="skip-link" href="#politicians">Skip to representatives</a>
<header class="masthead">
  <div>
    <a class="brand" href={`${base}/`}><span></span>Louder Than Words</a>
    <nav aria-label="Primary">
      <button onclick={() => openPanel('people')}>People</button><i>/</i><button
        onclick={() => openPanel('bills')}>Bills</button
      ><i>/</i><button onclick={() => openPanel('impact')}>Impact</button><i>/</i><button
        onclick={() => openPanel('saved')}>Saved</button
      >
    </nav>
  </div>
  <div class="header-right">
    <button class="account-button" onclick={() => openPanel('account')}
      >My account <span>↗</span></button
    >
    <p class="masthead-note">Data drives<br />a more open<br />democracy<span></span></p>
  </div>
</header>
<main class="dashboard explorer-dashboard" class:sheet-expanded={expanded}>
  <USMap
    release={activeManifest.release}
    states={activeManifest.states}
    {selected}
    {focusRequest}
    onselect={chooseState}
  />
  <section class="actions-panel" class:actions-open={actionsOpen} aria-labelledby="actions-heading">
    <div class="section-tick"></div>
    <div class="state-picker">
      <label class="eyebrow selected-state" for="selected-state"><span></span>Selected state</label
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
      aria-controls="actions-heading">{actionsOpen ? 'Close' : 'Take action'} <span>↗</span></button
    >
  </div>
  <section class="politicians-panel" id="politicians" aria-labelledby="politicians-heading">
    <button
      class="sheet-handle"
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
</main>
{#if panel !== 'people'}<DetailPanel
    {panel}
    personId={personId || stateQuery.data?.people[0]?.id || ''}
    summary={stateQuery.data}
    release={activeManifest.release}
    onclose={closePanel}
    onnavigate={(p, id) => openPanel(p, id)}
  />{/if}
