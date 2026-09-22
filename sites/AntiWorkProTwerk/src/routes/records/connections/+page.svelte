<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount, getContext } from 'svelte';
  import { mapFocusContext, type MapFocusContext } from '$lib/civic/map-focus';
  import { fly } from 'svelte/transition';
  import { connectionKinds, connectionLabels, filterConnections } from '$lib/civic/connections';
  let { data } = $props();
  const mapFocus = getContext<MapFocusContext>(mapFocusContext);
  let ready = $state(false);
  let q = $state(''),
    active = $state(''),
    reduced = $state(true),
    shareMessage = $state('');
  const dataset = $derived(data.connections?.data);
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const urlQuery = $derived(params.get('q') ?? '');
  $effect(() => {
    q = urlQuery;
  });
  const filters = $derived(new URLSearchParams({ ...Object.fromEntries(params), q }));
  const companies = $derived(dataset ? filterConnections(dataset, filters) : []);
  const company = $derived(
    companies.find((c) => c.cik === params.get('company')) ??
      (!params.get('company') ? companies[0] : undefined),
  );
  const starts = $derived(company?.views.map((v) => Date.parse(v.from)) ?? []);
  const ends = $derived(company?.views.map((v) => Date.parse(v.through)) ?? []);
  const first = $derived(Math.min(...starts)),
    last = $derived(Math.max(...ends));
  const span = $derived(Math.max(last - first, 86400000));
  const formatDate = (date: string) =>
    new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  async function change(values: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(values))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    await goto(url, { noScroll: true, keepFocus: true });
  }
  async function share() {
    const url = new URL(page.url);
    if (company) url.searchParams.set('company', company.cik);
    try {
      await navigator.clipboard.writeText(url.href);
      shareMessage = 'Link copied';
    } catch {
      shareMessage = 'Copy the address from your browser to share this view.';
    }
  }
  onMount(() => {
    ready = true;
    q = params.get('q') ?? '';
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
</script>

<svelte:head
  ><title>Follow the connections · Louder Than Words</title><meta
    name="description"
    content="Follow exact SEC company identifiers across insider transactions, major ownership disclosures and shared-investor records."
  /></svelte:head
>
<div class="connections-page">
  <div class="kicker">
    <span><i></i> CONNECTED PUBLIC RECORDS</span><span>IDENTITY → EVIDENCE → CONTEXT</span>
  </div>
  <h2>One company.<br /><em>More of the picture.</em></h2>
  <p class="intro">
    A filing is a starting point. Follow the same company into other records, see what each one can
    tell you, and keep the evidence in view.
  </p>
  <a class="patterns-entry" href={`${base}/records/patterns/`}><span>LOOKING FOR A MEASURED RELATIONSHIP?</span><strong>Explore pay, jobs + unemployment across states ↗</strong><small>Animated comparisons · exact BLS endpoints · descriptive correlation</small></a>
  {#if !dataset}
    <div role="alert" class="empty">
      {data.connectionsError}<button onclick={() => location.reload()}>Reload connections</button>
    </div>
  {:else}
    <div class="scope-strip">
      <strong>{dataset.entities.length}<small>CONNECTED COMPANIES</small></strong><strong
        >3<small>DATASET TYPES</small></strong
      >
      <p>Joined by exact SEC company ID.<br /><span>No name guessing. No causation score.</span></p>
    </div>
    <form
      class="search"
      onsubmit={(event) => {
        event.preventDefault();
        change({ q: q.trim() || null, company: null });
      }}
    >
      <label for="connection-search">Find a company<span>Search name, ticker or SEC ID</span></label
      >
      <div>
        <input
          disabled={!ready}
          id="connection-search"
          type="search"
          bind:value={q}
          placeholder="Try Microsoft or MSFT"
        /><button type="submit" disabled={!ready}>Search ↗</button>
      </div>
    </form>
    <div class="selection-line">
      <span
        >{companies.length} in this view {#if params.get('state')}· {params.get('state')}{/if}</span
      ><a href={`${base}/records/connections/`} onclick={() => (q = '')}>Reset filters</a>
    </div>
    <div class="company-picker" aria-label="Connected companies">
      {#each companies as c}<button
          class:selected={c.cik === company?.cik}
          disabled={!ready}
          aria-pressed={c.cik === company?.cik}
          onclick={() => change({ company: c.cik, q: q.trim() || null })}
          ><span>{c.ticker || 'SEC'}</span><strong>{c.name}</strong><small
            >{c.views.length} connected views <b>↗</b></small
          ></button
        >{/each}
    </div>
    {#if !company}
      <div class="empty">
        <h3>No matching connected company</h3>
        <p>
          This index only includes companies with records in at least two of these collected
          datasets. Absence here does not mean no filings exist.
        </p>
        <a href={`${base}/records/connections/`}>Show the collected connections →</a>
      </div>
    {:else}
      {#key company.cik}
        <section
          class="connection-detail"
          aria-label={`${company.name} connected evidence`}
          in:fly={{ y: reduced ? 0 : 12, duration: reduced ? 0 : 260 }}
        >
          <div class="section-heading">
            <span>01 / FOLLOW THE IDENTIFIER</span><button onclick={share} disabled={!ready}
              >Copy this view ↗</button
            >
          </div>
          <p class="share-feedback" aria-live="polite">{shareMessage}</p>
          <div class="connection-graph">
            <svg
              class="graph-lines"
              viewBox="0 0 900 384"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {#each connectionKinds as kind, i}{#if company.views.some((v) => v.kind === kind)}<path
                    class:lit={active === kind}
                    style={`--line:${connectionLabels[kind].color};--delay:${i * 90}ms`}
                    d={`M 195 192 C 290 192, 270 ${64 + i * 128}, 362 ${64 + i * 128}`}
                  />{/if}{/each}
            </svg>
            <div class="identity-node">
              <span class="node-orbit" aria-hidden="true"></span><small>THE SAME COMPANY</small
              ><strong>{company.ticker || 'SEC'}</strong>
              <p>{company.name}</p>
              <code>CIK {company.cik}</code><span class="identity-badge"
                >✓ Exact identifier match</span
              >
            </div>
            <div class="view-nodes">
              {#each connectionKinds as kind}
                {@const view = company.views.find((v) => v.kind === kind)}
                {@const label = connectionLabels[kind]}
                {#if view}
                  <a
                    class="view-node"
                    href={`${base}${view.href}`}
                    style={`--accent:${label.color}`}
                    onmouseenter={() => (active = kind)}
                    onmouseleave={() => (active = '')}
                    onfocus={() => (active = kind)}
                    onblur={() => (active = '')}
                  >
                    <div class="node-icon" aria-hidden="true">
                      {kind === 'insiders' ? '↗' : kind === 'major-stakes' ? '◈' : '⋈'}
                    </div>
                    <div>
                      <small>{label.title}</small>
                      <h3>{label.subtitle}</h3>
                      <p>{view.count.toLocaleString()} {view.unit}</p>
                    </div>
                    <span class="node-arrow" aria-hidden="true">↗</span>
                  </a>
                {:else}<div class="view-node unavailable">
                    <div>
                      <small>{label.title}</small>
                      <h3>{label.subtitle}</h3>
                      <p>No matching records in this collection</p>
                    </div>
                    <span aria-hidden="true">—</span>
                  </div>{/if}
              {/each}
            </div>
          </div>
          <p class="graph-caption">
            <span class="line-sample"></span>Lines mean
            <strong>the same issuer ID appears in both datasets</strong>. They do not connect
            people, imply coordination, or show money moving.
          </p>
          <div class="map-locator">
            <div>
              <span>PUT THE RECORD IN CONTEXT</span>
              <p>
                {company.state
                  ? `${company.state} · Recorded business-address state`
                  : 'No agreed business-address state in these records'}
              </p>
              <small>A state anchor, not an office pin or transaction location.</small>
            </div>
            {#if company.state}<button
                disabled={!ready}
                onclick={() => mapFocus.focusState(company.state!)}
                ><span aria-hidden="true">⌖</span> Locate on map <b>↗</b></button
              >{/if}
          </div>
          <div class="section-heading">
            <span>02 / CHECK THE TIME WINDOWS</span><small>Dates are part of the evidence</small>
          </div>
          <div class="timeline" aria-label="Collected record date windows">
            {#each company.views as view}
              <div class="time-row" style={`--accent:${connectionLabels[view.kind].color}`}>
                <div>
                  <strong>{connectionLabels[view.kind].subtitle}</strong><small
                    >{view.dateMeaning}</small
                  >
                </div>
                <div class="time-range">
                  <span
                    style={`left:${((Date.parse(view.from) - first) / span) * 100}%;width:${Math.max(((Date.parse(view.through) - Date.parse(view.from)) / span) * 100, 0.5)}%`}
                    aria-hidden="true"
                  ></span>
                </div>
                <p>{formatDate(view.from)}<br />{formatDate(view.through)}</p>
              </div>
            {/each}
          </div>
          <p class="caution">
            These windows are not interchangeable. A filing date and a holdings date describe
            different events; overlap alone is not a statistical correlation.
          </p>
          <div class="section-heading"><span>03 / ASK A BETTER QUESTION</span></div>
          <div class="question-grid">
            {#each company.views as view}<article
                style={`--accent:${connectionLabels[view.kind].color}`}
              >
                <span>{connectionLabels[view.kind].subtitle}</span>
                <h3>{connectionLabels[view.kind].question}</h3>
                <p>{connectionLabels[view.kind].limit}</p>
                <a href={`${base}${view.href}`}>Explore the original view →</a>
              </article>{/each}
          </div>
          <details class="provenance">
            <summary>Why these records connect · sources & limits</summary>
            <p>{company.geography}</p>
            <p>
              This is an intersection of three selected collections, not a complete company history.
              The numbers use different units and must not be added together.
            </p>
            {#each company.views as view}{@const upstream = dataset.upstream.find(
                (u) => u.kind === view.kind,
              )!}
              <div class="source-note">
                <strong>{connectionLabels[view.kind].subtitle}</strong>
                <p>{upstream.selection}</p>
                <small
                  >Captured {formatDate(upstream.observedAt.slice(0, 10))} · {upstream.release}</small
                ><a href={view.profile.url} target="_blank" rel="noreferrer"
                  >Official company identity ↗</a
                ><a
                  href={`${base}/data/${view.kind}/releases/${upstream.release}/data.json`}
                  download>Frozen source index ↓</a
                >
              </div>{/each}<a
              class="download"
              href={`${base}/data/connections/releases/${data.connections!.release}/data.json`}
              download>Download the complete connection index ↓</a
            >
          </details>
        </section>
      {/key}
    {/if}
  {/if}
</div>

<style>
  .patterns-entry { display: block; padding: 15px 17px; margin: 0 0 22px; border: 1px solid #cfdee4; border-radius: 9px; text-decoration: none; background: #f0f6f6; color: #466d7b; }
  .patterns-entry span { display: block; font-size: 7px; letter-spacing: 1.4px; }
  .patterns-entry strong { display: block; font: 600 23px 'Barlow Condensed', sans-serif; margin: 7px 0; }
  .patterns-entry small { display: block; font-size: 9px; line-height: 1.6; color: #78929d; }
  .patterns-entry:focus-visible { outline: 3px solid #567f8b; outline-offset: 3px; }
  .map-locator {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 15px 17px;
    border: 1px solid #cddfe2;
    border-radius: 10px;
    background: linear-gradient(110deg, #edf5f4, #f7fafc);
    margin: 0 0 27px;
  }
  .map-locator > div > span {
    font-size: 8px;
    letter-spacing: 1.4px;
    color: #557f87;
  }
  .map-locator p {
    font-size: 12px;
    font-weight: 600;
    margin: 7px 0 5px;
  }
  .map-locator small {
    font-size: 10px;
    color: #68818d;
    line-height: 1.5;
  }
  .map-locator button {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
    padding: 11px 13px;
    border: 1px solid #bcd3d8;
    border-radius: 8px;
    background: white;
    font-size: 11px;
    color: #3f6976;
  }
  .map-locator button > span {
    font-size: 19px;
  }
  .map-locator b {
    font-weight: 400;
  }
  @media (max-width: 600px) {
    .map-locator {
      align-items: stretch;
      flex-direction: column;
      gap: 12px;
    }
    .map-locator button {
      justify-content: center;
      min-height: 44px;
    }
  }
  :global(.evidence-workspace:has(.connections-page)) {
    background: #fbfdfe;
  }
  .connections-page {
    --ink: #182b39;
    --muted: #617686;
    --teal: #537f86;
    color: var(--ink);
    padding: 34px 32px 56px;
    max-width: 1080px;
    margin: auto;
  }
  .kicker,
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 9px;
    letter-spacing: 2px;
    font-weight: 700;
  }
  .kicker {
    color: var(--teal);
    margin-bottom: 22px;
  }
  .kicker > span:first-child {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .kicker i {
    width: 6px;
    height: 6px;
    background: #699691;
    border-radius: 50%;
    box-shadow: 0 0 0 4px #69969113;
  }
  h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 700;
    font-size: clamp(42px, 4vw, 56px);
    line-height: 0.97;
    letter-spacing: -1px;
    margin: 0 0 14px;
  }
  h2 em {
    font-style: normal;
    color: var(--teal);
  }
  .intro {
    font-size: 14px;
    line-height: 1.7;
    max-width: 580px;
    color: var(--muted);
  }
  .scope-strip {
    display: flex;
    gap: 32px;
    align-items: center;
    border-top: 1px solid #dce7ed;
    border-bottom: 1px solid #dce7ed;
    padding: 12px 0;
    margin: 17px 0;
  }
  .scope-strip > strong {
    font-size: 28px;
    font-family: 'Barlow Condensed', sans-serif;
    line-height: 1;
  }
  .scope-strip small {
    display: block;
    font-family: Inter, sans-serif;
    letter-spacing: 1.5px;
    font-size: 8px;
    margin-top: 8px;
    color: var(--muted);
  }
  .scope-strip p {
    font-size: 11px;
    line-height: 1.7;
    margin: 0;
  }
  .scope-strip p span {
    color: var(--muted);
  }
  .search {
    display: flex;
    gap: 18px;
    justify-content: space-between;
    align-items: center;
  }
  .search label {
    font-size: 12px;
    font-weight: 700;
  }
  .search label span {
    display: block;
    font-weight: 400;
    font-size: 10px;
    margin-top: 5px;
    color: var(--muted);
  }
  .search > div {
    display: flex;
    gap: 8px;
    flex: 1;
    max-width: 380px;
  }
  input {
    width: 100%;
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid #d2e0e7;
    background: #fff;
    border-radius: 8px;
    color: var(--ink);
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .search button {
    border: 0;
    background: var(--ink);
    color: white;
    white-space: nowrap;
    border-radius: 8px;
    padding: 11px 15px;
    font-size: 11px;
  }
  .selection-line {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 10px;
    color: var(--muted);
    margin: 20px 0 10px;
  }
  a {
    color: inherit;
  }
  .company-picker {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .company-picker button {
    min-width: 0;
    text-align: left;
    padding: 15px;
    border: 1px solid #dce6ec;
    border-radius: 10px;
    background: #ffffffae;
    transition:
      background 0.2s,
      border-color 0.2s,
      transform 0.2s;
    color: var(--ink);
  }
  .company-picker button:hover {
    transform: translateY(-2px);
    border-color: var(--teal);
  }
  .company-picker button.selected {
    background: #eaf3f2;
    border-color: #7fa5a6;
  }
  .company-picker span {
    display: block;
    font-size: 10px;
    letter-spacing: 1.5px;
    color: var(--teal);
    font-weight: 700;
  }
  .company-picker strong {
    display: block;
    font-size: 12px;
    margin: 8px 0;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .company-picker small {
    font-size: 9px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
  }
  .company-picker b {
    font-size: 14px;
  }
  .connection-detail {
    margin-top: 22px;
  }
  .section-heading {
    border-top: 1px solid #dce6ec;
    padding-top: 20px;
    color: var(--muted);
    letter-spacing: 1.5px;
  }
  .section-heading button {
    font-size: 10px;
    border: 1px solid #dce6ec;
    border-radius: 6px;
    background: white;
    padding: 9px 12px;
    color: var(--ink);
    letter-spacing: 0;
  }
  .section-heading small {
    letter-spacing: 0;
    font-weight: 400;
  }
  .share-feedback {
    font-size: 11px;
    color: var(--teal);
    margin: 4px 0;
  }
  .connection-graph {
    position: relative;
    min-height: 336px;
    margin: 4px -8px;
    background: radial-gradient(ellipse at 22% 50%, #d4e7e747, transparent 60%);
    border-radius: 16px;
  }
  .graph-lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .graph-lines path {
    fill: none;
    stroke: var(--line);
    stroke-width: 1.5;
    opacity: 0.4;
    stroke-dasharray: 600;
    stroke-dashoffset: 0;
    animation: trace 0.9s both;
    animation-delay: var(--delay);
    transition:
      stroke-width 0.18s,
      opacity 0.18s;
  }
  .graph-lines path.lit {
    stroke-width: 3;
    opacity: 1;
  }
  .identity-node {
    position: absolute;
    left: 1%;
    top: 50%;
    transform: translateY(-50%);
    width: 30%;
    text-align: center;
    padding: 20px 8px;
    z-index: 1;
  }
  .identity-node > small {
    font-size: 8px;
    letter-spacing: 1.7px;
    color: var(--teal);
  }
  .identity-node > strong {
    display: block;
    font:
      700 46px/1.3 'Barlow Condensed',
      sans-serif;
    letter-spacing: 1px;
  }
  .identity-node p {
    font-size: 11px;
    margin: 4px auto 12px;
    max-width: 170px;
  }
  .identity-node code {
    font-size: 9px;
    color: var(--muted);
    display: block;
  }
  .identity-badge {
    display: inline-block;
    background: #fff;
    border: 1px solid #d3e4e3;
    color: var(--teal);
    font-size: 8px;
    border-radius: 30px;
    padding: 6px 8px;
    margin-top: 12px;
  }
  .node-orbit {
    position: absolute;
    border: 1px solid #8cb5b026;
    border-radius: 50%;
    width: 190px;
    height: 190px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: -1;
  }
  .view-nodes {
    margin-left: 40%;
    display: grid;
    grid-template-rows: repeat(3, 96px);
    gap: 16px;
    padding: 8px 8px 8px 0;
  }
  .view-node {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 17px;
    border: 1px solid #dce6ec;
    border-left: 3px solid var(--accent);
    border-radius: 11px;
    background: #fff;
    box-shadow: 0 6px 18px #243c4705;
    text-decoration: none;
    transition:
      transform 0.2s,
      box-shadow 0.2s,
      border-color 0.2s;
    min-width: 0;
  }
  .view-node:hover,
  .view-node:focus-visible {
    transform: translateX(4px);
    box-shadow: 0 8px 24px #243c4710;
    border-color: var(--accent);
  }
  .node-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--accent) 10%, white);
    color: var(--accent);
    border-radius: 10px;
    font-size: 24px;
  }
  .view-node small {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--accent);
  }
  .view-node h3 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 24px;
    line-height: 1;
    margin: 5px 0 8px;
  }
  .view-node p {
    font-size: 10px;
    color: var(--muted);
    margin: 0;
  }
  .node-arrow {
    margin-left: auto;
    color: var(--accent);
    font-size: 23px;
  }
  .unavailable {
    border-left: 1px dashed #cddbe2;
    background: #f6f9fb8a;
    box-shadow: none;
    opacity: 0.7;
    justify-content: space-between;
  }
  .unavailable small {
    color: var(--muted);
  }
  .graph-caption {
    display: block;
    font-size: 10px;
    line-height: 1.7;
    color: var(--muted);
    margin: 8px 0 29px;
  }
  .line-sample {
    display: inline-block;
    width: 22px;
    height: 1px;
    background: var(--teal);
    vertical-align: middle;
    margin-right: 5px;
  }
  .timeline {
    margin: 18px 0;
  }
  .time-row {
    display: grid;
    grid-template-columns: 1.1fr 1fr auto;
    align-items: center;
    gap: 15px;
    padding: 14px 0;
    border-bottom: 1px solid #e4ecef;
  }
  .time-row strong {
    font-size: 11px;
  }
  .time-row small {
    display: block;
    font-size: 9px;
    line-height: 1.6;
    color: var(--muted);
    margin-top: 4px;
  }
  .time-range {
    height: 5px;
    position: relative;
    background: #e8eef2;
    border-radius: 20px;
  }
  .time-range span {
    position: absolute;
    top: 0;
    height: 5px;
    border-radius: 20px;
    background: var(--accent);
    min-width: 3px;
  }
  .time-row p {
    font-size: 9px;
    line-height: 1.8;
    color: var(--muted);
    margin: 0;
  }
  .caution {
    font-size: 10px;
    line-height: 1.7;
    padding: 13px 15px;
    background: #edf3f5;
    border-radius: 8px;
    color: var(--muted);
    margin: 0 0 26px;
  }
  .question-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 15px;
    margin: 20px 0 30px;
  }
  .question-grid article {
    border-top: 2px solid var(--accent);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
  }
  .question-grid span {
    font-size: 9px;
    color: var(--accent);
  }
  .question-grid h3 {
    font-size: 14px;
    line-height: 1.4;
    margin: 8px 0;
  }
  .question-grid p {
    font-size: 10px;
    line-height: 1.8;
    color: var(--muted);
    margin: 0 0 15px;
  }
  .question-grid a {
    font-size: 10px;
    font-weight: 700;
    margin-top: auto;
  }
  .provenance {
    border: 1px solid #dce6ec;
    border-radius: 10px;
    padding: 16px;
    font-size: 11px;
    line-height: 1.7;
  }
  .provenance summary {
    cursor: pointer;
    font-weight: 700;
    min-height: 24px;
  }
  .provenance p {
    color: var(--muted);
  }
  .source-note {
    padding: 14px 0;
    border-top: 1px solid #e3ecef;
  }
  .source-note small {
    display: block;
    overflow-wrap: anywhere;
  }
  .source-note a {
    display: inline-block;
    margin: 10px 14px 0 0;
  }
  .download {
    display: inline-block;
    margin-top: 15px;
  }
  .empty {
    border: 1px dashed #c3d6dc;
    padding: 24px;
    border-radius: 12px;
    margin-top: 18px;
    font-size: 13px;
    line-height: 1.7;
  }
  .empty button {
    display: block;
    margin-top: 14px;
    padding: 10px;
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  summary:focus-visible {
    outline: 3px solid #537f86;
    outline-offset: 4px;
  }
  @keyframes trace {
    from {
      stroke-dashoffset: 600;
      opacity: 0;
    }
    to {
      stroke-dashoffset: 0;
      opacity: 0.4;
    }
  }
  @media (max-width: 600px) {
    .connections-page {
      padding: 24px 17px 40px;
    }
    .kicker > span:last-child {
      display: none;
    }
    .scope-strip {
      gap: 22px;
    }
    .scope-strip p {
      font-size: 9px;
    }
    .scope-strip strong {
      font-size: 30px;
    }
    .scope-strip small {
      font-size: 7px;
    }
    .search {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
    }
    .search > div {
      max-width: none;
    }
    .company-picker {
      grid-template-columns: 1fr;
    }
    .company-picker button {
      display: grid;
      grid-template-columns: 45px 1fr;
      gap: 4px 10px;
      align-items: center;
      padding: 11px;
    }
    .company-picker strong {
      margin: 0;
    }
    .company-picker small {
      grid-column: 2;
    }
    .connection-detail {
      margin-top: 25px;
    }
    .connection-graph {
      padding: 15px 8px;
      min-height: 0;
    }
    .graph-lines {
      display: none;
    }
    .identity-node {
      position: relative;
      left: auto;
      top: auto;
      transform: none;
      width: auto;
      padding: 24px 10px;
    }
    .node-orbit {
      width: 155px;
      height: 155px;
    }
    .view-nodes {
      margin: 24px 0 0 14px;
      border-left: 1px solid #a5bfc5;
      padding: 0 0 0 18px;
      grid-template-rows: repeat(3, 100px);
      gap: 12px;
    }
    .view-node {
      padding: 13px;
      position: relative;
    }
    .view-node:before {
      content: '';
      position: absolute;
      left: -21px;
      width: 18px;
      top: 50%;
      border-top: 1px solid #a5bfc5;
    }
    .unavailable:before {
      display: none;
    }
    .node-icon {
      width: 30px;
      height: 30px;
    }
    .view-node h3 {
      font-size: 24px;
    }
    .view-node small {
      font-size: 7px;
    }
    .time-row {
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    .time-range {
      grid-column: 1;
      grid-row: auto;
    }
    .time-row p {
      grid-column: 2;
      grid-row: span 2;
      text-align: right;
    }
    .question-grid {
      grid-template-columns: 1fr;
      gap: 22px;
    }
    .question-grid h3 {
      font-size: 16px;
    }
    .question-grid p,
    .question-grid a {
      font-size: 12px;
    }
    .section-heading {
      font-size: 8px;
    }
    .section-heading small {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .graph-lines path {
      animation: none;
    }
    .company-picker button,
    .view-node,
    .graph-lines path {
      transition: none;
    }
    .view-node:hover,
    .company-picker button:hover {
      transform: none;
    }
  }
</style>
