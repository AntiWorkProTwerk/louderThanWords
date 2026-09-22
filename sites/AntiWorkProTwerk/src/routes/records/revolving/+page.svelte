<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { careerPeople, careerRelationships } from '$lib/civic/revolving';
  let { data } = $props();
  let ready = $state(false),
    reduced = $state(true),
    limit = $state(24),
    detail: HTMLElement | undefined = $state();
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.revolving?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filterKey = $derived(
    JSON.stringify(
      ['q', 'state', 'client', 'filing', 'year', 'positions'].map((k) => [k, params.get(k) ?? '']),
    ),
  );
  const people = $derived(
    dataset ? careerPeople(dataset, new URLSearchParams(JSON.parse(filterKey))) : [],
  );
  const allPeople = $derived(
    dataset ? careerPeople(dataset, new URLSearchParams('positions=all')) : [],
  );
  const selected = $derived(allPeople.find((p) => String(p.id) === params.get('lobbyist')));
  const relationships = $derived(
    dataset && selected ? careerRelationships(dataset, selected.id) : [],
  );
  const report = $derived(
    selected?.reports.find((f) => f.id === (params.get('source') ?? params.get('filing'))) ??
      (!params.get('source') && !params.get('filing') ? selected?.reports[0] : undefined),
  );
  const reportObservations = $derived(
    selected?.history.filter((o) => o.filingId === report?.id) ?? [],
  );
  const clients = $derived([
    ...new Map(dataset?.filings.map((f) => [f.client.id, f.client]) ?? []).values(),
  ]);
  const date = (s: string) => s.slice(0, 10);
  $effect(() => {
    void filterKey;
    limit = 24;
  });
  async function navigate(changes: Record<string, string | null>, replace = false) {
    const url = new URL(page.url);
    for (const [k, v] of Object.entries(changes))
      v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
    if (changes.lobbyist) {
      await tick();
      detail?.focus({ preventScroll: true });
      detail?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    }
  }
</script>

<svelte:head
  ><title>Career Connections · Louder Than Words</title><meta
    name="description"
    content="Disclosed previous government roles beside dated client filings, with exact source text and no inferred misconduct."
  /></svelte:head
>
<div class="evidence-page career-page">
  <div class="career-kicker">
    <span>10 / The disclosed revolving door</span><a href={`${base}/records/lobbying/`}
      >Washington agenda ↗</a
    >
  </div>
  <header>
    <p class="eyebrow">Careers connect institutions.</p>
    <h2>See the<br /><em>public record.</em></h2>
    <p>
      Read the government positions lobbyists disclosed, then follow the client filings that name
      them. A career connection is not evidence of wrongdoing.
    </p>
  </header>
  {#if !dataset}<p role="alert">{data.revolvingError}</p>{:else}
    <div class="career-scope">
      <strong>{dataset.plan.title}</strong>
      <p>
        {dataset.filings.length} captured filings · {allPeople.length} source-person IDs · {clients.length}
        distinct client records. Retrieved {date(dataset.observedAt)}.
      </p>
    </div>
    <p class="career-note">
      This is a selected collection, not a complete employment history. Role dates are preserved as
      written; filing dates are not dates someone joined or left a job.
    </p>
    <div class="career-filters">
      <label class="career-wide"
        >Search a name, disclosed position or client<input
          disabled={!ready}
          type="search"
          value={params.get('q') ?? ''}
          oninput={(e) =>
            navigate({ q: e.currentTarget.value, lobbyist: null, source: null }, true)}
          placeholder="Try Judiciary, White House, or a name"
        /></label
      >
      <label
        >Reported client<select
          aria-label="Reported client"
          disabled={!ready}
          value={params.get('client') ?? ''}
          onchange={(e) =>
            navigate({ client: e.currentTarget.value, lobbyist: null, source: null })}
          ><option value="">All distinct client IDs</option>{#each clients as c}<option value={c.id}
              >{c.name} · {c.id}</option
            >{/each}</select
        ></label
      >
      <label
        >Filing year<select
          aria-label="Career filing year"
          disabled={!ready}
          value={params.get('year') ?? ''}
          onchange={(e) => navigate({ year: e.currentTarget.value, lobbyist: null, source: null })}
          ><option value="">All collected years</option
          >{#each Array.from({ length: dataset.plan.throughYear - dataset.plan.fromYear + 1 }, (_, i) => dataset.plan.fromYear + i) as year}<option
              value={year}>{year}</option
            >{/each}</select
        ></label
      >
      <label class="career-wide"
        >Position disclosure<select
          aria-label="Position disclosure"
          disabled={!ready}
          value={params.get('positions') === 'all' ? 'all' : 'disclosed'}
          onchange={(e) =>
            navigate({ positions: e.currentTarget.value, lobbyist: null, source: null })}
          ><option value="disclosed"
            >With a previous-position disclosure anywhere in this capture</option
          ><option value="all">All named lobbyists, including blank / reported-none fields</option
          ></select
        ></label
      >
    </div>
    {#if params.get('filing')}<div class="career-filter-note">
        Looking for people named in filing {params.get('filing')}.
        <button onclick={() => navigate({ filing: null, source: null, lobbyist: null })}
          >Show all filings</button
        >
      </div>{/if}
    {#if params.get('filing') && params.get('recordHash') && dataset.filings.some((f) => f.id === params.get('filing') && f.source.recordHash !== params.get('recordHash'))}<p
        class="career-warning"
      >
        This collection contains a different captured revision of the linked filing. Inspect both
        original records; an identical-evidence match is not established.
      </p>{/if}
    <p class="career-count" role="status">
      {people.length} matching source-person ID{people.length === 1 ? '' : 's'}{params.get('state')
        ? ` · reported client state ${params.get('state')}`
        : ''}
    </p>
    {#if selected}
      {#key selected.id}<article
          class="career-detail"
          bind:this={detail}
          tabindex="-1"
          aria-label="Career evidence"
          in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 180 }}
        >
          <button class="career-close" onclick={() => navigate({ lobbyist: null, source: null })}
            >Close career record ×</button
          >
          <p class="eyebrow">LDA person ID {selected.id}</p>
          <h3>{selected.names[0]}</h3>
          {#if selected.names.length > 1}<p class="career-note">
              Names associated with this source ID: {selected.names.join(' / ')}. We do not
              independently certify a unique real-world identity.
            </p>{/if}
          <p class="career-note">
            The full captured history for this source ID is shown below, including context outside
            the current list filters. Repeated issue-area entries are not counted as separate people
            or jobs.
          </p>
          <div
            class="career-connection"
            aria-label="Disclosed role to reported client relationships"
          >
            <section>
              <span class="career-step">01 / Earlier roles, as disclosed</span>
              <h4>Government position text</h4>
              {#each selected.positions as position}
                {@const evidence = selected.history.filter((o) => o.coveredPosition === position)}
                {@const source = dataset.filings.find((f) => f.id === evidence[0].filingId)!}
                <div class="career-position">
                  <blockquote>{position}</blockquote>
                  <a href={source.source.url} target="_blank" rel="noreferrer"
                    >Read this disclosure ↗</a
                  ><small
                    >Exact covered-position field · {new Set(evidence.map((o) => o.filingId)).size} captured
                    filing(s). Role dates are not independently verified.</small
                  >
                </div>
              {:else}<p>
                  No nonblank previous-position description in this capture. This does not prove
                  there was no government service.
                </p>{/each}
            </section>
            <div class="career-connector" aria-hidden="true"><span></span>→<span></span></div>
            <section>
              <span class="career-step">02 / Named in client filings</span>
              <h4>Disclosed relationships</h4>
              {#each relationships as relationship}<div class="career-client">
                  <strong>{relationship.client.name}</strong>
                  <p>
                    Client {relationship.client.id}<br />Registrant: {relationship.registrant.name}
                  </p>
                  <small
                    >Captured postings: {date(relationship.firstPosted)} → {date(
                      relationship.lastPosted,
                    )}<br />{relationship.reports.length} filings, including any amendments. Not employment
                    start/end dates.</small
                  >
                </div>{/each}
            </section>
          </div>
          <p class="career-note">
            The connector represents a disclosed prior-role/person/client association. It is not
            money, travel, a meeting, influence, a conflict finding or a verified transition date.
          </p>
          <h4 class="career-subheading">Follow the filing record</h4>
          <div class="career-timeline">
            {#each selected.reports as filing}<button
                aria-pressed={report?.id === filing.id}
                onclick={() => navigate({ source: filing.id })}
                ><time>{date(filing.posted)}</time><strong
                  >{filing.year} · {filing.typeLabel}</strong
                ><small>{filing.client.name} · {filing.registrant.name}</small></button
              >{/each}
          </div>
          {#if report}<section class="career-report" aria-label="Selected filing evidence">
              <p class="eyebrow">Posted {date(report.posted)}</p>
              <h4>{report.year} · {report.typeLabel}</h4>
              <p>{report.client.name} / {report.registrant.name}</p>
              {#if !report.quarter}<p class="career-warning">
                  Registration entry: naming a person here can describe expected lobbying activity,
                  not proof it occurred.
                </p>{:else if report.type.endsWith('Y')}<p class="career-warning">
                  The filing type explicitly reports no activity. Naming a person is not proof of
                  contacts during this period.
                </p>{/if}
              {#each reportObservations as observation}<div class="career-observation">
                  <h5>{report.activities[observation.activityIndex].label}</h5>
                  <p>
                    Source name: {observation.name} · Marked “new” by filer: {observation.reportedNew
                      ? 'yes'
                      : 'no'}
                  </p>
                  {#if observation.positionStatus === 'disclosed'}<blockquote>
                      {observation.coveredPosition}
                    </blockquote>{:else if observation.positionStatus === 'reported_none'}<p
                      class="career-warning"
                    >
                      Source covered-position field: “{observation.coveredPosition}”. This is a
                      filer statement, not an independent check of past employment.
                    </p>{:else}<p class="career-warning">
                      Covered-position field is blank in this filing. Earlier disclosures are
                      retained above; blank does not mean no government history.
                    </p>{/if}
                  <small>Activity {observation.activityIndex + 1} · {observation.id}</small>
                </div>
              {/each}
              <a href={report.source.url} target="_blank" rel="noreferrer"
                >Open original career-source filing ↗</a
              >
              {#if data.agendaLinks.includes(report.id)}<a
                  class="career-agenda-link"
                  href={`${base}/records/lobbying/?filing=${report.id}`}
                  >Same verified filing in Washington Agenda ↗</a
                >{:else}<p class="career-note">
                  No identical UUID-and-record-hash match in the current Washington Agenda
                  collection. The original source remains available.
                </p>{/if}
              <p class="career-source">
                Filing {report.id}<br />Raw record SHA-256: {report.source.recordHash}
              </p>
            </section>{:else if params.get('source') || params.get('filing')}<p role="status">
              That filing does not name this source-person ID in the captured observations.
            </p>{/if}
        </article>{/key}
    {:else if params.get('lobbyist')}<p role="status">
        That source-person ID is not in this capture.
      </p>{/if}
    <div class="career-cards">
      {#each people.slice(0, limit) as person (person.id)}<button
          class="career-card"
          disabled={!ready}
          onclick={() => navigate({ lobbyist: String(person.id), source: null })}
          ><span class="career-card-id">Source ID {person.id}</span><strong
            >{person.names[0]}</strong
          >
          <p>
            {person.positions[0] ?? 'No previous-position description in the collected filings.'}
          </p>
          <small
            >{person.reports.length} matching filings · {new Set(
              person.reports.map((f) => `${f.client.id}:${f.registrant.id}`),
            ).size} client/registrant relationship(s)</small
          ><span class="career-arrow" aria-hidden="true">↗</span></button
        >{:else}<div class="career-empty">
          <h3>No matching career records</h3>
          <p>
            No match in this selected capture does not establish an absence of lobbying or
            government service.
          </p>
          <button
            onclick={() =>
              navigate({
                q: null,
                client: null,
                state: null,
                year: null,
                filing: null,
                source: null,
                lobbyist: null,
                positions: null,
              })}>Clear career filters</button
          >
        </div>{/each}
    </div>
    {#if people.length > limit}<button onclick={() => (limit += 24)}>Show 24 more people</button
      >{/if}
    <details class="career-methods">
      <summary>What these connections do—and do not—mean</summary>
      <p>
        The filings report previous covered government positions, but do not necessarily repeat them
        in later reports for the same client. We retain each exact field and its source activity;
        blanks do not erase earlier statements. Conflicting or revised descriptions remain separate.
      </p>
      <p>
        Grouping uses LDA person IDs, not matching names. Different IDs are not merged, even if the
        names look alike. A source ID is not an independently verified lifetime identity.
        Client/registrant IDs stay distinct; intermediaries and corporate families are not
        collapsed.
      </p>
      <p>
        The timeline orders filing postings. Registration may describe expected activity; quarterly
        reports and amendments preserve their original type. Neither a posting nor a filer’s “new”
        flag supplies an exact employment or career-transition date. The government dates in the
        quoted text are not parsed into invented precise events.
      </p>
      <p>
        Map counts are distinct source-person IDs associated with reported client states, not home
        addresses, government-office locations, meetings or a measure of influence. One person may
        appear in more than one client state. Client state is metadata as retrieved, not verified
        historical geography.
      </p>
      <p>
        Coverage is all pages for the configured client IDs and filing years, not all of a person’s
        clients, earlier registrations or career. Included client records:
      </p>
      <ul>
        {#each dataset.coverage as c}<li>
            Client {c.clientId} · {c.year}: {c.count} filings
          </li>{/each}
      </ul>
      <p>
        Capture changes: {dataset.changes.added.length} added observations, {dataset.changes.updated
          .length} changed, {dataset.changes.notReturned.length} no longer returned. These are source-observation
        changes, not new jobs, departures or exonerations.
      </p>
      <a
        href={`${base}/data/revolving/releases/${data.revolving!.manifest.release}/data.json`}
        download>Download career evidence dataset</a
      >
      <p>
        <a
          href="https://lobbyingdisclosure.house.gov/ldaguidance.pdf"
          target="_blank"
          rel="noreferrer">Official disclosure guidance ↗</a
        >
      </p>
    </details>
    <footer>
      <p>{dataset.sourceNotice}</p>
      <p>LDA.gov · Retrieved {dataset.observedAt} · {data.revolving!.manifest.release}</p>
    </footer>
  {/if}
</div>

<style>
  .career-page {
    --ink: #293f3e;
    --accent: #517e78;
    color: var(--ink);
  }
  .career-page a {
    color: #34675f;
    text-underline-offset: 4px;
  }
  .career-kicker {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    padding-bottom: 18px;
    border-bottom: 1px solid #cddedb;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.3px;
  }
  .career-page header {
    padding: 30px 0;
  }
  .career-page h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(52px, 6vw, 84px);
    line-height: 0.96;
    letter-spacing: -1px;
    margin: 12px 0 20px;
  }
  .career-page h2 em {
    font-style: normal;
    color: var(--accent);
  }
  .career-page header > p:last-child {
    font-size: 14px;
    line-height: 1.8;
    max-width: 580px;
  }
  .career-scope {
    padding: 20px;
    border-left: 3px solid var(--accent);
    background: #edf5f2;
  }
  .career-scope strong {
    font-size: 14px;
  }
  .career-scope p,
  .career-note {
    font-size: 12px;
    line-height: 1.8;
    color: #617e78;
  }
  .career-scope p {
    margin-bottom: 0;
  }
  .career-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 25px 0;
  }
  .career-wide {
    grid-column: 1/-1;
  }
  .career-filters label {
    display: grid;
    gap: 8px;
    font-size: 11px;
  }
  .career-filters :is(input, select) {
    min-width: 0;
    width: 100%;
    border: 1px solid #bed3cd;
    border-radius: 5px;
    padding: 12px;
    background: #fff;
    color: var(--ink);
    font: inherit;
    font-size: 12px;
  }
  .career-page button {
    min-height: 42px;
    font: inherit;
    color: var(--ink);
    border: 1px solid #c3d6d0;
    border-radius: 6px;
    background: #fff;
    padding: 11px 14px;
    cursor: pointer;
  }
  .career-page button:disabled {
    cursor: wait;
    opacity: 0.6;
  }
  .career-count {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 25px 0;
  }
  .career-filter-note {
    font-size: 12px;
    background: #eef4f2;
    padding: 15px;
    overflow-wrap: anywhere;
  }
  .career-filter-note button {
    display: block;
    margin-top: 10px;
  }
  .career-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .career-card {
    position: relative;
    text-align: left;
    padding: 22px !important;
    transition:
      transform 0.18s,
      border-color 0.18s,
      box-shadow 0.18s;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .career-card:hover {
    transform: translateY(-2px);
    border-color: #719a8f;
    box-shadow: 0 6px 20px #1e514511;
  }
  .career-card-id {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #638f82;
  }
  .career-card strong {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 26px;
  }
  .career-card p {
    font-size: 12px;
    line-height: 1.7;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .career-card small {
    font-size: 10px;
    color: #6b817a;
    margin-top: auto;
    line-height: 1.7;
  }
  .career-arrow {
    position: absolute;
    right: 16px;
    top: 16px;
  }
  .career-detail {
    background: #f6faf8;
    border: 1px solid #bed5cc;
    border-top: 4px solid var(--accent);
    border-radius: 8px;
    padding: 25px;
    margin: 25px 0;
    overflow-wrap: anywhere;
  }
  .career-close {
    float: right;
    font-size: 12px !important;
  }
  .career-detail > h3 {
    clear: both;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 38px;
    margin: 22px 0 10px;
  }
  .career-connection {
    display: grid;
    grid-template-columns: 1fr 34px 1fr;
    margin: 28px 0;
  }
  .career-step {
    font-size: 10px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: #518774;
  }
  .career-connection h4,
  .career-subheading,
  .career-report h4 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 27px;
    margin: 12px 0 18px;
  }
  .career-position,
  .career-client {
    background: #fff;
    border: 1px solid #d1e0da;
    border-radius: 5px;
    padding: 16px;
    margin-bottom: 12px;
  }
  .career-position blockquote,
  .career-observation blockquote {
    font-size: 12px;
    line-height: 1.8;
    white-space: pre-wrap;
    margin: 0 0 15px;
  }
  .career-position small,
  .career-client small {
    display: block;
    font-size: 10px;
    line-height: 1.8;
    color: #6a8179;
  }
  .career-position a {
    font-size: 11px;
    display: block;
    margin-bottom: 10px;
  }
  .career-client strong {
    font-size: 14px;
  }
  .career-client p {
    font-size: 12px;
    line-height: 1.8;
  }
  .career-connector {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: #75a491;
  }
  .career-connector span {
    height: 1px;
    width: 6px;
    background: #9bbbaf;
  }
  .career-timeline {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 14px;
    margin: 15px 0 25px;
  }
  .career-timeline button {
    min-width: 190px;
    max-width: 230px;
    flex-shrink: 0;
    text-align: left;
    display: grid;
    gap: 8px;
    font-size: 11px;
  }
  .career-timeline time {
    font-size: 10px;
    color: #719184;
    letter-spacing: 1px;
  }
  .career-timeline small {
    font-size: 10px;
    line-height: 1.6;
  }
  .career-timeline button[aria-pressed='true'] {
    border-color: #527f6f;
    background: #e5f1eb;
  }
  .career-report {
    padding: 20px;
    background: white;
    border: 1px solid #c5d9d0;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.8;
  }
  .career-observation {
    border-top: 1px solid #d5e3dd;
    padding: 15px 0;
  }
  .career-observation h5 {
    font-size: 14px;
    margin: 0 0 10px;
  }
  .career-observation small {
    font-size: 10px;
    color: #6c867a;
  }
  .career-warning {
    border-left: 3px solid #baa15b;
    background: #fcf8ec;
    padding: 14px;
    font-size: 12px;
    line-height: 1.8;
  }
  .career-agenda-link {
    display: block;
    margin-top: 15px;
  }
  .career-source {
    font-size: 10px;
    overflow-wrap: anywhere;
    color: #739182;
  }
  .career-methods {
    padding: 22px 0;
    margin: 28px 0;
    border-top: 1px solid #ccdfd5;
    border-bottom: 1px solid #ccdfd5;
    font-size: 12px;
    line-height: 1.8;
  }
  .career-methods summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 30px;
  }
  .career-page footer {
    font-size: 10px;
    line-height: 1.8;
    color: #6f887c;
    overflow-wrap: anywhere;
  }
  .career-empty {
    grid-column: 1/-1;
    border: 1px dashed #aac7b9;
    padding: 24px;
    font-size: 13px;
    line-height: 1.8;
  }
  .career-page :is(a, button, input, select, summary):focus-visible {
    outline: 3px solid #569b82;
    outline-offset: 3px;
  }
  @media (max-width: 720px) {
    .career-cards,
    .career-filters,
    .career-connection {
      grid-template-columns: 1fr;
    }
    .career-wide {
      grid-column: auto;
    }
    .career-detail {
      padding: 16px;
    }
    .career-close {
      float: none;
    }
    .career-detail > h3 {
      font-size: 31px;
    }
    .career-connector {
      height: 40px;
      transform: rotate(90deg);
    }
    .career-kicker {
      font-size: 9px;
    }
    .career-report {
      padding: 15px;
    }
    .career-timeline button {
      min-width: 175px;
    }
    .career-card {
      padding: 18px !important;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .career-card {
      transition: none;
    }
    .career-card:hover {
      transform: none;
    }
  }
</style>
