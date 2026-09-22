<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    researchFilters,
    filterResearch,
    fundingTotal,
    fundingGroups,
    researchTrialLinks,
  } from '$lib/civic/research';
  let { data } = $props();
  let reduced = $state(true),
    limit = $state(24);
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.research?.data);
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filters = $derived(dataset ? researchFilters(dataset, params) : null);
  const years = $derived(dataset?.plan.years.toSorted((a, b) => a - b) ?? []);
  const firstYear = $derived(
    years.includes(Number(params.get('from'))) ? Number(params.get('from')) : years[0],
  );
  const view = $derived(
    params.get('view') === 'topic'
      ? 'topic'
      : params.get('view') === 'projects'
        ? 'projects'
        : 'organization',
  );
  const projects = $derived(dataset && filters ? filterResearch(dataset, filters) : []);
  const allYears = $derived(
    dataset && filters ? filterResearch(dataset, { ...filters, year: undefined }) : [],
  );
  const groups = $derived(
    filters
      ? fundingGroups(
          allYears,
          view === 'topic' ? 'topic' : 'organization',
          firstYear,
          filters.year,
        )
      : [],
  );
  const total = $derived(fundingTotal(projects));
  const before = $derived(fundingTotal(allYears.filter((p) => p.year === firstYear)));
  const change = $derived(total.unknown || before.unknown ? null : total.amount - before.amount);
  const selected = $derived(dataset?.projects.find((p) => p.id === params.get('project')));
  const history = $derived(
    selected
      ? (dataset?.projects
          .filter((p) => p.core === selected.core)
          .toSorted((a, b) => a.year - b.year) ?? [])
      : [],
  );
  const publications = $derived(
    selected ? (dataset?.publications.filter((p) => p.core === selected.core) ?? []) : [],
  );
  const links = $derived(
    dataset && data.trials ? researchTrialLinks(dataset, data.trials.data) : [],
  );
  const selectedLinks = $derived(links.filter((l) => l.core === selected?.core));
  const topics = $derived([...new Set(dataset?.projects.flatMap((p) => p.topics) ?? [])].sort());
  const money = (n: number | null) =>
    n === null
      ? 'Unknown'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(n);
  const signed = (n: number | null) =>
    n === null ? 'Change unavailable' : `${n > 0 ? '+' : ''}${money(n)}`;
  $effect(() => {
    void filters;
    void view;
    limit = 24;
  });
  async function navigate(changes: Record<string, string | null>, replace = false) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
  }
  function openProject(id: string) {
    navigate({ project: id });
  }
</script>

<svelte:head
  ><title>Research Funding · Louder Than Words</title><meta
    name="description"
    content="Explore NIH research funding by institution and topic, then follow grant-linked publications into registered trial evidence."
  /></svelte:head
>
<div class="evidence-page research-page">
  <div class="research-kicker">
    <span>35 / Follow the research</span><a href={`${base}/records/trials/`}>Trial results ↗</a>
  </div>
  <header>
    <p class="eyebrow">From allocation to evidence</p>
    <h2>Where research<br /><em>takes root.</em></h2>
    <p>
      See how funding changes, which institutions receive it, and the publications linked to each
      project.
    </p>
  </header>
  {#if !dataset || !filters}<div class="research-empty" role="alert">
      <h3>Funding snapshot unavailable</h3>
      <p>{data.researchError}</p>
      <a href={page.url.pathname}>Reload ↻</a>
    </div>
  {:else}
    <div class="research-coverage">
      <span></span><strong>NIH RePORTER</strong><span
        >Observed {dataset.observedAt.slice(0, 10)}</span
      >
    </div>
    <p class="research-scope">
      {dataset.plan.institute} · title contains all search terms “{dataset.plan.titleTerms}” · U.S.
      organizations · FY {years.join(' / ')}
    </p>
    <details class="research-method">
      <summary>What these numbers do—and don’t—mean</summary>
      <p>
        Complete API results for this specific query, not all NIH funding or an institution’s entire
        research budget. Each year is collected independently. A project can leave the query when
        its title changes. An absent award means no matching record in this collection, not that an
        institution lost all funding.
      </p>
      <p>
        Amounts are reported nominal award amounts for fiscal-year applications—not payments, a full
        multi-year grant value, or inflation-adjusted spending. Parent records are counted;
        subprojects are excluded to avoid double counting. Missing amounts stay unknown and suppress
        numeric change claims.
      </p>
      <p>
        NIH spending categories overlap: a project’s whole amount appears in every category assigned
        by the source. Do not add topic totals. Institutions use NIH organization IDs, not guessed
        parent-company or name matches. Unresolved IDs remain separate.
      </p>
      <p>
        Map points are reported funded-organization coordinates—not study sites, participants, or
        where every dollar was spent. Publication links belong to a core project across its
        lifetime. They do not establish which fiscal year paid for a paper, sole funding, research
        quality, or return on investment.
      </p>
      <p>
        Cross-product connections require an identical PubMed identifier. A registry reference may
        be background literature, not a trial-results paper. No shared PMID does not mean no
        relationship or no research output.
      </p>
      <ul>
        {#each dataset.coverage as year}<li>
            FY {year.year}: {year.included} included / {year.total} matching applications; complete acquisition.
          </li>{/each}
      </ul>
      {#if dataset.exclusions.length}<p>
          {dataset.exclusions.length} subproject records excluded from funding totals.
        </p>{/if}
      <a
        href={`${base}/data/research/releases/${data.research?.manifest.release}/data.json`}
        download>Download this frozen dataset ↧</a
      ><br />
      <a href="https://api.reporter.nih.gov/" target="_blank" rel="noreferrer"
        >Source API and methodology ↗</a
      >
    </details>
    <form class="research-filters" onsubmit={(e) => e.preventDefault()}>
      <label class="research-search"
        >Search funding records<input
          type="search"
          value={filters.q}
          placeholder="Institution, project or topic"
          oninput={(e) => navigate({ q: e.currentTarget.value, project: null }, true)}
        /></label
      >
      <label
        >Compare from<select
          aria-label="Compare from"
          value={firstYear}
          onchange={(e) => navigate({ from: e.currentTarget.value })}
          >{#each years as year}<option value={year}>FY {year}</option>{/each}</select
        ></label
      >
      <label
        >Selected fiscal year<select
          aria-label="Selected fiscal year"
          value={filters.year}
          onchange={(e) => navigate({ year: e.currentTarget.value, project: null })}
          >{#each years as year}<option value={year}>FY {year}</option>{/each}</select
        ></label
      >
      <label class="research-search"
        >NIH spending category<select
          aria-label="NIH spending category"
          value={filters.topic}
          onchange={(e) => navigate({ topic: e.currentTarget.value, project: null })}
          ><option value="">All collected categories</option>{#each topics as topic}<option
              value={topic}>{topic}</option
            >{/each}</select
        ></label
      >
    </form>
    {#if filters.state || filters.organization || filters.topic || filters.q}<div
        class="research-filter-note"
      >
        <span
          >Filtered collection{filters.state ? ` · ${filters.state}` : ''}{filters.organization
            ? ` · ${dataset.projects.find((p) => p.organization.id === filters.organization)?.organization.name ?? 'Unknown institution'}`
            : ''}</span
        ><button
          onclick={() =>
            navigate({ state: null, organization: null, topic: null, q: null, project: null })}
          >Clear filters</button
        >
      </div>{/if}
    <div class="research-stats">
      <div>
        <strong>{money(total.amount)}</strong><span
          >{total.unknown ? 'Known amounts only' : 'Reported awards'} · FY {filters.year}</span
        >
      </div>
      <div>
        <strong>{signed(change)}</strong><span
          >From FY {firstYear}{total.unknown || before.unknown ? ' · missing amounts' : ''}</span
        >
      </div>
      <div>
        <strong>{total.count}</strong><span
          >Application records{total.unknown ? ` · ${total.unknown} amounts unknown` : ''}</span
        >
      </div>
    </div>
    <nav class="research-tabs" aria-label="Research views">
      {#each [['organization', 'Institutions'], ['topic', 'Topics'], ['projects', 'Projects']] as [id, label]}<button
          aria-pressed={view === id}
          onclick={() => navigate({ view: id, project: null })}>{label}</button
        >{/each}
    </nav>
    {#if selected}
      {#key selected.id}<article
          class="research-detail"
          in:fly={{ y: reduced ? 0 : 12, duration: reduced ? 0 : 180 }}
        >
          <button class="research-close" onclick={() => navigate({ project: null })}
            >Close project ×</button
          >
          <p class="eyebrow">{selected.number} · FY {selected.year}</p>
          <h3>{selected.title}</h3>
          <p>
            {selected.organization.name} · {selected.organization.city}, {selected.organization
              .reportedState || 'State unreported'}
          </p>
          <strong class="research-award">{money(selected.amount)}</strong>
          <p>
            Reported application award · budget period {selected.budgetStart ?? 'unknown'} to {selected.budgetEnd ??
              'unknown'}
          </p>
          <a href={selected.source.url} target="_blank" rel="noreferrer"
            >Open original NIH project ↗</a
          >
          {#if selected.abstract}<details>
              <summary>Read the project’s source description</summary>
              <p style="white-space:pre-wrap">{selected.abstract}</p>
            </details>{/if}
          <h4>Same core project, through time</h4>
          <p>
            Core {selected.core} · overall project {selected.start ?? 'unknown'} to {selected.end ??
              'unknown'}. Only collected years are shown.
          </p>
          <div class="research-timeline">
            {#each history as item}<button
                class:current={item.id === selected.id}
                onclick={() => openProject(item.id)}
                ><span>FY {item.year}</span><strong>{money(item.amount)}</strong><small
                  >{item.organization.name} · {item.number}</small
                ></button
              >{/each}
          </div>
          <label
            ><input
              type="checkbox"
              checked={params.get('links') === '1'}
              onchange={(e) => navigate({ links: e.currentTarget.checked ? '1' : null })}
            /> Connect locations reported for this core project</label
          >
          <p>
            Lines show shared core-project identity across collected applications—not money
            transfers. Identical coordinates do not create a line.
          </p>
          <h4>Follow the evidence</h4>
          <div class="research-evidence-path">
            <span>NIH core project</span><i>→</i><span>{publications.length} PubMed links</span><i
              >→</i
            ><span>{new Set(selectedLinks.map((l) => l.studyId)).size} collected trial records</span
            >
          </div>
          <p class="research-caution">
            A shared citation is a documented connection—not proof this award funded the trial or
            that the cited paper reports its results.
          </p>
          {#if !data.trials}<p>
              Trial snapshot unavailable. Cross-product matches could not be checked.
            </p>{:else if !selectedLinks.length}<p>
              No exact PubMed match in the current Trial Results snapshot. This is not a claim that
              no related trial exists.
            </p>{:else}<div class="research-links">
              {#each selectedLinks as link}<a href={`${base}/records/trials/?study=${link.studyId}`}
                  ><strong>{link.studyTitle}</strong><span
                    >{link.studyId} · shared PMID {link.pmid} · registry reference: {link.referenceType}</span
                  ></a
                >{/each}
            </div>{/if}
          <details>
            <summary>All NIH-linked publications ({publications.length})</summary>
            <p>
              NIH supplies identifiers here, not paper titles or publication dates. “Latest
              application” is source linkage metadata, not an attribution to this award year.
            </p>
            <ul>
              {#each publications as publication}<li>
                  <a
                    href={`https://pubmed.ncbi.nlm.nih.gov/${publication.pmid}/`}
                    target="_blank"
                    rel="noreferrer">PubMed {publication.pmid} ↗</a
                  >
                  · latest application {publication.latestApplicationId}
                </li>{/each}
            </ul>
          </details>
        </article>{/key}
    {/if}
    {#if view === 'projects'}
      <p class="research-count">{projects.length} applications · FY {filters.year}</p>
      <div class="research-projects">
        {#each projects.slice(0, limit) as project}<button
            class="research-card"
            onclick={() => openProject(project.id)}
            ><span>{project.core} · FY {project.year}</span>
            <h3>{project.title}</h3>
            <p>{project.organization.name}</p>
            <strong>{money(project.amount)} <i>↗</i></strong></button
          >{/each}
      </div>
      {#if !projects.length}<div class="research-empty">
          <h3>No matching applications.</h3>
          <p>
            Try another fiscal year or clear the filters. This is not a zero-funding claim outside
            this query.
          </p>
        </div>{/if}
      {#if projects.length > limit}<button class="research-more" onclick={() => (limit += 24)}
          >Show 24 more projects</button
        >{/if}
    {:else}
      <p class="research-count">
        {groups.length}
        {view === 'topic' ? 'overlapping categories' : 'institutions'} · FY {firstYear} → FY {filters.year}
      </p>
      {#if view === 'topic'}<p class="research-caution">
          Categories overlap. Their amounts cannot be added together.
        </p>{/if}
      <div class="research-groups">
        {#each groups.slice(0, limit) as group}<button
            class="research-group"
            onclick={() =>
              navigate({
                [view === 'topic' ? 'topic' : 'organization']: group.id,
                view: 'projects',
                project: null,
              })}
            ><h3>{group.name}</h3>
            <div class="research-bars" aria-hidden="true">
              <span
                style={`width:${(group.before.amount / Math.max(group.before.amount, group.after.amount, 1)) * 100}%`}
              ></span><span
                style={`width:${(group.after.amount / Math.max(group.before.amount, group.after.amount, 1)) * 100}%`}
              ></span>
            </div>
            <div class="research-pair">
              <span
                >FY {firstYear}<strong
                  >{money(group.before.amount)}{group.before.unknown ? ' + unknown' : ''}</strong
                ></span
              ><span
                >FY {filters.year}<strong
                  >{money(group.after.amount)}{group.after.unknown ? ' + unknown' : ''}</strong
                ></span
              ><span>Change<strong>{signed(group.change)}</strong></span>
            </div></button
          >{/each}
      </div>
      {#if !groups.length}<div class="research-empty">
          <h3>No groups in this slice.</h3>
          <p>Clear a filter to explore more of the collection.</p>
        </div>{/if}
      {#if groups.length > limit}<button class="research-more" onclick={() => (limit += 24)}
          >Show 24 more groups</button
        >{/if}
    {/if}
    <footer>
      Reproducible records, not a research-quality ranking. Links use identifiers, never topic
      similarity alone.
    </footer>
  {/if}
</div>

<style>
  .research-page {
    --ink: #173a43;
    --accent: #007c79;
    color: var(--ink);
  }
  .research-kicker,
  .research-coverage,
  .research-filter-note {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 11px;
  }
  .research-kicker {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 24px;
  }
  .research-page a {
    color: #00706e;
  }
  .research-page header h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(46px, 5vw, 72px);
    line-height: 0.93;
    margin: 12px 0 18px;
  }
  .research-page header em {
    font-style: normal;
    color: var(--accent);
  }
  .research-page header > p:last-child {
    max-width: 52ch;
    line-height: 1.6;
    font-size: 14px;
  }
  .research-coverage {
    justify-content: flex-start;
    margin-top: 22px;
    padding: 12px 0;
    border-top: 1px solid #dce9e8;
  }
  .research-coverage > span:first-child {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  .research-scope {
    font-size: 12px;
    line-height: 1.6;
  }
  .research-method {
    background: #eff6f4;
    border: 1px solid #d6e6e1;
    border-radius: 10px;
    padding: 13px;
    font-size: 12px;
    line-height: 1.7;
  }
  .research-page summary {
    cursor: pointer;
    font-weight: 650;
  }
  .research-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 22px 0;
  }
  .research-filters label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
  }
  .research-search {
    grid-column: 1/-1;
  }
  .research-filters input,
  .research-filters select {
    width: 100%;
    min-width: 0;
    padding: 11px;
    border: 1px solid #c6dad8;
    border-radius: 6px;
    background: #fff;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
  }
  .research-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin: 20px 0;
  }
  .research-stats > div:last-child {
    grid-column: 1/-1;
  }
  .research-stats strong {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 32px;
    display: block;
    font-weight: 700;
  }
  .research-stats span {
    font-size: 11px;
    color: #506e75;
  }
  .research-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 22px 0 16px;
  }
  .research-tabs button,
  .research-more,
  .research-filter-note button,
  .research-close {
    padding: 10px 13px;
    border: 1px solid #c7ddda;
    border-radius: 6px;
    background: white;
    color: var(--ink);
    font-size: 12px;
    cursor: pointer;
  }
  .research-tabs button[aria-pressed='true'] {
    background: var(--ink);
    color: white;
    border-color: var(--ink);
  }
  .research-count {
    font-size: 12px;
  }
  .research-groups,
  .research-projects {
    display: grid;
    gap: 12px;
  }
  .research-group,
  .research-card {
    width: 100%;
    text-align: left;
    border: 1px solid #d4e4e1;
    border-radius: 10px;
    background: linear-gradient(130deg, #fff, #f4f9f7);
    padding: 17px;
    color: var(--ink);
    cursor: pointer;
    transition:
      transform 0.16s ease,
      border-color 0.16s ease;
  }
  .research-group:hover,
  .research-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
  }
  .research-group h3 {
    font-size: 14px;
    line-height: 1.4;
    margin: 0 0 15px;
  }
  .research-bars {
    display: grid;
    gap: 4px;
    margin: 12px 0;
  }
  .research-bars span {
    height: 7px;
    background: #b8d7d2;
    border-radius: 2px;
    transition: width 0.25s ease;
  }
  .research-bars span + span {
    background: var(--accent);
  }
  .research-pair {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 7px;
    font-size: 10px;
  }
  .research-pair strong {
    display: block;
    font-size: 13px;
    margin-top: 5px;
    overflow-wrap: anywhere;
  }
  .research-card > span {
    font-size: 10px;
    letter-spacing: 0.07em;
  }
  .research-card h3 {
    font-size: 16px;
    line-height: 1.35;
  }
  .research-card p {
    font-size: 11px;
  }
  .research-card > strong {
    display: flex;
    justify-content: space-between;
    font-size: 20px;
  }
  .research-card i {
    font-style: normal;
  }
  .research-detail {
    border: 1px solid #90c3b9;
    border-top: 4px solid var(--accent);
    border-radius: 10px;
    padding: 20px;
    margin: 20px 0;
    background: #f6fbf8;
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .research-close {
    float: right;
    margin: 0 0 12px 12px;
  }
  .research-detail h3 {
    font-size: 23px;
    line-height: 1.2;
    clear: both;
  }
  .research-detail h4 {
    font-size: 15px;
    margin: 24px 0 10px;
  }
  .research-award {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 38px;
  }
  .research-timeline {
    display: grid;
    gap: 8px;
  }
  .research-timeline button {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    text-align: left;
    background: white;
    border: 1px solid #c5dcd5;
    border-left: 3px solid #b9d3c8;
    padding: 12px;
    color: var(--ink);
    cursor: pointer;
  }
  .research-timeline button.current {
    border-left-color: var(--accent);
  }
  .research-timeline strong {
    text-align: right;
  }
  .research-timeline small {
    grid-column: 1/-1;
  }
  .research-evidence-path {
    display: flex;
    gap: 7px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 11px;
  }
  .research-evidence-path span {
    background: #e2f0e9;
    padding: 7px;
    border-radius: 4px;
  }
  .research-evidence-path i {
    font-style: normal;
  }
  .research-caution {
    font-size: 12px;
    line-height: 1.6;
    background: #f0f3e8;
    border-left: 2px solid #84935e;
    padding: 10px 12px;
  }
  .research-links {
    display: grid;
    gap: 10px;
    margin: 15px 0;
  }
  .research-links a {
    display: grid;
    gap: 7px;
    padding: 12px;
    border: 1px solid #bad7cf;
    border-radius: 6px;
    text-decoration: none;
    background: white;
  }
  .research-links span {
    font-size: 11px;
  }
  .research-more {
    margin-top: 15px;
  }
  .research-empty {
    padding: 24px 12px;
    border: 1px dashed #a6c6be;
    margin: 16px 0;
  }
  .research-empty p {
    font-size: 13px;
    line-height: 1.5;
  }
  .research-page footer {
    font-size: 11px;
    line-height: 1.6;
    margin: 28px 0 10px;
    color: #506e75;
  }
  .research-page button:focus-visible,
  .research-page a:focus-visible,
  .research-page input:focus-visible,
  .research-page select:focus-visible {
    outline: 3px solid #edb33e;
    outline-offset: 3px;
  }
  @media (prefers-reduced-motion: reduce) {
    .research-group,
    .research-card,
    .research-bars span {
      transition: none;
    }
    .research-group:hover,
    .research-card:hover {
      transform: none;
    }
  }
  @media (max-width: 430px) {
    .research-pair {
      grid-template-columns: 1fr 1fr;
    }
    .research-pair > span:last-child {
      grid-column: 1/-1;
    }
    .research-stats strong {
      font-size: 28px;
    }
    .research-detail {
      padding: 14px;
    }
  }
</style>
