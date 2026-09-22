<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    filterEcho,
    echoInvalidWindow,
    echoPrograms,
    echoProgramNames,
    echoStatus,
    echoYearRows,
    echoFacilityUrl,
    type EchoDetail,
  } from '$lib/civic/echo';
  import { createEchoReader } from '$lib/civic/echo-repository';
  let { data } = $props();
  let ready = $state(false),
    reduced = $state(true),
    limit = $state(20),
    eventLimit = $state(30),
    retry = $state(0);
  let detail = $state.raw<EchoDetail | null>(null),
    detailError = $state(''),
    loading = $state(false),
    detailElement: HTMLElement | undefined = $state();
  let sourceTablesOpen = $state(false);
  const reader = createEchoReader(fetch, base);
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.echo?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filterKey = $derived(
    JSON.stringify(['q', 'state', 'program', 'repeated'].map((k) => [k, params.get(k) ?? ''])),
  );
  const filtered = $derived(
    dataset ? filterEcho(dataset, new URLSearchParams(JSON.parse(filterKey))) : [],
  );
  const selected = $derived(dataset?.facilities.find((f) => f.id === params.get('facility')));
  const program = $derived(params.get('program') ?? '');
  const repeated = $derived(
    filtered.filter((f) =>
      f.programs.some(
        (p) =>
          (!program || p.program === program) && p.quartersInNC !== null && p.quartersInNC >= 2,
      ),
    ).length,
  );
  const years = $derived(echoYearRows(detail?.events ?? [], program));
  const maxYear = $derived(
    Math.max(1, ...years.map((y) => Math.max(y.inspection, y.informal, y.formal))),
  );
  const from = $derived(params.get('from') ?? ''),
    through = $derived(params.get('through') ?? '');
  const invalidWindow = $derived(echoInvalidWindow(from, through));
  const events = $derived(
    invalidWindow
      ? []
      : (detail?.events ?? []).filter(
          (e) =>
            (!program || e.program === program) &&
            (!params.get('source') || e.sourceId === params.get('source')) &&
            (!params.get('kind') || e.kind === params.get('kind')) &&
            (!from || (!!e.date && e.date >= from)) &&
            (!through || (!!e.date && e.date <= through)),
        ),
  );
  const quarters = $derived(
    (detail?.quarters ?? []).filter((q) => !program || q.program === program),
  );
  const selectedQuarter = $derived(
    quarters
      .find((q) => q.sourceId === params.get('source'))
      ?.cells.find((c) => c.from === from && c.through === through),
  );
  $effect(() => {
    void filterKey;
    limit = 20;
  });
  $effect(() => {
    void from;
    void through;
    void program;
    void params.get('kind');
    void params.get('source');
    eventLimit = 30;
  });
  $effect(() => {
    const snapshot = data.echo,
      id = selected?.id;
    void retry;
    detail = null;
    sourceTablesOpen = false;
    loading = false;
    detailError = '';
    if (!browser || !snapshot || !id) return;
    const controller = new AbortController();
    let active = true;
    loading = true;
    reader(snapshot, id, controller.signal)
      .then((value) => {
        if (active) detail = value;
      })
      .catch(() => {
        if (active)
          detailError = 'The facility evidence could not load or verify. Retry to try again.';
      })
      .finally(() => {
        if (active) loading = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  });
  async function navigate(changes: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [k, v] of Object.entries(changes))
      v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
    await goto(url, { noScroll: true, keepFocus: true });
    if (changes.facility) {
      await tick();
      detailElement?.focus({ preventScroll: true });
      detailElement?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    }
  }
  function search(e: SubmitEvent) {
    e.preventDefault();
    navigate({
      q: String(new FormData(e.currentTarget as HTMLFormElement).get('q') ?? ''),
      facility: null,
    });
  }
  const money = (cents: number | null) =>
    cents === null
      ? 'Not reported'
      : (cents / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        });
  const programName = (code: string) =>
    echoProgramNames[code as keyof typeof echoProgramNames] ?? code;
  const eventName = {
    inspection: 'Monitoring / inspection',
    informal: 'Informal response',
    formal: 'Formal action',
  };
  const clearWindow = { from: null, through: null, source: null, kind: null };
</script>

<svelte:head
  ><title>Violations vs. Enforcement · Louder Than Words</title><meta
    name="description"
    content="Read EPA facility compliance histories alongside dated inspections, informal responses, formal actions and reported penalties. Reporting gaps remain explicit."
  /></svelte:head
>
<div class="evidence-page enforcement-page">
  <div class="kicker">
    <span>32 / Violations vs. enforcement</span><span>Follow the recorded response</span>
  </div>
  <header>
    <p class="eyebrow">A finding is one record. A response is another.</p>
    <h2>What happened<br /><em>after the finding?</em></h2>
    <p>
      Put repeated recorded noncompliance beside inspections and enforcement actions. Follow the
      dates, open the source, and keep the gaps in view.
    </p>
  </header>
  {#if data.echoError}<p role="alert">{data.echoError}</p>{/if}
  {#if dataset && data.echo}
    <div class="capture">
      <span></span>EPA ECHO · collection started {dataset.observedAt.slice(0, 10)}
    </div>
    <details class="coverage">
      <summary
        >{dataset.facilities.length} facilities · {dataset.plan.title} · scope & limitations</summary
      >
      <p>{dataset.plan.selection}</p>
      <ul>
        {#each dataset.discoveries as discovery}<li>
            {discovery.query.city}, {discovery.query.state} · NAICS {discovery.query.naics} · {discovery.rows}
            source results
          </li>{/each}
      </ul>
      <p>
        Discovery can match a linked program’s address or industry classification. The main display
        uses the exact FRS identity when available; program-only identities are explicitly labeled.
        Matching names do not establish a common owner.
      </p>
      <p>
        EPA records include reported and alleged noncompliance, not necessarily a final
        adjudication. Missing entries do not prove that regulators did nothing. States and programs
        differ in reporting requirements, refresh dates and coverage. This is not a fair ranking of
        companies, regulators or states.
      </p>
      <p>
        Prior facilities remain refreshed even if they no longer match an active-facility query. {dataset
          .changes.baselineAt
          ? `${dataset.changes.added.length} added and ${dataset.changes.updated.length} source projections changed since ${dataset.changes.baselineAt.slice(0, 10)}.`
          : 'First capture; no refresh comparison yet.'}
        {dataset.changes.outsideDiscovery.length} retained records are outside current discovery. An observed
        source change is not automatically a new violation.
      </p>
      <a href={`${base}/data/echo/releases/${data.echo.manifest.release}/data.json`} download
        >Download collection index</a
      >
      · <a href={`${base}/data/echo/manifest.json`} download>Manifest + evidence hashes</a>
    </details>
    <form class="search" onsubmit={search}>
      <label for="echo-search">Find a facility, city or program ID</label>
      <div>
        <input
          id="echo-search"
          name="q"
          value={params.get('q') ?? ''}
          placeholder="Try Equistar or Richmond"
        /><button disabled={!ready}>Search facilities</button>
      </div>
    </form>
    <div class="filters">
      <label
        >Environmental program<select
          aria-label="Environmental program"
          disabled={!ready}
          value={program}
          onchange={(e) => navigate({ program: e.currentTarget.value, ...clearWindow })}
          ><option value="">All reported programs</option>{#each echoPrograms as code}<option
              value={code}>{code} · {programName(code)}</option
            >{/each}</select
        ></label
      ><label class="checkbox"
        ><input
          type="checkbox"
          checked={params.get('repeated') === '1'}
          disabled={!ready}
          onchange={(e) =>
            navigate({ repeated: e.currentTarget.checked ? '1' : null, facility: null })}
        />At least two reported noncompliant quarters in one source</label
      >
    </div>
    <div class="overview">
      <div><strong>{filtered.length}</strong><span>facilities in view</span></div>
      <div>
        <strong>{repeated}</strong><span
          >with ≥2 reported noncompliant quarters in one program source</span
        >
      </div>
    </div>
    <p class="small">
      A recurring status can reflect one unresolved issue across quarters—not separate new
      violations. Programs use different date windows. Unknown counts are not zero.
    </p>
    {#if params.get('facility') && !selected}<p role="status">
        That facility is not in this captured collection.
      </p>{/if}
    {#if selected}<section
        class="echo-detail"
        bind:this={detailElement}
        tabindex="-1"
        aria-label="EPA facility evidence"
        in:fly={{ y: 12, duration: reduced ? 0 : 220 }}
      >
        <div class="detail-top">
          <span class="eyebrow">Read the source record</span><button
            onclick={() => navigate({ facility: null, ...clearWindow })}>Close facility ×</button
          >
        </div>
        <h3>{selected.name}</h3>
        <p>{selected.city}, {selected.state} · {selected.identitySystem} ID {selected.id}</p>
        {#if !filtered.some((f) => f.id === selected.id)}<p role="status">
            This linked facility is outside the current list filters. Its evidence remains open; map
            points and counts follow the filters.
          </p>{/if}
        {#if loading}<p role="status">Verifying the detailed EPA evidence…</p>{/if}
        {#if detailError}<p role="alert">{detailError}</p>
          <button onclick={() => retry++}>Retry EPA evidence</button>{/if}
        {#if detail}
          <p class="small">
            {selected.street} · {selected.zip}. Coordinates: {selected.coordinateMethod ??
              'method not reported'}; reported accuracy: {selected.coordinateAccuracy ?? 'unknown'} meters.
            Not a pollution plume, exposure boundary, or water-service area.
          </p>
          <div class="notice">
            <strong>The dates are not interchangeable.</strong>
            <p>
              Compliance quarters, inspections and formal-action tables have separate reporting
              windows. In this report, requesting longer history does not extend every table.
              Amounts may apply to a multi-facility case and can recur under several permits. We do
              not sum them into a facility penalty total.
            </p>
          </div>
          <details class="periods">
            <summary>Source refresh dates and each table’s coverage</summary>
            <p>Report fetched {detail.source.fetchedAt}. Individual EPA systems:</p>
            <ul>
              {#each detail.extractDates as extract}<li>
                  {extract.system}: {extract.date ?? 'not reported'}
                </li>{/each}
            </ul>
            <div class="table-scroll">
              <table>
                <thead
                  ><tr><th>Source table</th><th>Program</th><th>From</th><th>Through</th></tr
                  ></thead
                ><tbody
                  >{#each detail.periods as period}<tr
                      ><td>{period.section}</td><td>{period.program}</td><td
                        >{period.from ?? 'Unknown'}</td
                      ><td>{period.through ?? 'Unknown'}</td></tr
                    >{/each}</tbody
                >
              </table>
            </div>
          </details>
          <div class="section-title">
            <span class="eyebrow">01 / Recorded compliance</span>
            <h4>Read across time, not just a red flag.</h4>
          </div>
          <p class="small">
            Select a quarter to inspect dated response records for that same program ID and window.
            Absence in that window does not prove no response; a response may occur later or be
            missing from the federal record.
          </p>
          <div class="legend">
            <span class="none">No violation identified</span><span class="violation"
              >Violation / noncompliance</span
            ><span class="priority">Priority / significant status</span><span class="unknown"
              >Unknown / undetermined</span
            >
          </div>
          <div class="quarter-series">
            {#each quarters as series}<article>
                <div class="quarter-heading">
                  <strong>{series.program} · {series.sourceId}</strong><span
                    >{selected.programs.find(
                      (p) => p.program === series.program && p.sourceId === series.sourceId,
                    )?.quartersInNC ?? 'Unknown'} reported NC quarters</span
                  >
                </div>
                {#if series.program === 'SDWA'}<a
                    class="small"
                    href={`${base}/records/water/?system=${series.sourceId}`}
                    >Look up this exact ID in Water Records →</a
                  >{/if}
                <div class="quarters">
                  {#each series.cells as cell}<button
                      class={`quarter ${echoStatus(cell.status)}`}
                      class:chosen={from === cell.from &&
                        through === cell.through &&
                        params.get('source') === series.sourceId}
                      aria-label={`${series.program} ${series.sourceId}, ${cell.from} to ${cell.through}: ${cell.status ?? 'No information'}${cell.additional ? ', additional source quarter' : ''}`}
                      title={`${cell.from} — ${cell.through}: ${cell.status ?? 'No information'}`}
                      onclick={() =>
                        navigate({
                          program: series.program,
                          source: series.sourceId,
                          from: cell.from,
                          through: cell.through,
                          kind: null,
                        })}
                      ><span>{cell.from.slice(2, 4)}</span><strong
                        >Q{Math.ceil(Number(cell.from.slice(5, 7)) / 3)}</strong
                      >{#if cell.additional}<small>+</small>{/if}</button
                    >{/each}
                </div>
                <p class="small">
                  {series.cells[0]?.from} — {series.cells.at(-1)?.through}. {#if series.cells.some((c) => c.additional)}“+”
                    marks the additional source quarter; CWA’s extra quarter is provisional, not a
                    finalized compliance determination.{/if}
                  {#if series.cells.some((c) => c.through > (detail?.source.fetchedAt.slice(0, 10) ?? ''))}The
                    latest period is still open at capture.{/if}
                </p>
              </article>{/each}
          </div>
          {#if !quarters.length}<p class="empty">
              No quarterly status series returned for this selection. This is not a finding of
              compliance.
            </p>{/if}
          <div class="section-title">
            <span class="eyebrow">02 / The response record</span>
            <h4>Monitoring. Notices. Formal actions.</h4>
          </div>
          <p class="small">
            Source entries per calendar year, not distinct cases or enforcement rates. Colored bars
            count rows returned in each table’s own coverage window; blank years may be outside
            coverage.
          </p>
          <div class="year-chart">
            {#each years as year}<button
                aria-label={`Inspect EPA response records in ${year.year}`}
                onclick={() =>
                  navigate({
                    from: `${year.year}-01-01`,
                    through: `${year.year}-12-31`,
                    source: null,
                    kind: null,
                  })}
                ><strong>{year.year}</strong>
                <div>
                  {#each ['inspection', 'informal', 'formal'] as kind}<span
                      class={kind}
                      style={`width:${Math.max(1, (year[kind as 'inspection' | 'informal' | 'formal'] / maxYear) * 100)}%;opacity:${year[kind as 'inspection' | 'informal' | 'formal'] ? 1 : 0.15}`}
                      title={`${eventName[kind as keyof typeof eventName]}: ${year[kind as 'inspection' | 'informal' | 'formal']}`}
                    ></span>{/each}
                </div>
                <small>{year.inspection} / {year.informal} / {year.formal}</small></button
              >{/each}
          </div>
          <p class="small">
            Blue: monitoring · amber: informal · terracotta: formal. Counts follow that order.
          </p>
          <div class="event-controls">
            <label
              >Response entries<select
                aria-label="Response entry type"
                value={params.get('kind') ?? ''}
                onchange={(e) => navigate({ kind: e.currentTarget.value })}
                ><option value="">All response types</option
                >{#each Object.entries(eventName) as [kind, label]}<option value={kind}
                    >{label}</option
                  >{/each}</select
              ></label
            ><button onclick={() => navigate(clearWindow)}>Clear response window</button>
          </div>
          {#if from || through || params.get('source')}<p class="window">
              {from || 'Any start'} — {through || 'Any end'} · {params.get('source') ??
                'All program IDs'} · {events.length} entries
            </p>{/if}
          {#if invalidWindow}<p role="alert">
              This date window is invalid. Clear it to inspect the source history.
            </p>{/if}
          {#if selectedQuarter}<p class="window" role="status">
              Selected quarter’s reported status: <strong
                >{selectedQuarter.status ?? 'No information'}</strong
              >. These are same-window response records, not a determination that an action
              addressed this specific finding.
            </p>{/if}
          <ol class="event-list">
            {#each events.slice(0, eventLimit) as event (event.id)}<li class={event.kind}>
                <div class="event-date">
                  <time>{event.date ?? 'Date not reported'}</time><span
                    >{eventName[event.kind]}</span
                  >
                </div>
                <h5>{event.type}</h5>
                <p>{event.program} · {event.sourceId} · lead: {event.agency ?? 'not reported'}</p>
                {#if event.kind === 'formal'}<p class="penalty">
                    Reported penalty: <strong>{money(event.penaltyCents)}</strong><small
                      >Source action amount—not necessarily unique to this permit or facility.</small
                    >
                  </p>{/if}{#if event.finding}<p>Source finding: {event.finding}</p>{/if}
                <details>
                  <summary>Exact source fields · {event.locator}</summary>
                  <dl>
                    {#each Object.entries(event.fields) as [key, value]}<dt>{key}</dt>
                      <dd>
                        {value === null
                          ? 'Not reported'
                          : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value)}
                      </dd>{/each}
                  </dl>
                </details>
              </li>{/each}
          </ol>
          {#if !events.length && !invalidWindow}<p class="empty" role="status">
              No response entries returned for these filters. Check the source windows before
              interpreting a gap.
            </p>{/if}{#if events.length > eventLimit}<button onclick={() => (eventLimit += 30)}
              >Show 30 more response entries</button
            >{/if}
          <details class="source-tables" bind:open={sourceTablesOpen}>
            <summary>Underlying violation details and separate case history</summary>
            <p>
              The same case can appear under several permits. Case history and the response timeline
              are overlapping views, not additive totals. Original fields retain dates,
              case/activity IDs, settlement amounts and source-specific violation details.
            </p>
            {#if sourceTablesOpen}{#each Object.entries(detail.evidence) as [section, fields]}<details
                >
                  <summary>{section}</summary>
                  <pre>{JSON.stringify(fields, null, 2)}</pre>
                </details>{/each}{/if}
          </details>
          <div class="connections">
            <a href={echoFacilityUrl(selected.id)} target="_blank" rel="noreferrer"
              >Open this exact EPA facility report ↗</a
            ><a href={detail.source.url} target="_blank" rel="noreferrer"
              >Open live EPA source JSON ↗</a
            ><a
              href={`${base}/data/echo/releases/${data.echo.manifest.release}/facilities/${selected.id.toLowerCase()}.json`}
              download>Download captured facility evidence</a
            ><a href={`${base}/records/rules/`}>Explore federal environmental rule context →</a><a
              href={`${base}/records/paycheck/?state=${selected.state}`}
              >Explore this state’s economic context →</a
            >
            <p>
              These other collections are context, not proof that a particular rule applies to this
              facility or that its compliance record caused an economic change. Similar names are
              not used to join companies.
            </p>
            <p>Original report SHA-256: <code>{detail.source.hash}</code></p>
          </div>
        {/if}
      </section>{/if}
    <div class="facility-list" aria-label="Collected EPA facilities">
      {#each filtered.slice(0, limit) as facility (facility.id)}<button
          class="echo-card"
          disabled={!ready}
          class:selected={selected?.id === facility.id}
          onclick={() => navigate({ facility: facility.id, ...clearWindow })}
          ><div class="card-top"><span>{facility.city}, {facility.state}</span><span>↗</span></div>
          <h3>{facility.name}</h3>
          <p>
            {facility.identitySystem} · {facility.id}{facility.retained
              ? ' · retained outside current discovery'
              : ''}
          </p>
          <div class="programs">
            {#each facility.programs.filter((p) => !program || p.program === program) as p}<span
                ><strong>{p.program} {p.quartersInNC ?? '?'}</strong> NC quarters
                <small>{p.sourceId} · as of {p.asOf ?? 'unknown'}</small></span
              >{/each}
          </div>
          <div class="card-bottom">
            <span>{facility.inspectionRows} monitoring</span><span
              >{facility.informalRows} informal</span
            ><span>{facility.formalRows} formal</span>
          </div>
          <small
            >Returned source entries; different table windows. Latest dated entry: {facility.latestEvent ??
              'none returned'}.</small
          ></button
        >{/each}
    </div>
    {#if !filtered.length}<p class="empty" role="status">
        No facilities match this captured collection and filter. This does not mean a state has no
        violations.
      </p>{/if}
    {#if filtered.length > limit}<button onclick={() => (limit += 20)}
        >Show 20 more facilities</button
      >{/if}
    <footer>
      <a
        href="https://echo.epa.gov/help/reports/dfr-data-dictionary"
        target="_blank"
        rel="noreferrer">EPA data dictionary ↗</a
      >
      ·
      <a
        href="https://echo.epa.gov/resources/echo-data/known-data-problems"
        target="_blank"
        rel="noreferrer">Known reporting problems ↗</a
      >
      <p>
        Exact source records, no misconduct score. Neither an absent record nor a sequence of dates
        establishes that an agency ignored a problem.
      </p>
    </footer>
  {/if}
</div>

<style>
  .enforcement-page {
    --ink: #4c4238;
    --muted: #817666;
    --line: #e4dccc;
    --wash: #f7f4ed;
    color: var(--ink);
  }
  .kicker,
  .detail-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
  }
  header {
    padding: 28px 0 12px;
  }
  header h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(48px, 5vw, 70px);
    line-height: 0.94;
    letter-spacing: -0.02em;
    margin: 12px 0 23px;
  }
  header em {
    font-style: normal;
    color: #a87949;
  }
  p {
    font-size: 13px;
    line-height: 1.7;
  }
  header > p:last-child {
    font-size: 15px;
    max-width: 540px;
  }
  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  .capture {
    display: flex;
    gap: 9px;
    align-items: center;
    font-size: 11px;
    margin: 20px 0;
  }
  .capture > span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #bc9567;
    box-shadow: 0 0 0 4px #f5eee1;
  }
  .coverage {
    border-block: 1px solid var(--line);
    padding: 16px 0;
    font-size: 12px;
    margin-bottom: 24px;
  }
  summary {
    cursor: pointer;
    line-height: 1.6;
  }
  a {
    color: #886238;
    text-underline-offset: 3px;
  }
  button,
  input,
  select {
    font: inherit;
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 11px;
    background: white;
    font-size: 12px;
  }
  button {
    cursor: pointer;
    transition:
      background 0.18s,
      border-color 0.18s,
      transform 0.18s;
  }
  button:hover {
    border-color: #bc946a;
    background: #f6efdf;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  label {
    display: block;
    font-size: 12px;
  }
  .search > div {
    display: flex;
    gap: 8px;
    margin-top: 7px;
  }
  .search input {
    min-width: 0;
    flex: 1;
  }
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: end;
    gap: 18px;
    margin: 18px 0;
  }
  select {
    display: block;
    width: 100%;
    margin-top: 7px;
  }
  .checkbox {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 11px;
    line-height: 1.5;
  }
  .checkbox input {
    accent-color: #ab7743;
  }
  .overview {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    margin: 24px 0 12px;
  }
  .overview > div {
    padding: 20px;
    background: var(--wash);
  }
  .overview strong {
    font-size: 36px;
    font-weight: 500;
    display: block;
  }
  .overview span {
    display: block;
    font-size: 11px;
    line-height: 1.5;
    max-width: 300px;
  }
  .small,
  small {
    font-size: 11px;
    line-height: 1.7;
    color: var(--muted);
  }
  .facility-list {
    display: grid;
    gap: 13px;
    margin: 28px 0;
  }
  .echo-card {
    text-align: left;
    padding: 22px;
    border-radius: 9px;
    background: #fff;
  }
  .echo-card:hover {
    transform: translateY(-2px);
  }
  .echo-card.selected {
    border-color: #a67b4c;
    background: #fbf6ec;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 10px;
    color: var(--muted);
  }
  h3 {
    font-size: 22px;
    line-height: 1.2;
    overflow-wrap: anywhere;
    margin: 12px 0;
  }
  .echo-card > p {
    font-size: 10px;
    color: var(--muted);
  }
  .programs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 0;
  }
  .programs > span {
    font-size: 10px;
    padding: 8px;
    background: #f3f0e9;
    border-radius: 4px;
  }
  .programs strong {
    font-weight: 600;
  }
  .programs small {
    display: block;
    font-size: 9px;
  }
  .card-bottom {
    border-top: 1px solid var(--line);
    padding-top: 13px;
    margin: 8px 0;
    display: flex;
    gap: 17px;
    font-size: 11px;
  }
  .echo-detail {
    background: #fcf9f2;
    border: 1px solid #d5bc9d;
    padding: 26px;
    border-radius: 10px;
    margin: 26px 0;
    scroll-margin-top: 15px;
    outline: none;
  }
  .echo-detail > h3 {
    font-size: 31px;
  }
  .notice {
    padding: 17px;
    border-left: 3px solid #bd945f;
    background: #f4ead6;
    margin: 20px 0;
    font-size: 13px;
  }
  .notice p {
    font-size: 12px;
    margin-bottom: 0;
  }
  .periods {
    font-size: 12px;
    padding: 15px 0;
    border-bottom: 1px solid var(--line);
  }
  .table-scroll {
    overflow-x: auto;
    margin: 12px 0;
  }
  table {
    border-collapse: collapse;
    font-size: 10px;
    min-width: 490px;
    width: 100%;
  }
  td,
  th {
    text-align: left;
    padding: 9px;
    border-bottom: 1px solid var(--line);
  }
  .section-title {
    margin: 28px 0 12px;
  }
  .section-title h4 {
    font-size: 22px;
    margin: 8px 0;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 15px 0;
  }
  .legend > span {
    font-size: 9px;
    border-radius: 3px;
    padding: 5px 7px;
  }
  .none {
    background: #dce9e9 !important;
    color: #426971;
  }
  .violation {
    background: #f1d79f !important;
    color: #754f16;
  }
  .priority {
    background: #dca080 !important;
    color: #653620;
  }
  .unknown {
    background: #e1e1dc !important;
    color: #62645d;
  }
  .inactive {
    background: #eeeae1 !important;
    color: #777167;
  }
  .quarter-series {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .quarter-series article {
    padding: 13px 0;
    border-bottom: 1px solid var(--line);
  }
  .quarter-heading {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px;
  }
  .quarter-heading > span {
    font-size: 10px;
  }
  .quarters {
    display: grid;
    grid-template-columns: repeat(13, minmax(44px, 1fr));
    overflow-x: auto;
    padding: 4px;
    gap: 4px;
    margin: 12px 0;
  }
  .quarter {
    padding: 7px 2px !important;
    border-radius: 3px;
    position: relative;
    border: 1px solid transparent;
    min-width: 0;
    min-height: 44px;
  }
  .quarter > span,
  .quarter > strong {
    display: block;
    font-size: 10px;
  }
  .quarter > span {
    font-size: 8px;
    opacity: 0.7;
  }
  .quarter > small {
    position: absolute;
    top: 0;
    right: 1px;
    font-size: 9px;
  }
  .quarter.chosen {
    outline: 2px solid #76592e;
    outline-offset: 2px;
  }
  .quarter-series article > p {
    margin-bottom: 0;
    font-size: 10px;
  }
  .year-chart {
    display: grid;
    gap: 5px;
  }
  .year-chart button {
    display: grid;
    grid-template-columns: 36px 1fr 78px;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: #fff;
    text-align: left;
    border: 0;
  }
  .year-chart strong {
    font-size: 10px;
    font-weight: 500;
  }
  .year-chart button > div {
    display: grid;
    gap: 3px;
  }
  .year-chart button > div > span {
    height: 5px;
    display: block;
    border-radius: 2px;
    transition: width 0.35s;
  }
  .year-chart .inspection {
    background: #749eaa;
  }
  .year-chart .informal {
    background: #d2b16d;
  }
  .year-chart .formal {
    background: #ba7758;
  }
  .year-chart small {
    font-size: 9px;
    text-align: right;
  }
  .event-controls {
    display: flex;
    gap: 15px;
    align-items: end;
    justify-content: space-between;
    margin: 22px 0;
  }
  .event-controls label {
    flex: 1;
  }
  .window {
    padding: 12px;
    background: #efe7d9;
    font-size: 11px;
  }
  .event-list {
    list-style: none;
    border-left: 1px solid #d4c8b5;
    margin: 22px 0;
    padding: 0 0 0 20px;
  }
  .event-list li {
    position: relative;
    padding: 0 0 25px;
  }
  .event-list li:before {
    content: '';
    position: absolute;
    left: -25px;
    top: 3px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #749eaa;
  }
  .event-list .informal:before {
    background: #d2b16d;
  }
  .event-list .formal:before {
    background: #ba7758;
  }
  .event-date {
    display: flex;
    gap: 12px;
    font-size: 10px;
  }
  .event-date > span {
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
  }
  h5 {
    font-size: 16px;
    margin: 10px 0;
  }
  .event-list p {
    font-size: 12px;
    margin: 7px 0;
  }
  .penalty small {
    display: block;
    font-size: 10px;
  }
  .event-list details {
    font-size: 10px;
    line-height: 1.6;
    margin-top: 8px;
  }
  .event-list dl {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 7px;
    background: white;
    padding: 12px;
  }
  .event-list dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .event-list dt {
    color: var(--muted);
  }
  .source-tables {
    border-block: 1px solid var(--line);
    padding: 15px 0;
    font-size: 12px;
    margin: 25px 0;
  }
  .source-tables details {
    padding: 8px 0;
    font-size: 11px;
  }
  .source-tables pre {
    overflow: auto;
    max-height: 350px;
    background: white;
    font-size: 10px;
    padding: 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .connections a {
    display: block;
    font-size: 12px;
    line-height: 2.1;
  }
  .connections p {
    font-size: 11px;
  }
  .connections code {
    overflow-wrap: anywhere;
    font-size: 10px;
  }
  .empty {
    border: 1px dashed #cbbba2;
    padding: 18px;
    font-size: 12px;
  }
  .enforcement-page footer {
    font-size: 11px;
    margin-top: 28px;
    color: var(--muted);
  }
  footer p {
    font-size: 11px;
  }
  .enforcement-page :is(button, a, input, select, summary):focus-visible {
    outline: 3px solid #a7804e;
    outline-offset: 3px;
  }
  @media (max-width: 720px) {
    .kicker > span:last-child {
      display: none;
    }
    .filters {
      grid-template-columns: 1fr;
    }
    .echo-detail {
      padding: 17px;
    }
    .echo-detail > h3 {
      font-size: 27px;
    }
    .echo-card {
      padding: 17px;
    }
    .quarter-heading {
      display: block;
    }
    .quarter-heading > span {
      display: block;
      margin-top: 5px;
    }
    .quarters {
      gap: 3px;
    }
    .quarter > span {
      font-size: 10px;
    }
    .quarter > strong {
      font-size: 12px;
    }
    .card-bottom {
      gap: 10px;
      font-size: 10px;
    }
    .event-date {
      flex-direction: column;
      gap: 4px;
    }
    .event-controls {
      align-items: stretch;
      flex-direction: column;
    }
    .event-list dl {
      grid-template-columns: 1fr;
    }
    .event-list dd {
      margin-bottom: 8px;
    }
    .detail-top {
      align-items: flex-start;
    }
    .detail-top > button {
      flex-shrink: 0;
    }
    .overview > div {
      padding: 15px;
    }
    .search > div {
      flex-wrap: wrap;
    }
    .search input {
      flex-basis: 150px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button,
    .year-chart button > div > span {
      transition: none;
    }
    .echo-card:hover {
      transform: none;
    }
  }
</style>
