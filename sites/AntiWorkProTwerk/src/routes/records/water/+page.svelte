<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    filterWater,
    waterKinds,
    waterKindNames,
    waterKindHelp,
    waterStatusHelp,
    waterYears,
    waterSystemUrl,
    type WaterDetail,
  } from '$lib/civic/water';
  import { createWaterReader } from '$lib/civic/water-repository';
  import { loadEcho } from '$lib/civic/echo-repository';
  import type { EchoData } from '$lib/civic/echo';
  let { data } = $props();
  let ready = $state(false),
    reduced = $state(true),
    limit = $state(24),
    violationLimit = $state(15),
    retry = $state(0),
    loading = $state(false),
    error = $state(''),
    openSource = $state<string | null>(null);
  let detail = $state.raw<WaterDetail | null>(null),
    echo = $state.raw<EchoData | null>(null),
    echoError = $state(''),
    echoTried = $state(false),
    detailElement: HTMLElement | undefined = $state();
  const reader = createWaterReader(fetch, base);
  let standaloneLimit = $state(15);
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.water?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filterKey = $derived(
    JSON.stringify(['q', 'state', 'type', 'kind'].map((k) => [k, params.get(k) ?? ''])),
  );
  const filtered = $derived(
    dataset ? filterWater(dataset, new URLSearchParams(JSON.parse(filterKey))) : [],
  );
  const selected = $derived(dataset?.systems.find((s) => s.id === params.get('system'))),
    kind = $derived(params.get('kind') ?? '');
  const violations = $derived(
    (detail?.violations ?? []).filter(
      (v) =>
        (!kind || v.kind === kind) &&
        (!params.get('year') ||
          (v.intervalIssue ? 'Unknown' : (v.from?.slice(0, 4) ?? 'Unknown')) ===
            params.get('year')) &&
        (!params.get('status') || v.status === params.get('status')),
    ),
  );
  const years = $derived(waterYears(detail?.violations ?? [])),
    maxYear = $derived(Math.max(1, ...years.map((y) => y.total)));
  const related = $derived(
    selected
      ? (echo?.facilities.filter((f) =>
          f.programs.some((p) => p.program === 'SDWA' && p.sourceId === selected.id),
        ) ?? [])
      : [],
  );
  $effect(() => {
    void filterKey;
    limit = 24;
  });
  $effect(() => {
    void kind;
    void params.get('year');
    void params.get('status');
    violationLimit = 15;
    openSource = null;
    standaloneLimit = 15;
  });
  $effect(() => {
    const bundle = data.water,
      id = selected?.id;
    void retry;
    detail = null;
    error = '';
    loading = false;
    openSource = null;
    if (!browser || !bundle || !id) return;
    let active = true;
    const controller = new AbortController();
    loading = true;
    reader(bundle, id, controller.signal)
      .then((value) => {
        if (active) detail = value;
      })
      .catch(() => {
        if (active) error = 'The system evidence could not load or verify. Retry to try again.';
      })
      .finally(() => {
        if (active) loading = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  });
  $effect(() => {
    if (browser && selected && !echoTried) {
      echoTried = true;
      loadEcho(fetch, base)
        .then((bundle) => (echo = bundle.data))
        .catch(
          () =>
            (echoError =
              'The related EPA collection is unavailable; the water record is unaffected.'),
        );
    }
  });
  const clearHistory = { year: null, status: null };
  async function navigate(changes: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [k, v] of Object.entries(changes))
      v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
    await goto(url, { noScroll: true, keepFocus: true });
    if (changes.system) {
      await tick();
      detailElement?.focus({ preventScroll: true });
      detailElement?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    }
  }
  function search(e: SubmitEvent) {
    e.preventDefault();
    navigate({
      q: String(new FormData(e.currentTarget as HTMLFormElement).get('q') ?? ''),
      system: null,
      ...clearHistory,
    });
  }
</script>

<svelte:head
  ><title>Your Water System’s Record · Louder Than Words</title><meta
    name="description"
    content="Follow EPA drinking-water compliance records. Distinguish reported contaminant limits, treatment requirements, monitoring and reporting—with exact sources and historical limits."
  /></svelte:head
>
<div class="evidence-page water-page">
  <div class="kicker">
    <span>33 / Your water system’s record</span><span>Read what the record means</span>
  </div>
  <header>
    <p class="eyebrow">Not all violations tell the same story.</p>
    <h2>A missed test<br />is not <em>a failed test.</em></h2>
    <p>
      Follow a public water system’s reported history. Separate a contaminant-limit exceedance from
      a testing, treatment or reporting requirement—and see the recorded follow-up.
    </p>
  </header>
  <div class="safety-note">
    <span>Historical records, not a tap-water test</span>
    <p>
      This page cannot tell you whether your water is safe today or identify your supplier from your
      address. Use your supplier’s current notices and water-quality reports for present conditions.
      A county listing is not a service boundary.
    </p>
  </div>
  {#if data.waterError}<p role="alert">{data.waterError}</p>{/if}
  {#if dataset && data.water}
    <details class="coverage">
      <summary
        >{dataset.systems.length.toLocaleString()} systems · source snapshot {dataset.quarter} · scope
        & dates</summary
      >
      <p>{dataset.plan.selection}</p>
      <p>
        Violation intervals overlapping {dataset.plan.from} through {dataset.plan.through}, or not
        reliably excluded because boundaries are missing or inconsistent. Older unresolved intervals
        may be included. Counts are distinct system + violation IDs, not raw enforcement rows, and
        exclude history wholly outside this window.
      </p>
      <p>
        Snapshot label {dataset.quarter} is the source’s submission label, not the date every violation
        happened. Archive last modified: {dataset.sources.records.lastModified ?? 'not supplied'}.
        Captured {dataset.observedAt}. Search/FRS crosswalk is a separate capture: {dataset.sources
          .search.observedAt}.
      </p>
      <p>
        System-ID jurisdiction prefixes provide map geography. County rows can lack a reported
        state; the source prefix is used explicitly, not a geocoded mailing address.
        Tribal/region-prefixed systems outside this recipe are not represented. Populations can
        overlap and are not summed.
      </p>
      <p>
        {dataset.changes.baselineAt
          ? `${dataset.changes.added.length} added, ${dataset.changes.updated.length} projections changed since ${dataset.changes.baselineAt}.`
          : 'First capture; no source-change comparison yet.'}
        {dataset.changes.outsideDiscovery.length} retained outside current discovery. Changed records
        do not necessarily mean new violations.
      </p>
      <a href={`${base}/data/water/releases/${data.water.manifest.release}/data.json`} download
        >Download the frozen collection index</a
      >
      · <a href={dataset.sources.records.url}>Official national archive ↗</a>
    </details>
    <div class="meaning-guide">
      <p class="eyebrow">Start with the kind of record</p>
      <div>
        {#each waterKinds as k}<button
            class={`meaning ${k}`}
            class:active={kind === k}
            aria-pressed={kind === k}
            disabled={!ready}
            onclick={() => navigate({ kind: kind === k ? null : k, ...clearHistory })}
            ><span>{waterKindNames[k]}</span><small>{waterKindHelp[k]}</small></button
          >{/each}
      </div>
    </div>
    <form class="search" onsubmit={search}>
      <label for="water-search">Find a water system, county or PWS ID</label>
      <div>
        <input
          id="water-search"
          name="q"
          value={params.get('q') ?? ''}
          placeholder="System name or exact ID"
        /><button disabled={!ready}>Search water records</button>
      </div>
    </form>
    <div class="filters">
      <label
        >System type<select
          aria-label="Water system type"
          disabled={!ready}
          value={params.get('type') ?? ''}
          onchange={(e) => navigate({ type: e.currentTarget.value, system: null, ...clearHistory })}
          ><option value="">All collected types</option><option value="CWS"
            >Community · year-round residents</option
          ><option value="NTNCWS">Non-transient · recurring users</option><option value="TNCWS"
            >Transient · changing users</option
          ></select
        ></label
      ><label
        >Record category<select
          aria-label="Water record category"
          disabled={!ready}
          value={kind}
          onchange={(e) => navigate({ kind: e.currentTarget.value, ...clearHistory })}
          ><option value="">All record categories</option>{#each waterKinds as k}<option value={k}
              >{waterKindNames[k]}</option
            >{/each}</select
        ></label
      >
    </div>
    <p class="result-count">
      <strong>{filtered.length.toLocaleString()}</strong> systems in view · counts describe this collection,
      not safety rankings
    </p>
    {#if params.get('system') && !selected}<p role="status" class="empty">
        That exact system ID is not in this captured collection. This is not evidence that it has no
        violations.
      </p>{/if}
    {#if selected}<section
        class="water-detail"
        bind:this={detailElement}
        tabindex="-1"
        aria-label="Water system evidence"
        in:fly={{ y: 12, duration: reduced ? 0 : 220 }}
      >
        <div class="detail-top">
          <span class="eyebrow">The system, then the evidence</span><button
            onclick={() => navigate({ system: null, ...clearHistory })}>Close system ×</button
          >
        </div>
        <h3>{selected.name}</h3>
        <p class="identity">
          PWS ID {selected.id} · {selected.state} ID jurisdiction · {selected.counties.join(
            ' / ',
          ) || 'county unavailable'}
        </p>
        <div class="system-facts">
          <div>
            <span>System type</span><strong>{selected.type.label ?? selected.type.code}</strong>
          </div>
          <div>
            <span>Reported water source</span><strong
              >{selected.sourceType.label ?? (selected.sourceType.code || 'Unknown')}</strong
            >
          </div>
          <div>
            <span>Reported population served</span><strong
              >{selected.population === null
                ? 'Not reported'
                : selected.population.toLocaleString()}</strong
            >
          </div>
          <div>
            <span>Source activity</span><strong
              >{selected.activity.label ?? selected.activity.code}</strong
            >
          </div>
        </div>
        {#if !filtered.some((s) => s.id === selected.id)}<p role="status">
            This linked system is outside the current list filters; its record remains open.
          </p>{/if}
        {#if loading}<p role="status">
            Verifying the source-linked water history…
          </p>{/if}{#if error}<p role="alert">{error}</p>
          <button onclick={() => retry++}>Retry water evidence</button>{/if}
        {#if detail}
          <div class="section-heading">
            <span class="eyebrow">01 / Read across time</span>
            <h4>When the recorded intervals began</h4>
          </div>
          <p class="small">
            Unique violations by reported noncompliance start year. These are not annual rates or
            measurements. Older bars can contain intervals overlapping the selected window; unknown
            or inconsistent dates remain separate. An enforcement action is not a new violation.
          </p>
          {#if detail.violations.some((v) => v.intervalIssue)}<p class="record-caution">
              {detail.violations.filter((v) => v.intervalIssue).length} source intervals report an end
              before the start. They remain visible but are grouped under Unknown; their overlap with
              this collection’s dates cannot be established.
            </p>{/if}
          <div class="history-legend">
            {#each waterKinds as k}<span class={k}><i></i>{waterKindNames[k]}</span>{/each}
          </div>
          <div class="water-years">
            {#each years as y}<button
                class:selected={params.get('year') === y.year}
                aria-pressed={params.get('year') === y.year}
                aria-label={`Inspect water violations beginning ${y.year}`}
                onclick={() => navigate({ year: params.get('year') === y.year ? null : y.year })}
                ><strong>{y.year}</strong><span class="year-bar"
                  >{#each waterKinds as k}<i
                      class={k}
                      style={`width:${(y[k] / maxYear) * 100}%`}
                      title={`${waterKindNames[k]}: ${y[k]}`}
                    ></i>{/each}</span
                ><small>{y.total}</small></button
              >{/each}
          </div>
          <div class="record-controls">
            <label
              >Recorded status<select
                aria-label="Water violation status"
                value={params.get('status') ?? ''}
                onchange={(e) => navigate({ status: e.currentTarget.value })}
                ><option value="">All reported statuses</option>{#each [...new Set(detail.violations
                      .map((v) => v.status)
                      .filter(Boolean))].sort() as status}<option value={status}>{status}</option
                  >{/each}</select
              ></label
            ><button onclick={() => navigate({ ...clearHistory, kind: null })}
              >Clear history filters</button
            >
          </div>
          <p class="small">
            {violations.length.toLocaleString()} distinct violations shown by these filters{params.get(
              'year',
            )
              ? ` · starting ${params.get('year')}`
              : ''}. {params.get('status')
              ? (waterStatusHelp[params.get('status')!] ?? 'Read the literal status in the source.')
              : ''}
          </p>
          <div class="section-heading">
            <span class="eyebrow">02 / Understand each record</span>
            <h4>What was reported, and what followed</h4>
          </div>
          <ol class="water-timeline">
            {#each violations.slice(0, violationLimit) as v (v.id)}<li class={v.kind}>
                <div class="violation-top">
                  <span class={`badge ${v.kind}`}>{waterKindNames[v.kind]}</span><span
                    >{v.status ?? 'Status not reported'}</span
                  >
                </div>
                <h5>{v.code.label ?? `Source violation code ${v.code.code}`}</h5>
                <p class="violation-period">
                  {v.from ?? 'Unknown start'} → {v.through ?? 'End not reported'} · violation {v.id}
                </p>
                {#if v.intervalIssue}<p class="record-caution">
                    The source reports an end before the start. The original dates are retained, but
                    this interval is uncertain and grouped under Unknown in the year chart.
                  </p>{/if}
                <p class="explanation">{waterKindHelp[v.kind]}</p>
                <dl class="record-facts">
                  <dt>Contaminant / subject</dt>
                  <dd>
                    {v.contaminant.label ?? 'Description unavailable'} ({v.contaminant.code ||
                      'no code'})
                  </dd>
                  <dt>Rule</dt>
                  <dd>{v.rule.label ?? 'Description unavailable'} ({v.rule.code || 'no code'})</dd>
                  <dt>Source health-based flag</dt>
                  <dd>{v.healthBased === null ? 'Not reported' : v.healthBased ? 'Yes' : 'No'}</dd>
                  <dt>Reported return-to-compliance date</dt>
                  <dd>{v.returned ?? 'Not reported'}</dd>
                </dl>
                {#if v.kind === 'monitoring' || v.kind === 'reporting'}<p class="record-caution">
                    A named contaminant here identifies what should have been monitored or reported.
                    It does not mean that contaminant was detected above a limit.
                  </p>{/if}
                {#if v.measure !== null}<div class="measurement">
                    <span>Source-reported historical value</span><strong
                      >{v.measure} {v.units ?? '(unit not reported)'}</strong
                    >
                    <p>
                      Federal limit as reported: {v.federalLimit ?? 'not reported'} · state limit: {v.stateLimit ??
                        'not reported'}. Values and units are preserved without conversion; this is
                      not a current sample.
                    </p>
                  </div>{/if}
                <p class="small">
                  {v.status
                    ? (waterStatusHelp[v.status] ?? `Unclassified source status: ${v.status}`)
                    : 'No status supplied.'} First reported {v.firstReported ?? 'unknown'}; last
                  reported {v.lastReported ?? 'unknown'}. Reporting dates are not necessarily
                  occurrence dates.
                </p>
                <details class="followup">
                  <summary>{v.actions.length} linked enforcement / resolution records</summary>
                  <p class="small">
                    Joined by this system and violation ID. A single action may address several
                    violations; these counts must not be added across records.
                  </p>
                  <ol>
                    {#each v.actions as a}<li>
                        <time>{a.date ?? 'Date not reported'}</time><strong
                          >{a.code.label ??
                            (a.code.code || 'Action description unavailable')}</strong
                        ><span>{a.category ?? 'Category not supplied'} · ID {a.id}</span>
                      </li>{/each}
                  </ol>
                  {#if !v.actions.length}<p>
                      No linked action rows in this capture. This does not prove that nobody
                      responded.
                    </p>{/if}
                </details>
                <button
                  class="source-toggle"
                  onclick={() => (openSource = openSource === v.id ? null : v.id)}
                  >{openSource === v.id ? 'Hide' : 'Read'} exact source rows ({v.sourceRows
                    .length})</button
                >{#if openSource === v.id}<div class="raw-rows">
                    <p>
                      SDWA_VIOLATIONS_ENFORCEMENT.csv · row numbers exclude the header. Each hash
                      covers the exact captured field object; archive hash identifies the original
                      ZIP.
                    </p>
                    {#each v.sourceRows as r}<details>
                        <summary>Row {r.row} · {r.fields.ENFORCEMENT_ID || 'no action ID'}</summary>
                        <dl>
                          {#each Object.entries(r.fields) as [key, value]}<dt>{key}</dt>
                            <dd>{value || 'Not reported'}</dd>{/each}
                        </dl>
                        <code>{r.hash}</code>
                      </details>{/each}
                  </div>{/if}
              </li>{/each}
          </ol>
          {#if !violations.length}<p class="empty" role="status">
              No violations match this capture and filter. A missing record is not a clean bill of
              health; reporting gaps and the collection window still apply.
            </p>{/if}{#if violations.length > violationLimit}<button
              onclick={() => (violationLimit += 15)}>Show 15 more violations</button
            >{/if}
          <details class="standalone-actions">
            <summary
              >{detail.standaloneActions.length} action records without a linked violation ID</summary
            >
            <p class="small">
              These source rows have an enforcement ID but no violation ID. They are not invented
              violations or added to the category/year counts. Dated actions are limited to {dataset
                .plan.from} through {dataset.plan.through}; unknown dates remain. {detail.outsideWindowActionRows}
              earlier/later source rows are outside that action window. The violation filters above do
              not apply to these separate records.
            </p>
            <ol>
              {#each detail.standaloneActions.slice(0, standaloneLimit) as item}<li>
                  <time>{item.action.date ?? 'Date not reported'}</time>
                  <h5>{item.action.code.label ?? item.action.code.code}</h5>
                  <p>{item.action.category ?? 'Category not supplied'} · action {item.action.id}</p>
                  <details>
                    <summary>Exact source fields</summary>{#each item.rows as row}<p>
                        SDWA_VIOLATIONS_ENFORCEMENT.csv · row {row.row}
                      </p>
                      <dl>
                        {#each Object.entries(row.fields).filter( ([key]) => key.startsWith('ENF') ) as [key, value]}<dt
                          >
                            {key}
                          </dt>
                          <dd>{value || 'Not reported'}</dd>{/each}
                      </dl>{/each}
                  </details>
                </li>{/each}
            </ol>
            {#if detail.standaloneActions.length > standaloneLimit}<button
                onclick={() => (standaloneLimit += 15)}>Show 15 more unlinked actions</button
              >{/if}
          </details>
          <div class="connections">
            <h4>Follow the identifiers, not similar names</h4>
            {#each related as facility}<a
                href={`${base}/records/enforcement/?facility=${facility.id}&program=SDWA`}
                >Open matching EPA facility: {facility.name} →</a
              >{/each}{#if echoTried && echo && !related.length}<p>
                No exact SDWA program-ID match in our separate facility collection. This does not
                mean no enforcement exists.
              </p>{/if}{#if related.length}<p>
                Exact SDWA ID {selected.id}; the EPA facility collection was captured {echo?.observedAt.slice(
                  0,
                  10,
                )}. Different reporting windows can yield different counts.
              </p>{/if}{#if echoError}<p>{echoError}</p>{/if}<a href={`${base}/records/rules/`}
              >Explore environmental rule context →</a
            >
            <p>
              Context only: no claim that a particular collected rule caused this system’s record.
            </p>
            <a href={waterSystemUrl(selected.id)} target="_blank" rel="noreferrer"
              >Open this exact system’s EPA report ↗</a
            ><a
              href={`${base}/data/water/releases/${data.water.manifest.release}/systems/${selected.id.toLowerCase()}.json`}
              download>Download captured system evidence</a
            >
            <p>Original SDWA archive SHA-256: <code>{dataset.sources.records.hash}</code></p>
          </div>
        {/if}
      </section>{/if}
    <div class="water-list" aria-label="Collected public water systems">
      {#each filtered.slice(0, limit) as system (system.id)}<button
          class="water-card"
          class:selected={selected?.id === system.id}
          disabled={!ready}
          onclick={() => navigate({ system: system.id, ...clearHistory })}
          ><div class="card-top">
            <span>{system.state} ID jurisdiction · {system.counties.join(' / ')}</span><span>↗</span
            >
          </div>
          <h3>{system.name}</h3>
          <p>
            {system.id} · {system.type.label ?? system.type.code}{system.retained
              ? ' · retained outside discovery'
              : ''}
          </p>
          <div class="card-counts">
            {#each waterKinds as k}{#if system.kinds[k]}<span class={k}
                  ><strong>{system.kinds[k]}</strong> {waterKindNames[k]}</span
                >{/if}{/each}{#if !system.violations}<span
                >No matching violations in the captured window—not a safety finding</span
              >{/if}
          </div>
          <small>{system.violations} distinct violation IDs, not enforcement-row totals</small
          ></button
        >{/each}
    </div>
    {#if !filtered.length}<p class="empty" role="status">
        No systems match this collection and filter. Coverage is limited to the declared counties,
        not the entire state or nation.
      </p>{/if}{#if filtered.length > limit}<button onclick={() => (limit += 24)}
        >Show 24 more systems</button
      >{/if}
    <footer>
      <a
        href="https://echo.epa.gov/tools/data-downloads/sdwa-download-summary"
        target="_blank"
        rel="noreferrer">EPA’s source dictionary ↗</a
      >
      <p>
        No water-safety score. Unknown values stay unknown. Public records can be delayed or
        incomplete.
      </p>
    </footer>
  {/if}
</div>

<style>
  .water-page {
    --ink: #314e55;
    --muted: #6b8589;
    --line: #d8e3df;
    --wash: #f0f6f3;
    color: var(--ink);
  }
  .kicker,
  .detail-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  header {
    padding: 26px 0 12px;
  }
  header h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(48px, 5vw, 72px);
    line-height: 0.97;
    letter-spacing: -0.02em;
    margin: 13px 0 22px;
  }
  header em {
    font-style: normal;
    color: #648f8b;
  }
  p {
    font-size: 13px;
    line-height: 1.75;
  }
  header > p:last-child {
    font-size: 15px;
    max-width: 590px;
  }
  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .safety-note {
    padding: 18px;
    border-left: 3px solid #85aca5;
    background: #eef4ee;
    margin: 10px 0 24px;
  }
  .safety-note > span {
    font-weight: 600;
    font-size: 13px;
  }
  .safety-note p {
    font-size: 12px;
    margin: 8px 0 0;
  }
  .coverage {
    font-size: 12px;
    border-block: 1px solid var(--line);
    padding: 16px 0;
    margin: 20px 0;
  }
  summary {
    cursor: pointer;
    line-height: 1.6;
  }
  a {
    color: #3c7c78;
    text-underline-offset: 3px;
  }
  button,
  input,
  select {
    font: inherit;
    font-size: 12px;
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 11px;
    background: white;
  }
  button {
    cursor: pointer;
    transition:
      background 0.18s,
      transform 0.18s,
      border-color 0.18s;
  }
  button:hover {
    border-color: #78a79b;
    background: #f0f6f1;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .meaning-guide {
    margin: 25px 0;
  }
  .meaning-guide > div {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .meaning {
    text-align: left;
    padding: 15px;
    border-left: 3px solid;
  }
  .meaning > span {
    font-size: 12px;
    font-weight: 600;
    display: block;
  }
  .meaning > small {
    display: block;
    font-size: 10px;
    line-height: 1.7;
    margin-top: 7px;
  }
  .meaning.active {
    outline: 2px solid #527a73;
    outline-offset: 1px;
  }
  .contaminant {
    --kind: #ba8263;
  }
  .treatment {
    --kind: #998cae;
  }
  .monitoring {
    --kind: #77a5b2;
  }
  .reporting {
    --kind: #9db6b8;
  }
  .other {
    --kind: #adaea2;
  }
  .meaning {
    border-left-color: var(--kind);
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
    gap: 15px;
    margin: 18px 0;
  }
  select {
    display: block;
    width: 100%;
    margin-top: 7px;
  }
  .result-count {
    padding: 17px;
    background: var(--wash);
    border-radius: 7px;
    font-size: 11px;
  }
  .result-count strong {
    font-size: 25px;
    margin-right: 8px;
  }
  .water-list {
    display: grid;
    gap: 13px;
    margin: 24px 0;
  }
  .water-card {
    padding: 21px;
    text-align: left;
    border-radius: 8px;
    background: white;
  }
  .water-card:hover {
    transform: translateY(-2px);
  }
  .water-card.selected {
    background: #f1f7f2;
    border-color: #7ba295;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }
  h3 {
    font-size: 24px;
    margin: 11px 0;
    overflow-wrap: anywhere;
  }
  .water-card > p {
    font-size: 11px;
  }
  .card-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0;
  }
  .card-counts > span {
    padding: 6px 8px;
    font-size: 10px;
    background: #f6f7f4;
    border-left: 3px solid var(--kind);
  }
  .small,
  small {
    font-size: 11px;
    line-height: 1.7;
    color: var(--muted);
  }
  .water-detail {
    background: #f7faf5;
    padding: 26px;
    border: 1px solid #a8c2b9;
    border-radius: 10px;
    margin: 27px 0;
    outline: none;
    scroll-margin-top: 16px;
  }
  .water-detail > h3 {
    font-size: 31px;
    margin-top: 20px;
  }
  .identity {
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .system-facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    padding: 22px 0;
    border-block: 1px solid var(--line);
    margin: 20px 0;
  }
  .system-facts span {
    display: block;
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .system-facts strong {
    font-size: 12px;
    font-weight: 500;
  }
  .section-heading {
    margin: 29px 0 10px;
  }
  h4 {
    font-size: 21px;
    margin: 10px 0;
  }
  .water-years {
    display: grid;
    gap: 7px;
    margin: 20px 0;
  }
  .history-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 9px 14px;
    margin: 16px 0;
  }
  .history-legend > span {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
  }
  .history-legend i {
    width: 9px;
    height: 9px;
    background: var(--kind);
  }
  .water-years button {
    display: grid;
    grid-template-columns: 50px 1fr 30px;
    gap: 12px;
    align-items: center;
    padding: 9px;
    text-align: left;
    border: 0;
    background: #edf3ed;
  }
  .water-years button.selected {
    outline: 2px solid #7aa094;
  }
  .water-years strong {
    font-size: 10px;
    font-weight: 500;
  }
  .year-bar {
    display: flex;
    min-height: 14px;
  }
  .year-bar i {
    display: block;
    background: var(--kind);
    height: 14px;
    transition: width 0.3s;
  }
  .water-years small {
    text-align: right;
    font-size: 10px;
  }
  .record-controls {
    display: flex;
    align-items: end;
    gap: 13px;
    margin: 24px 0;
  }
  .record-controls label {
    flex: 1;
  }
  .water-timeline {
    list-style: none;
    padding: 0 0 0 20px;
    margin: 24px 0;
    border-left: 1px solid #bdd0c5;
  }
  .water-timeline > li {
    position: relative;
    padding: 0 0 35px;
  }
  .water-timeline > li:before {
    content: '';
    position: absolute;
    left: -25px;
    top: 8px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--kind);
  }
  .violation-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 10px;
  }
  .badge {
    border-left: 3px solid var(--kind);
    padding: 6px 8px;
    background: #fff;
  }
  .water-timeline h5 {
    font-size: 20px;
    margin: 15px 0 7px;
  }
  .violation-period {
    font-size: 10px;
    color: var(--muted);
  }
  .explanation {
    font-size: 12px;
  }
  .record-facts {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 9px;
    font-size: 11px;
    line-height: 1.6;
    margin: 19px 0;
  }
  .record-facts dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .record-caution {
    padding: 12px;
    background: #e9f1f2;
    font-size: 12px;
    border-left: 2px solid #85a9b2;
  }
  .measurement {
    padding: 15px;
    background: #f6eee4;
    border-radius: 5px;
    margin: 20px 0;
  }
  .measurement > span {
    display: block;
    font-size: 10px;
  }
  .measurement > strong {
    display: block;
    font-size: 20px;
    margin: 7px 0;
  }
  .measurement p {
    font-size: 11px;
  }
  .followup {
    font-size: 11px;
    padding: 13px 0;
    border-block: 1px solid var(--line);
  }
  .followup ol {
    padding-left: 18px;
  }
  .followup li {
    padding: 7px 0;
    font-size: 11px;
  }
  .followup time,
  .followup strong,
  .followup span {
    display: block;
    margin: 3px 0;
  }
  .followup time,
  .followup span {
    color: var(--muted);
    font-size: 10px;
  }
  .source-toggle {
    margin: 12px 0;
    font-size: 10px;
  }
  .raw-rows {
    font-size: 10px;
    padding: 12px;
    background: white;
  }
  .raw-rows p {
    font-size: 10px;
  }
  .raw-rows details {
    padding: 9px 0;
  }
  .raw-rows dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .raw-rows dt {
    overflow-wrap: anywhere;
  }
  .connections {
    border-top: 1px solid var(--line);
    padding-top: 18px;
    margin-top: 26px;
  }
  .standalone-actions {
    margin: 24px 0;
    border-block: 1px solid var(--line);
    padding: 16px 0;
    font-size: 12px;
  }
  .standalone-actions li {
    padding: 12px 0;
  }
  .standalone-actions time {
    font-size: 10px;
    color: var(--muted);
  }
  .standalone-actions h5 {
    font-size: 15px;
    margin: 7px 0;
  }
  .standalone-actions p,
  .standalone-actions details {
    font-size: 11px;
  }
  .standalone-actions dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
    font-size: 10px;
  }
  .standalone-actions dt {
    overflow-wrap: anywhere;
  }
  .connections a {
    display: block;
    line-height: 2.3;
    font-size: 12px;
  }
  .connections p {
    font-size: 11px;
  }
  code {
    overflow-wrap: anywhere;
    font-size: 10px;
  }
  .empty {
    border: 1px dashed #a8bdb1;
    padding: 17px;
    font-size: 12px;
  }
  footer {
    margin: 25px 0;
    font-size: 11px;
    color: var(--muted);
  }
  footer p {
    font-size: 11px;
  }
  .water-page :is(button, a, input, select, summary):focus-visible {
    outline: 3px solid #7ba295;
    outline-offset: 3px;
  }
  @media (max-width: 720px) {
    .kicker > span:last-child {
      display: none;
    }
    .meaning-guide > div,
    .filters {
      grid-template-columns: 1fr;
    }
    .meaning {
      padding: 12px;
    }
    .water-detail {
      padding: 17px;
    }
    .water-detail > h3 {
      font-size: 27px;
    }
    .water-card {
      padding: 17px;
    }
    .record-controls {
      flex-direction: column;
      align-items: stretch;
    }
    .violation-top {
      align-items: flex-start;
      flex-direction: column;
    }
    .record-facts,
    .raw-rows dl {
      grid-template-columns: 1fr;
    }
    .record-facts dd {
      margin-bottom: 6px;
    }
    .detail-top {
      align-items: flex-start;
    }
    .detail-top button {
      flex-shrink: 0;
    }
    .search > div {
      flex-wrap: wrap;
    }
    .search input {
      flex-basis: 140px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button,
    .year-bar i {
      transition: none;
    }
    .water-card:hover {
      transform: none;
    }
  }
</style>
