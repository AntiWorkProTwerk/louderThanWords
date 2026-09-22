<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { filterTrials, trialGroups, resultsLabels } from '$lib/civic/trials';
  import { researchTrialLinks } from '$lib/civic/research';
  let { data } = $props();
  let limit = $state(24),
    reduced = $state(true);
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.trials?.data);
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filters = $derived({
    q: params.get('q') ?? '',
    state: params.get('state') ?? '',
    results: params.get('results') ?? '',
    sponsor: params.get('sponsor') ?? '',
    topic: params.get('topic') ?? '',
  });
  const view = $derived(
    ['sponsor', 'topic', 'updates'].includes(params.get('view') ?? '')
      ? params.get('view')!
      : 'studies',
  );
  const studies = $derived(dataset ? filterTrials(dataset, filters) : []);
  const selected = $derived(dataset?.studies.find((s) => s.id === params.get('study')) ?? null);
  const fundingLinks = $derived(dataset && data.research ? researchTrialLinks(data.research.data,dataset).filter(link=>link.studyId===selected?.id) : []);
  const groups = $derived(trialGroups(studies, view === 'topic' ? 'topic' : 'sponsor'));
  const posted = $derived(studies.filter((s) => s.results === 'posted').length);
  const unknown = $derived(studies.filter((s) => s.results === 'unknown').length);
  const eventStudies = $derived(dataset ? filterTrials(dataset, filters, true) : []);
  const events = $derived(
    dataset?.events
      .filter((event) => eventStudies.some((s) => s.id === event.studyId))
      .toReversed() ?? [],
  );
  const related = $derived(
    selected && dataset
      ? dataset.studies.filter((s) => s.id !== selected.id && s.sponsor.id === selected.sponsor.id)
      : [],
  );
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
  const dateLabel = (date: { value: string; type: string; precision: string } | null) =>
    date
      ? `${date.value}${date.type === 'ESTIMATED' ? ' · estimated' : ''}${date.precision !== 'day' ? ` · ${date.precision} precision` : ''}`
      : 'Not reported';
</script>

<svelte:head
  ><title>Where Are the Trial Results? · Louder Than Words</title><meta
    name="description"
    content="Follow completed registered studies, reported results and changes over time. Inspect the registry source and connected study locations."
  /></svelte:head
>

<div class="evidence-page trials-page">
  <div class="trial-kicker">
    <span>40 / Research & public evidence</span><a
      href={`${base}/records/votes/${filters.state ? `?state=${filters.state}` : ''}`}
      >Legislative records ↗</a
    >
  </div>
  <header class="trial-heading">
    <p class="eyebrow">Completed study. Open question.</p>
    <h2>Where are<br /><em>the results?</em></h2>
    <p>
      Follow what the registry reports after a study is complete. See which records have results,
      explore shared sponsors and topics, and track what changes next.
    </p>
  </header>
  {#if !dataset}<div class="trial-empty" role="alert">
      <h3>Registry snapshot unavailable</h3>
      <p>{data.trialsError}</p>
      <a href={page.url.pathname}>Reload ↻</a>
    </div>
  {:else}
    <div class="trial-coverage">
      <span class="trial-dot"></span><strong>Official registry snapshot</strong><span
        >Observed {dataset.observedAt.slice(0, 10)}</span
      ><span>{dataset.condition} · listed U.S. sites</span>
    </div>
    <details class="trial-method">
      <summary>Understand this collection before drawing conclusions</summary>
      <p>
        This is a bounded collection of {dataset.studies.length} tracked records. Discovery returned {dataset.totalMatches ??
          'an unreported number of'} matching completed studies{dataset.discoveryTruncated
          ? '; the configured page limit means this is not the complete search result'
          : ''}. Discovery is ordered by most recent registry update, not importance or reporting
        quality. Previously tracked IDs are refreshed even when they leave that discovery window.
      </p>
      <p>
        <strong
          >Missing registry results alone do not establish concealment, a legal violation, or an
          absence of published research.</strong
        > This is a disclosure-status explorer, not medical advice or a treatment comparison. Unknown
        flags remain unknown. No reporting-deadline or compliance judgment is calculated.
      </p>
      <p>
        State counts count each completed study once per listed U.S. state. Multi-state studies
        appear in several states, so those totals cannot be added into a national total. Locations
        come from the registry and may be approximate city-level coordinates—not participant
        locations or sponsor headquarters.
      </p>
      <p>
        Sponsor connections use exactly matching reported names; they do not resolve parent
        companies or prove shared control. Topic groups overlap. Registry-supplied MeSH and PubMed
        IDs connect to Research Funding only when the same publication identifier appears in both sources.
      </p>
      <p>
        Tracking started {dataset.trackingStartedAt.slice(0, 10)}. A first observation with results
        is not a newly detected publication. Later snapshots record observed changes separately from
        the registry’s first-posted date.
      </p>
      <a href={`${base}/data/trials/releases/${data.trials?.manifest.release}/data.json`} download
        >Download this complete snapshot ↧</a
      >
      {#if dataset.exclusions.length}<details>
          <summary>Excluded records ({dataset.exclusions.length})</summary>
          <ul>
            {#each dataset.exclusions as exclusion}<li>
                {exclusion.id}: {exclusion.reason}
              </li>{/each}
          </ul>
        </details>{/if}
    </details>
    <div class="trial-stats" aria-label="Completed studies in current filters">
      <div><strong>{studies.length}</strong><span>Completed records</span></div>
      <div><strong>{posted}</strong><span>Results posted</span></div>
      <div><strong>{studies.length - posted - unknown}</strong><span>Not posted</span></div>
      <div><strong>{unknown}</strong><span>Unknown</span></div>
    </div>
    <form class="trial-filters" onsubmit={(e) => e.preventDefault()}>
      <label
        >Search studies, sponsors or topics<input
          type="search"
          value={filters.q}
          placeholder="Try a sponsor, asthma, or an NCT ID"
          oninput={(e) => navigate({ q: e.currentTarget.value, study: null }, true)}
        /></label
      ><label
        >Registry results<select
          aria-label="Registry results"
          value={filters.results}
          onchange={(e) => navigate({ results: e.currentTarget.value, study: null })}
          ><option value="">All statuses</option><option value="posted">Results posted</option
          ><option value="not_posted">No results posted</option><option value="unknown"
            >Unknown</option
          ></select
        ></label
      >
    </form>
    <div class="trial-tabs" aria-label="Explore registry records">
      {#each [['studies', 'Studies'], ['sponsor', 'By sponsor'], ['topic', 'By topic'], ['updates', 'Observed changes']] as [key, label]}<button
          class:active={view === key}
          aria-pressed={view === key}
          onclick={() => navigate({ view: key === 'studies' ? null : key, study: null })}
          >{label}</button
        >{/each}
    </div>
    <div class="trial-results-bar" aria-live="polite">
      <span
        >{studies.length} completed studies{filters.state
          ? ` with sites in ${filters.state}`
          : ''}</span
      >{#if Object.values(filters).some(Boolean)}<button
          onclick={() => goto(`${base}/records/trials/`, { noScroll: true })}>Clear filters</button
        >{/if}
    </div>
    {#if filters.sponsor || filters.topic}<p class="trial-filter-note">
        Filtered by {filters.topic ||
          dataset.studies.find((s) => s.sponsor.id === filters.sponsor)?.sponsor.name ||
          'selected sponsor'}.
        <button onclick={() => navigate({ sponsor: null, topic: null, study: null })}
          >Remove group filter ×</button
        >
      </p>{/if}
    {#if selected}
      <section
        class="trial-detail"
        aria-label="Study details"
        in:fly={{ y: 12, duration: reduced ? 0 : 220 }}
      >
        <button onclick={() => navigate({ study: null, links: null })}>← Back to collection</button>
        <p class="eyebrow">{selected.id} · {selected.status.replaceAll('_', ' ')}</p>
        <h3>{selected.title}</h3>
        <span class="trial-status" data-status={selected.results}
          >{resultsLabels[selected.results]}</span
        >
        <p class="trial-caution">
          Registry status is not a verdict on disclosure obligations or whether research was
          published elsewhere.
        </p>
        <a
          class="trial-primary-link"
          href={`https://clinicaltrials.gov/study/${selected.id}`}
          target="_blank"
          rel="noreferrer">Open original registry record ↗</a
        >
        <div class="trial-dates">
          <div>
            <span>Primary completion</span><strong>{dateLabel(selected.primaryCompletion)}</strong>
          </div>
          <div><span>Study completion</span><strong>{dateLabel(selected.completion)}</strong></div>
          <div>
            <span>Results first posted</span><strong
              >{dateLabel(selected.firstResultsPosted)}</strong
            >
          </div>
          <div><span>Registry last update</span><strong>{dateLabel(selected.updated)}</strong></div>
        </div>
        {#each selected.warnings as warning}<p class="trial-caution">{warning}</p>{/each}
        <h4>Follow the connections</h4>
        <div class="trial-connections">
          <button
            onclick={() =>
              navigate({
                sponsor: selected.sponsor.id,
                study: null,
                state: null,
                q: null,
                results: null,
                topic: null,
                view: 'studies',
              })}>{selected.sponsor.name} → same reported sponsor</button
          >{#each selected.conditions as condition}<button
              onclick={() =>
                navigate({
                  topic: condition,
                  study: null,
                  sponsor: null,
                  q: null,
                  results: null,
                  state: null,
                  view: 'studies',
                })}>{condition} → shared topic</button
            >{/each}
        </div>
        <p class="trial-muted">
          {related.length} other tracked records share this exact sponsor name. This is not a verified
          legal-entity or funding relationship.
        </p>
        <details class="trial-evidence" open>
          <summary>Listed U.S. study locations ({selected.locations.length})</summary>
          <p>
            Teal points on the map use available registry coordinates, which can represent cities
            rather than precise facilities.
          </p>
          <label class="trial-link-toggle"
            ><input
              type="checkbox"
              checked={params.get('links') === '1'}
              onchange={(e) => navigate({ links: e.currentTarget.checked ? '1' : null })}
            /> Connect this study’s listed sites · not travel routes</label
          >
          <div class="trial-location-list">
            {#each selected.locations as location}<div>
                <strong>{location.facility}</strong><span
                  >{location.city}, {location.reportedState}{location.lat === null
                    ? ' · coordinates unavailable'
                    : ''}</span
                >
              </div>{/each}
          </div>
        </details>
        <details class="trial-evidence">
          <summary>Linked publication identifiers ({selected.publications.length})</summary>
          <p>
            Registry-listed references are separate from posted registry results; reference type is
            retained without claiming each paper reports this study’s results.
          </p>
          {#if fundingLinks.length}<h4>Connected NIH funding records</h4><p>These projects and this trial share a PubMed citation. That does not prove an award funded the trial. Check the registry reference type; background references are not trial results.</p>
            {#each fundingLinks as link}<p><a href={`${base}/records/research/?project=${data.research?.data.projects.find(p=>p.core===link.core)?.id}`}>{link.core} · shared PMID {link.pmid} · {link.referenceType} ↗</a></p>{/each}
          {:else}<p>{data.research?'No exact PubMed match in the collected NIH funding snapshot.':'NIH funding snapshot unavailable; connections could not be checked.'}</p>{/if}
          {#each selected.publications as publication}<p>
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${publication.pmid}/`}
                target="_blank"
                rel="noreferrer">PubMed {publication.pmid} ↗</a
              >
              · {publication.type}
            </p>{:else}<p>No PubMed identifiers supplied in this record.</p>{/each}
        </details>
        <details class="trial-evidence">
          <summary>Source receipt & shared identifiers</summary>
          <p>Observed {selected.source.observedAt}</p>
          <p>NCT: {selected.id} · sponsor-name key: {selected.sponsor.id}</p>
          <p>
            MeSH: {selected.mesh.map((m) => `${m.id}: ${m.term}`).join(' · ') || 'Not supplied'}
          </p>
          <a href={selected.source.url} target="_blank" rel="noreferrer">Original API request ↗</a
          ><code>{selected.source.hash}</code>
        </details>
      </section>
    {:else if view === 'updates'}
      <div class="trial-updates">
        {#each events as event}<button onclick={() => navigate({ study: event.studyId })}
            ><span>{event.observedAt.slice(0, 10)}</span><strong>{event.studyId}</strong>
            <p>{event.detail}</p>
            <small>Previous observation: {event.previousObservedAt.slice(0, 10)}</small></button
          >{:else}<div class="trial-empty">
            <h3>No observed changes yet.</h3>
            <p>
              {dataset.trackingStartedAt === dataset.observedAt ? 'This is a baseline, not proof that nothing changed before we started.' : 'No changes were detected between the captured observations; changes between checks may not be visible.'}
              Rerunning the local pipeline refreshes tracked IDs and records newly observed results.
            </p>
          </div>{/each}
      </div>
    {:else if !studies.length}<div class="trial-empty">
        <h3>No completed studies in this slice.</h3>
        <p>
          Try another state, results status, or search. No match in this bounded collection is not
          evidence of no research.
        </p>
        <button onclick={() => goto(`${base}/records/trials/`, { noScroll: true })}
          >Explore the full collected sample ↗</button
        >
      </div>
    {:else if view === 'sponsor' || view === 'topic'}
      <p class="trial-muted">
        Alphabetical groups, not a compliance ranking. Counts reflect only this filtered collection;
        topic groups overlap.
      </p>
      <div class="trial-groups">
        {#each groups.slice(0, limit) as group}<button
            onclick={() => navigate({ [view]: group.id, view: 'studies', study: null })}
            ><strong>{group.name}</strong><span
              >{group.total} studies · {group.posted} posted · {group.notPosted} not posted · {group.unknown}
              unknown</span
            >
            <div class="trial-group-bar" aria-hidden="true">
              <i style={`width:${(group.posted / group.total) * 100}%`}></i><b
                style={`width:${(group.notPosted / group.total) * 100}%`}
              ></b>
            </div></button
          >{/each}
      </div>
      {#if groups.length > limit}<button onclick={() => (limit += 24)}>Show more groups</button
        >{/if}
    {:else}
      <div class="trial-list">
        {#each studies.slice(0, limit) as study (study.id)}<button
            class="trial-card"
            onclick={() => navigate({ study: study.id })}
            ><span class="trial-card-top"
              ><span>{study.id}</span><b class="trial-status" data-status={study.results}
                >{resultsLabels[study.results]}</b
              ></span
            ><strong>{study.title}</strong><span class="trial-sponsor">{study.sponsor.name}</span
            ><span class="trial-card-bottom"
              >Completion: {dateLabel(study.completion)}<span>Open record ↗</span></span
            ></button
          >{/each}
      </div>
      {#if studies.length > limit}<button class="trial-more" onclick={() => (limit += 24)}
          >Show 24 more studies · {studies.length - limit} remaining</button
        >{/if}
    {/if}
  {/if}
</div>

<style>
  .trial-kicker,
  .trial-coverage,
  .trial-results-bar,
  .trial-card-top,
  .trial-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .trial-kicker {
    font-size: 10px;
    color: #53769a;
    letter-spacing: 1px;
  }
  .trial-heading {
    margin: 26px 0;
    max-width: 660px;
  }
  .trial-heading h2 {
    font: 700 clamp(44px, 5vw, 76px)/0.96 var(--condensed);
    text-transform: uppercase;
    letter-spacing: -1px;
    margin: 13px 0 20px;
  }
  .trial-heading em {
    font-style: normal;
    color: #007d8b;
  }
  .trial-heading > p:last-child {
    color: #4d6b84;
    max-width: 580px;
  }
  .trial-coverage {
    justify-content: flex-start;
    background: #e8f4f6;
    border: 1px solid #cbe2e8;
    padding: 13px 15px;
    border-radius: 6px;
    font-size: 11px;
  }
  .trial-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #078592;
    box-shadow: 0 0 0 5px #07859213;
  }
  .trial-method {
    font-size: 11px;
    color: #4e6d86;
    margin: 15px 0 24px;
  }
  .trial-method summary,
  .trial-evidence summary {
    cursor: pointer;
    padding: 8px 0;
  }
  .trial-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-block: 1px solid #dbe7ef;
    padding: 17px 0;
    margin: 20px 0;
    gap: 10px;
  }
  .trial-stats strong {
    display: block;
    font: 600 36px var(--condensed);
    color: #20466a;
  }
  .trial-stats span {
    font-size: 10px;
    color: #607c96;
  }
  .trial-filters {
    display: grid;
    grid-template-columns: 1fr 180px;
    gap: 12px;
  }
  .trial-filters label {
    display: grid;
    gap: 5px;
    font-size: 10px;
    color: #5b7690;
  }
  .trial-filters input,
  .trial-filters select {
    width: 100%;
    min-width: 0;
    padding: 12px;
    border: 1px solid #cbdce9;
    border-radius: 6px;
    background: white;
    color: #20415c;
  }
  .trial-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 20px 0 14px;
    border-bottom: 1px solid #d9e6ef;
    padding-bottom: 12px;
  }
  .trial-tabs button {
    background: transparent;
    color: #5a7893;
    font-size: 11px;
  }
  .trial-tabs button.active {
    background: #173e60;
    color: white;
  }
  .trial-results-bar {
    font-size: 11px;
    color: #31536e;
    margin-bottom: 15px;
  }
  .trial-results-bar button {
    font-size: 10px;
  }
  .trial-list {
    display: grid;
    gap: 12px;
  }
  .trials-page .trial-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
    padding: 20px;
    border: 1px solid #d4e3ec;
    background: linear-gradient(120deg, white, #f3f9fb);
    color: #203c56;
    transition:
      transform 0.2s,
      box-shadow 0.2s,
      border-color 0.2s;
  }
  .trial-card:hover {
    transform: translateY(-2px);
    border-color: #78acb5;
    box-shadow: 0 10px 25px #164c6710;
  }
  .trial-card-top {
    font-size: 9px;
    color: #57748c;
    letter-spacing: 0.4px;
  }
  .trial-status {
    display: inline-block;
    font: 500 10px/1.4 var(--sans, sans-serif);
    padding: 5px 8px;
    border-radius: 4px;
    background: #edf0f3;
    color: #5b6671;
  }
  .trial-status[data-status='posted'] {
    background: #dff0f3;
    color: #146576;
  }
  .trial-status[data-status='not_posted'] {
    background: #f7edda;
    color: #7c5b24;
  }
  .trial-card > strong {
    font: 600 25px/1.14 var(--condensed);
  }
  .trial-sponsor {
    font-size: 11px;
    color: #5b748d;
  }
  .trial-card-bottom {
    font-size: 10px;
    border-top: 1px solid #e0eaf0;
    padding-top: 12px;
  }
  .trial-card-bottom > span {
    color: #007b8b;
  }
  .trial-more {
    margin-top: 16px;
  }
  .trial-empty {
    padding: 25px;
    background: #edf5f8;
    border: 1px dashed #b5cddc;
    border-radius: 7px;
  }
  .trial-empty h3 {
    font: 600 28px var(--condensed);
    margin: 0 0 10px;
  }
  .trial-detail {
    padding-top: 20px;
    border-top: 2px solid #007d8b;
  }
  .trial-detail > .eyebrow {
    margin-top: 25px;
  }
  .trial-detail h3 {
    font: 600 36px/1.1 var(--condensed);
    margin: 12px 0 20px;
  }
  .trial-caution {
    padding: 12px 15px;
    border-left: 2px solid #c8a765;
    background: #fffaf0;
    font-size: 12px;
    color: #72613f;
  }
  .trial-primary-link {
    display: inline-block;
    margin: 10px 0;
    font-weight: 600;
    color: #087b8d;
  }
  .trial-dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 20px 0;
  }
  .trial-dates > div {
    border-bottom: 1px solid #dce6ee;
    padding-bottom: 12px;
  }
  .trial-dates span {
    display: block;
    font-size: 10px;
    color: #597791;
  }
  .trial-dates strong {
    display: block;
    margin-top: 5px;
    font-size: 12px;
  }
  .trial-detail h4 {
    font: 600 25px var(--condensed);
    margin: 24px 0 12px;
  }
  .trial-connections {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .trial-connections button {
    font-size: 11px;
    border: 1px solid #c5dfe5;
    background: #edf6f8;
    color: #246778;
  }
  .trial-muted,
  .trial-filter-note {
    font-size: 11px;
    color: #5c7890;
  }
  .trial-filter-note button {
    font-size: 10px;
  }
  .trial-evidence {
    border-top: 1px solid #dce7ef;
    padding: 12px 0;
    overflow-wrap: anywhere;
  }
  .trial-evidence > p {
    font-size: 11px;
    color: #5f7990;
  }
  .trial-evidence code {
    display: block;
    font-size: 10px;
    margin: 10px 0;
    overflow-wrap: anywhere;
  }
  .trial-location-list {
    max-height: 270px;
    overflow: auto;
    margin-top: 12px;
  }
  .trial-location-list > div {
    padding: 10px 0;
    border-bottom: 1px solid #e1ebf0;
  }
  .trial-location-list strong,
  .trial-location-list span {
    display: block;
    font-size: 11px;
  }
  .trial-location-list span {
    color: #5c7891;
  }
  .trial-link-toggle {
    font-size: 11px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .trial-groups,
  .trial-updates {
    display: grid;
    gap: 10px;
  }
  .trial-groups button,
  .trial-updates > button {
    text-align: left;
    display: block;
    background: white;
    border: 1px solid #d2e2eb;
    padding: 17px;
    color: #21405d;
  }
  .trial-groups strong,
  .trial-groups span {
    display: block;
  }
  .trial-groups span {
    font-size: 10px;
    color: #617c93;
    margin-top: 6px;
  }
  .trial-group-bar {
    display: flex;
    background: #dce3e9;
    height: 5px;
    margin-top: 12px;
    border-radius: 3px;
    overflow: hidden;
  }
  .trial-group-bar i {
    background: #168b9c;
  }
  .trial-group-bar b {
    background: #d4b377;
  }
  .trial-updates > button > span {
    display: block;
    font-size: 10px;
    color: #5c7d99;
  }
  .trial-updates > button > strong {
    display: block;
    margin-top: 7px;
  }
  .trial-updates p,
  .trial-updates small {
    font-size: 11px;
  }
  @media (max-width: 600px) {
    .trial-filters {
      grid-template-columns: 1fr;
    }
    .trial-heading h2 {
      font-size: 49px;
    }
    .trial-stats {
      gap: 5px;
    }
    .trial-stats strong {
      font-size: 30px;
    }
    .trial-stats span {
      font-size: 9px;
    }
    .trial-dates {
      grid-template-columns: 1fr;
    }
    .trial-card > strong {
      font-size: 23px;
    }
    .trial-detail h3 {
      font-size: 29px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .trial-card {
      transition: none !important;
      transform: none !important;
    }
  }
</style>
