<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    filterLobbying,
    lobbyingAgenda,
    lobbyingSeries,
    type LobbyingFiling,
  } from '$lib/civic/lobbying';
  let { data } = $props();
  let detailElement: HTMLElement | undefined = $state();
  let ready = $state(false),
    reduced = $state(true),
    limit = $state(24);
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.lobbying?.data);
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filterKey = $derived(
    JSON.stringify(['q', 'client', 'year', 'issue', 'state'].map((k) => [k, params.get(k) ?? ''])),
  );
  const filtered = $derived(
    dataset ? filterLobbying(dataset.records, new URLSearchParams(JSON.parse(filterKey))) : [],
  );
  const agenda = $derived(lobbyingAgenda(dataset?.records ?? []));
  const groups = $derived(lobbyingSeries(filtered));
  const view = $derived(params.get('view') === 'filings' ? 'filings' : 'agenda');
  const selected = $derived(dataset?.records.find((r) => r.id === params.get('filing')));
  const selectedSeries = $derived(
    selected ? agenda.find((g) => g.versions.some((r) => r.id === selected.id)) : undefined,
  );
  const clients = $derived([
    ...new Map(dataset?.records.map((r) => [r.client.id, r.client]) ?? []).values(),
  ]);
  const issues = $derived(
    [
      ...new Map(
        dataset?.records.flatMap((r) => r.activities.map((a) => [a.code, a.label] as const)) ?? [],
      ).entries(),
    ].sort((a, b) => a[1].localeCompare(b[1])),
  );
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
  const amount = (n: number | null) => (n === null ? 'Not reported' : money.format(n / 100));
  const quarterLabel = (r: LobbyingFiling) =>
    r.quarter ? `${r.year} / Q${r.quarter}` : `${r.year} / ${r.periodLabel}`;
  const shownGroups = $derived(
    groups.toSorted((a, b) => {
      const x = a.versions[0],
        y = b.versions[0];
      return y.year * 4 + y.quarter! - (x.year * 4 + x.quarter!);
    }),
  );
  const ordered = $derived(
    filtered.toSorted((a, b) => Date.parse(b.posted) - Date.parse(a.posted)),
  );
  // Compute introductions from the complete relationship history, never from search-filtered rows.
  const newIssueCount = $derived(
    agenda
      .filter((g) => filtered.some((r) => r.id === g.latest?.id))
      .reduce((n, g) => n + g.newCodes.length, 0),
  );
  $effect(() => {
    void filterKey;
    void view;
    limit = 24;
  });
  async function navigate(changes: Record<string, string | null>, replace = false) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
    if (changes.filing) {
      await tick();
      detailElement?.focus({ preventScroll: true });
      detailElement?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    }
  }
  const date = (value: string) => value.slice(0, 10);
</script>

<svelte:head
  ><title>Washington Agenda · Louder Than Words</title><meta
    name="description"
    content="Follow disclosed lobbying issues, government entities and quarterly filings. Exact source language, visible amendments and no inferred influence."
  /></svelte:head
>
<div class="evidence-page agenda-page">
  <div class="agenda-kicker">
    <span>07 / Disclosed policy priorities</span><a href={`${base}/records/rules/`}
      >Explore agency rules ↗</a
    >
  </div>
  <header>
    <p class="eyebrow">A company’s Washington agenda</p>
    <h2>Follow<br />the <em>issues.</em></h2>
    <p>
      What does a company report lobbying about? Follow the quarterly record, see newly listed issue
      areas, and read the exact language behind each one.
    </p>
  </header>
  {#if !dataset}<p role="alert">{data.lobbyingError}</p>
  {:else}
    <div class="agenda-scope">
      <strong>{dataset.plan.title}</strong>
      <p>
        Captured {date(dataset.observedAt)} · {dataset.records.length} filings · {clients.length} distinct
        client ID{clients.length === 1 ? '' : 's'}. This is a selected collection, not all lobbying
        by a corporate group.
      </p>
    </div>
    <div class="agenda-stats" aria-label="Filtered collection">
      <div><strong>{filtered.length}</strong><span>source filings</span></div>
      <div><strong>{groups.length}</strong><span>quarterly series</span></div>
      <div><strong>{newIssueCount}</strong><span>newly listed issue codes*</span></div>
    </div>
    <p class="agenda-caption">
      *Compared with the preceding reported quarter in the same client/registrant relationship. Not
      proof of a new private priority, successful influence or a position for/against a bill.
    </p>
    <div class="agenda-filters">
      <label class="agenda-wide"
        >Search company, issue, bill mention or agency<input
          type="search"
          disabled={!ready}
          value={params.get('q') ?? ''}
          oninput={(e) => navigate({ q: e.currentTarget.value, filing: null }, true)}
          placeholder="Try energy, H.R., or Treasury"
        /></label
      >
      <label
        >Client identity<select
          aria-label="Client identity"
          disabled={!ready}
          value={params.get('client') ?? ''}
          onchange={(e) => navigate({ client: e.currentTarget.value, filing: null })}
          ><option value="">All collected client IDs</option>{#each clients as c}<option
              value={c.id}>{c.name} · ID {c.id}</option
            >{/each}</select
        ></label
      >
      <label
        >Filing year<select
          aria-label="Filing year"
          disabled={!ready}
          value={params.get('year') ?? ''}
          onchange={(e) => navigate({ year: e.currentTarget.value, filing: null })}
          ><option value="">All captured years</option
          >{#each Array.from({ length: dataset.plan.throughYear - dataset.plan.fromYear + 1 }, (_, i) => dataset.plan.fromYear + i) as year}<option
              value={year}>{year}</option
            >{/each}</select
        ></label
      >
      <label class="agenda-wide"
        >Disclosed issue area<select
          aria-label="Disclosed issue area"
          disabled={!ready}
          value={params.get('issue') ?? ''}
          onchange={(e) => navigate({ issue: e.currentTarget.value, filing: null })}
          ><option value="">All issue areas</option>{#each issues as [code, label]}<option
              value={code}>{label} · {code}</option
            >{/each}</select
        ></label
      >
    </div>
    <div class="agenda-tabs" role="group" aria-label="Lobbying view">
      <button
        disabled={!ready}
        aria-pressed={view === 'agenda'}
        onclick={() => navigate({ view: null, filing: null })}>Quarterly agenda</button
      ><button
        disabled={!ready}
        aria-pressed={view === 'filings'}
        onclick={() => navigate({ view: 'filings', filing: null })}>Every filing & amendment</button
      >
    </div>
    {#if params.get('state')}<p class="agenda-caption">
        Filtered by reported client state: {params.get('state')}. Client metadata is as retrieved,
        not a verified historical address or location of lobbying.
      </p>{/if}
    {#if selected}
      {#key selected.id}<article
          class="agenda-detail"
          bind:this={detailElement}
          tabindex="-1"
          in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 180 }}
          aria-label="Filing evidence"
        >
          <button class="agenda-close" onclick={() => navigate({ filing: null })}
            >Close filing ×</button
          >
          <p class="eyebrow">{quarterLabel(selected)} · {selected.typeLabel}</p>
          <h3>{selected.client.name}</h3>
          <p>Reported by {selected.registrant.name}</p>
          <p class="agenda-caption">
            Posted {date(selected.posted)} · Client ID {selected.client.id} · Registrant ID {selected
              .registrant.id}
          </p>
          {#if selectedSeries && selectedSeries.latest?.id !== selected.id}<p
              class="agenda-caution"
            >
              {selectedSeries.latest
                ? 'An earlier posted version. Open the latest version below before comparing quarters.'
                : 'Multiple filings share the latest posting time. No single version is selected for quarter comparisons.'}
            </p>{/if}
          <dl>
            <dt>Reported expenses</dt>
            <dd>{amount(selected.expensesCents)}</dd>
            <dt>Reported income</dt>
            <dd>{amount(selected.incomeCents)}</dd>
          </dl>
          <p class="agenda-caption">
            Different reporting concepts. Do not add expenses to outside firms’ income, or sum
            original reports and amendments. Amounts are not attributed to individual issues.
          </p>
          {#if selected.type.endsWith('Y')}<p class="agenda-caution">
              The filing type explicitly reports no activity for this period.
            </p>{/if}
          {#each selected.activities as activity, i}
            <section class="agenda-activity">
              <p class="eyebrow">Activity {i + 1} / {activity.code}</p>
              <h4>{activity.label}</h4>
              {#if selectedSeries?.latest?.id === selected.id && selectedSeries.newCodes.includes(activity.code)}<span
                  class="agenda-new">Newly listed since preceding quarter</span
                >{/if}
              <blockquote>
                {activity.description ?? 'No specific-issue description supplied.'}
              </blockquote>
              <h5>Government entities listed for this activity</h5>
              <p>{activity.governmentEntities.map((e) => e.name).join(' · ') || 'None listed'}</p>
              {#if activity.billMentions.length}<h5>Literal bill mentions</h5>
                <p>{activity.billMentions.map((m) => m.text).join(' · ')}</p>
                <p class="agenda-caption">
                  Numbers alone do not establish a Congress, bill version or lobbying position.
                  These are text mentions, not verified links to our vote receipts.
                </p>{/if}
            </section>
          {:else}<p>
              No lobbying activity sections were returned for this filing. That is not a finding of
              no activity outside this disclosure.
            </p>{/each}
          {#if selectedSeries && selectedSeries.versions.length > 1}<div class="agenda-versions">
              <h4>Preserved filing versions</h4>
              {#each selectedSeries.versions as version}<button
                  aria-pressed={version.id === selected.id}
                  onclick={() => navigate({ filing: version.id })}
                  >{date(version.posted)} · {version.typeLabel}{selectedSeries.latest?.id ===
                  version.id
                    ? ' · latest posted'
                    : ''}</button
                >{/each}
            </div>{/if}
          <div class="agenda-source">
            <p>
              <a
                href={`${base}/records/revolving/?filing=${selected.id}&recordHash=${selected.source.recordHash}`}
                >Look up people named in this filing ↗</a
              >
            </p>
            <a href={selected.source.url} target="_blank" rel="noreferrer"
              >Open original LDA filing ↗</a
            >
            <p>Filing {selected.id}<br />Source record SHA-256: {selected.source.recordHash}</p>
          </div>
        </article>{/key}
    {:else if params.get('filing')}<p role="status">
        That filing is not in this captured collection.
      </p>{/if}
    {#if !filtered.length}<div class="agenda-empty">
        <h3>No matching filings</h3>
        <p>
          Try a broader search or another client/year. No match is not evidence that no lobbying
          occurred.
        </p>
        <button
          onclick={() =>
            navigate({ q: null, client: null, year: null, issue: null, state: null, filing: null })}
          >Clear filters</button
        >
      </div>
    {:else if view === 'agenda'}
      <h3 class="agenda-section-title">The quarterly record</h3>
      <p class="agenda-caption">
        Latest posted version per client, registrant and quarter. Search can match earlier versions;
        comparisons always use the full preserved series.
      </p>
      <div class="agenda-timeline">
        {#each shownGroups.slice(0, limit) as group (group.key)}
          {@const full = agenda.find((g) => g.key === group.key)!}{@const report =
            full.latest ?? full.versions[0]}
          <button
            class="agenda-quarter"
            disabled={!ready}
            onclick={() => navigate({ filing: report.id })}
            aria-label={`Open ${quarterLabel(report)} filing for ${report.client.name}`}
          >
            <span class="agenda-quarter-date">{quarterLabel(report)}</span><strong
              >{report.client.name}</strong
            ><small
              >{report.registrant.name} · {full.versions.length} filing version{full.versions
                .length === 1
                ? ''
                : 's'}</small
            >
            <span class="agenda-chips"
              >{#each [...new Map(report.activities.map( (a) => [a.code, a.label] )).entries()] as [code, label]}<span
                  class:new={full.newCodes.includes(code)}
                  >{label}{full.newCodes.includes(code) ? ' +' : ''}</span
                >{/each}</span
            >
            <small
              >{!full.latest
                ? 'Unresolved posting-time tie'
                : full.comparable
                  ? 'Compared with preceding reported quarter'
                  : 'No comparable preceding quarter'}</small
            ><span class="agenda-arrow" aria-hidden="true">↗</span>
          </button>
        {/each}
      </div>
      {#if !shownGroups.length}<p class="agenda-caption">
          Matching records contain no quarterly reports. Open “Every filing & amendment” to read
          registrations.
        </p>{/if}
      {#if shownGroups.length > limit}<button onclick={() => (limit += 24)}
          >Show 24 more quarters</button
        >{/if}
    {:else}
      <h3 class="agenda-section-title">Every captured filing</h3>
      <div class="agenda-timeline">
        {#each ordered.slice(0, limit) as report (report.id)}<button
            class="agenda-quarter"
            disabled={!ready}
            onclick={() => navigate({ filing: report.id })}
            ><span class="agenda-quarter-date">{quarterLabel(report)}</span><strong
              >{report.typeLabel}</strong
            ><small
              >{report.client.name} · {report.registrant.name}<br />Posted {date(
                report.posted,
              )}</small
            ><span class="agenda-arrow" aria-hidden="true">↗</span></button
          >{/each}
      </div>
      {#if ordered.length > limit}<button onclick={() => (limit += 24)}>Show 24 more filings</button
        >{/if}
    {/if}
    <details class="agenda-methods">
      <summary>Read the collection rules & limitations</summary>
      <p>
        Acquired all API pages for each configured client ID and filing year. Counts include
        registrations and amendments; they are not unique lobbying engagements. A missing quarterly
        report is not zero activity. The first observed quarter has no comparison baseline.
      </p>
      <p>
        Client IDs identify the disclosed client records, not a verified corporate family. Similar
        names, “on behalf of” intermediaries and separately registered relationships are not
        silently merged. Historical filing text is preserved; client state metadata is only known as
        retrieved.
      </p>
      <p>
        “Newly listed” means an official general-issue code appears in the latest posted version but
        not the adjacent preceding quarter’s latest version for that same client/registrant. It does
        not detect every semantic change within an existing code. Exact issue descriptions remain
        readable. No AI score, stance or causal influence is assigned.
      </p>
      <p>
        Bill mentions are literal text matches. A bill number can recur across Congresses; no
        automatic vote match is asserted. Listed agencies do not identify individual meetings or
        prove an outcome. The map shows client-state anchors, not where influence occurred.
      </p>
      <p>
        Amendments and originals remain available. Latest-posted selection is a display rule, not
        independently verified formal supersession. Tied latest timestamps prevent comparisons.
        Counts and identities are checked across pagination, but the API does not provide an atomic
        historical database snapshot.
      </p>
      <p>
        Capture changes: {dataset.changes.baselineAt
          ? `compared with ${date(dataset.changes.baselineAt)}`
          : 'initial baseline'}; {dataset.changes.added.length} newly captured, {dataset.changes
          .updated.length} changed source records, {dataset.changes.notReturned.length} no longer returned.
        “Not returned” is not deletion, termination or exoneration.
      </p>
      <ul>
        {#each dataset.coverage as c}<li>
            Client {c.clientId} · {c.year}: {c.count} source filings
          </li>{/each}
      </ul>
      <a
        href={`${base}/data/lobbying/releases/${data.lobbying!.manifest.release}/data.json`}
        download>Download complete captured dataset</a
      >
    </details>
    <div class="agenda-context">
      <h3>Follow the surrounding record</h3>
      <p>
        Explore agency rules and recorded votes as separate evidence. These navigation links do not
        claim lobbying caused any rule or vote.
      </p>
      <a href={`${base}/records/rules/`}>Agency rulebook ↗</a><a href={`${base}/records/votes/`}
        >Vote receipts ↗</a
      >{#if params.get('state')}<a href={`${base}/records/paycheck/?state=${params.get('state')}`}
          >Same-state economic context ↗</a
        >{/if}
    </div>
    <footer>
      <p>{dataset.sourceNotice}</p>
      <p>
        Source: <a href="https://lda.gov/api/">LDA.gov</a> · Retrieved {dataset.observedAt} · {data
          .lobbying!.manifest.release}
      </p>
    </footer>
  {/if}
</div>

<style>
  .agenda-page {
    --ink: #273d50;
    --accent: #526d89;
    color: var(--ink);
  }
  .agenda-kicker {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.4px;
    border-bottom: 1px solid #cfdae3;
    padding-bottom: 18px;
  }
  .agenda-page a {
    color: #3c607f;
    text-underline-offset: 4px;
  }
  .agenda-page header {
    padding: 30px 0 24px;
  }
  .agenda-page h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(52px, 6vw, 88px);
    font-weight: 700;
    line-height: 0.95;
    letter-spacing: -1px;
    margin: 14px 0 20px;
  }
  .agenda-page h2 em {
    color: #64819c;
    font-style: normal;
  }
  .agenda-page header > p:last-child {
    font-size: 14px;
    line-height: 1.8;
    max-width: 560px;
  }
  .agenda-scope {
    border-left: 3px solid #708da6;
    background: #f0f5f9;
    padding: 17px 20px;
  }
  .agenda-scope strong {
    font-size: 14px;
  }
  .agenda-scope p,
  .agenda-caption {
    font-size: 12px;
    line-height: 1.7;
    color: #65778a;
  }
  .agenda-scope p {
    margin-bottom: 0;
  }
  .agenda-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin-top: 22px;
    border: 1px solid #d4dee6;
    border-radius: 8px;
    overflow: hidden;
  }
  .agenda-stats > div {
    padding: 20px 12px;
    border-right: 1px solid #d4dee6;
  }
  .agenda-stats > div:last-child {
    border: 0;
  }
  .agenda-stats strong {
    display: block;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 36px;
  }
  .agenda-stats span {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.7px;
  }
  .agenda-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 26px 0;
  }
  .agenda-wide {
    grid-column: 1/-1;
  }
  .agenda-filters label {
    font-size: 11px;
    letter-spacing: 0.3px;
    display: grid;
    gap: 8px;
  }
  .agenda-page input,
  .agenda-page select {
    width: 100%;
    min-width: 0;
    padding: 12px;
    border: 1px solid #b9cad7;
    border-radius: 5px;
    color: var(--ink);
    background: #fff;
    font: inherit;
    font-size: 13px;
  }
  .agenda-page button {
    cursor: pointer;
    font: inherit;
    color: var(--ink);
    border: 1px solid #c5d3df;
    border-radius: 6px;
    background: #fff;
    padding: 10px 14px;
    min-height: 42px;
  }
  .agenda-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 20px 0;
  }
  .agenda-tabs button {
    font-size: 12px;
  }
  .agenda-tabs button[aria-pressed='true'] {
    background: var(--ink);
    color: #fff;
    border-color: var(--ink);
  }
  .agenda-section-title {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 30px;
    margin: 30px 0 8px;
  }
  .agenda-timeline {
    padding-left: 20px;
    border-left: 2px solid #cfdae3;
    margin: 22px 0;
  }
  .agenda-quarter {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 10px;
    margin-bottom: 14px;
    padding: 22px !important;
    transition:
      transform 0.18s,
      border-color 0.18s,
      box-shadow 0.18s;
    overflow-wrap: anywhere;
  }
  .agenda-quarter:before {
    content: '';
    position: absolute;
    left: -27px;
    top: 27px;
    border: 2px solid white;
    border-radius: 50%;
    width: 10px;
    height: 10px;
    background: #6d89a2;
  }
  .agenda-quarter:hover {
    transform: translateY(-2px);
    border-color: #6b8ba5;
    box-shadow: 0 6px 18px #294a6410;
  }
  .agenda-quarter-date {
    font-size: 11px;
    color: #557590;
    letter-spacing: 2px;
  }
  .agenda-quarter strong {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 25px;
  }
  .agenda-quarter small {
    font-size: 11px;
    line-height: 1.7;
    color: #687d8e;
  }
  .agenda-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .agenda-chips > span {
    font-size: 10px;
    border: 1px solid #d6e1e8;
    border-radius: 4px;
    padding: 5px 8px;
    background: #f7f9fb;
  }
  .agenda-chips .new {
    background: #e7f2e9;
    border-color: #bcd4c4;
    color: #37654a;
  }
  .agenda-arrow {
    position: absolute;
    right: 18px;
    top: 20px;
  }
  .agenda-detail {
    background: #f5f8fb;
    border: 1px solid #bdcfdd;
    border-top: 4px solid var(--accent);
    border-radius: 8px;
    padding: 24px;
    margin: 25px 0;
    overflow-wrap: anywhere;
  }
  .agenda-close {
    float: right;
    font-size: 12px !important;
    margin-bottom: 14px;
  }
  .agenda-detail > h3 {
    clear: both;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 34px;
    padding-top: 8px;
    margin-bottom: 6px;
  }
  .agenda-detail > p {
    font-size: 13px;
    line-height: 1.7;
  }
  .agenda-detail dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    font-size: 13px;
    margin: 24px 0;
  }
  .agenda-detail dd {
    margin: 0;
    text-align: right;
  }
  .agenda-caution {
    border-left: 3px solid #bd9350;
    background: #fcf5e8;
    padding: 14px;
    font-size: 12px;
    line-height: 1.7;
  }
  .agenda-activity {
    padding: 20px 0;
    border-top: 1px solid #d4dfe7;
  }
  .agenda-activity h4 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 26px;
    margin: 6px 0 12px;
  }
  .agenda-activity h5 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    margin: 22px 0 6px;
  }
  .agenda-activity p {
    font-size: 12px;
    line-height: 1.7;
  }
  .agenda-activity blockquote {
    white-space: pre-wrap;
    line-height: 1.8;
    font-size: 14px;
    background: white;
    border-left: 2px solid #93aac0;
    padding: 17px;
    margin: 15px 0;
  }
  .agenda-new {
    font-size: 10px;
    color: #366548;
    background: #e7f2e9;
    padding: 6px 8px;
    border-radius: 4px;
    display: inline-block;
  }
  .agenda-versions button {
    display: block;
    font-size: 11px;
    margin: 8px 0;
    width: 100%;
    text-align: left;
  }
  .agenda-versions button[aria-pressed='true'] {
    border-color: #54718a;
    background: #e4edf5;
  }
  .agenda-source {
    font-size: 11px;
    line-height: 1.8;
    border-top: 1px solid #cfdae3;
    margin-top: 22px;
    padding-top: 20px;
  }
  .agenda-methods {
    border-top: 1px solid #cfdae3;
    border-bottom: 1px solid #cfdae3;
    margin: 30px 0;
    padding: 20px 0;
    font-size: 12px;
    line-height: 1.8;
  }
  .agenda-methods summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 30px;
  }
  .agenda-context {
    background: #edf3f8;
    padding: 22px;
    border-radius: 8px;
  }
  .agenda-context h3 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 25px;
    margin: 0 0 12px;
  }
  .agenda-context p {
    font-size: 12px;
    line-height: 1.7;
  }
  .agenda-context a {
    display: block;
    margin-top: 12px;
    font-size: 12px;
  }
  .agenda-empty {
    border: 1px dashed #b7cbd9;
    padding: 22px;
    margin: 24px 0;
    font-size: 13px;
    line-height: 1.7;
  }
  .agenda-page footer {
    font-size: 10px;
    line-height: 1.8;
    color: #738697;
    overflow-wrap: anywhere;
    margin-top: 30px;
  }
  .agenda-page :is(button, a, input, select, summary):focus-visible {
    outline: 3px solid #648fb1;
    outline-offset: 3px;
  }
  @media (max-width: 720px) {
    .agenda-filters {
      grid-template-columns: 1fr;
    }
    .agenda-wide {
      grid-column: auto;
    }
    .agenda-detail {
      padding: 17px;
    }
    .agenda-kicker {
      font-size: 9px;
    }
    .agenda-stats > div {
      padding: 13px 9px;
    }
    .agenda-stats span {
      font-size: 9px;
    }
    .agenda-quarter {
      padding: 18px !important;
    }
    .agenda-close {
      float: none;
    }
    .agenda-detail dl {
      grid-template-columns: 1fr;
    }
    .agenda-detail dd {
      text-align: left;
      margin-bottom: 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .agenda-quarter {
      transition: none;
    }
    .agenda-quarter:hover {
      transform: none;
    }
  }
</style>
