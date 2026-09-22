<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { sharedOverlap, type SharedEvidence, type SharedCell } from '$lib/civic/shared-investors';
  import { readSharedEvidence } from '$lib/civic/shared-investors-repository';
  import { holdingFilingUrl } from '$lib/civic/holdings';
  let { data } = $props();
  let ready = $state(false),
    reduced = $state(true),
    q = $state(''),
    retry = $state(0),
    loading = $state(false),
    error = $state(''),
    rowLimit = $state(8);
  let evidence = $state.raw<SharedEvidence | null>(null),
    evidenceElement: HTMLElement | undefined = $state();
  const dataset = $derived(data.sharedInvestors?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const group = $derived(
    dataset?.catalog.groups.find((g) => g.id === params.get('group')) ??
      (!params.get('group') ? dataset?.catalog.groups[0] : undefined),
  );
  const companies = $derived(
    dataset?.catalog.companies.filter((c) => group?.companies.includes(c.cik)) ?? [],
  );
  const choices = $derived(
    companies.filter(
      (c) =>
        (!params.get('state') ||
          dataset?.companies.find((p) => p.cik === c.cik)?.state === params.get('state')) &&
        (!q || `${c.label} ${c.ticker} ${c.cik}`.toLowerCase().includes(q.toLowerCase().trim())),
    ),
  );
  const company = $derived(
    companies.find(
      (c) =>
        c.cik === params.get('company') &&
        (!params.get('state') ||
          dataset?.companies.find((p) => p.cik === c.cik)?.state === params.get('state')),
    ) ?? (!params.get('company') ? choices[0] : undefined),
  );
  const profile = $derived(dataset?.companies.find((c) => c.cik === company?.cik));
  const before = $derived(params.get('before') ?? dataset?.periods.at(-2) ?? ''),
    after = $derived(params.get('after') ?? dataset?.periods.at(-1) ?? '');
  const comparable = $derived(
    !!dataset?.periods.includes(before) && !!dataset?.periods.includes(after) && before < after,
  );
  const peers = $derived(companies.filter((c) => c.cik !== company?.cik));
  const overlaps = $derived(
    dataset && company && comparable
      ? peers.map((peer) => ({
          peer,
          result: sharedOverlap(dataset, company.cik, peer.cik, before, after),
        }))
      : [],
  );
  const selected = $derived(
    dataset?.cells.find(
      (c) =>
        c.id === params.get('cell') &&
        c.company === company?.cik &&
        [before, after].includes(c.period),
    ),
  );
  const names = {
    reported: 'Reported position',
    'zero-reported': 'Zero quantity reported',
    'not-listed': 'Not listed',
    unavailable: 'Unavailable',
  };
  const quarter = (d: string) => `${d.slice(0, 4)} Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`;
  const money = (value: string | null) =>
    value === null
      ? 'Not measurable'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 2,
        }).format(Number(value));
  const cell = (manager: string, cik: string, period: string) =>
    dataset?.cells.find((c) => c.manager === manager && c.company === cik && c.period === period);
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  function navigate(changes: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [k, v] of Object.entries(changes))
      v === null ? url.searchParams.delete(k) : url.searchParams.set(k, v);
    return goto(url, { noScroll: true, keepFocus: true });
  }
  async function inspect(c: SharedCell) {
    await navigate({
      cell: c.id,
      company: c.company,
      state:
        dataset?.companies.find((p) => p.cik === c.company)?.state === params.get('state')
          ? params.get('state')
          : null,
    });
    await tick();
    evidenceElement?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  }
  $effect(() => {
    const bundle = data.sharedInvestors,
      id = selected?.id;
    void retry;
    evidence = null;
    error = '';
    loading = false;
    rowLimit = 8;
    if (!browser || !bundle || !id) return;
    const controller = new AbortController();
    let active = true;
    loading = true;
    readSharedEvidence(fetch, bundle, id, base, controller.signal)
      .then((e) => {
        if (active) evidence = e;
      })
      .catch(() => {
        if (active) error = 'The source evidence could not load or verify.';
      })
      .finally(() => {
        if (active) loading = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  });
  function downloadComparison() {
    if (!dataset || !company || !data.sharedInvestors) return;
    const payload = {
      formatVersion: 1,
      release: data.sharedInvestors.manifest.release,
      upstream: dataset.upstream,
      catalogVersion: dataset.catalog.version,
      group,
      company: company.cik,
      before,
      after,
      overlaps,
      method:
        'Same observed-report cohort in both quarters; counts are reporting managers, not control, market share or independent beneficial owners.',
    };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'shared-investors-comparison.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<svelte:head
  ><title>Competitors, shared investors · louderthanwords.fyi</title><meta
    name="description"
    content="Explore reported investment overlap between selected public companies, with quarter-by-quarter evidence and explicit coverage limits."
  /></svelte:head
>
<div class="shared-page">
  <div class="kicker">
    <span>22 / Shared investors</span><span>Connections, not conclusions.</span>
  </div>
  <header>
    <p class="eyebrow">Follow the same reported interests.</p>
    <h2>Different companies.<br /><em>Shared investors?</em></h2>
    <p>
      Find the managers reporting positions in a company and its peers. Follow the overlap across
      quarters—and inspect every connection.
    </p>
  </header>
  <aside class="notice">
    <strong>Shared investments are not shared control.</strong>
    <p>
      These delayed 13F disclosures do not establish operational control, coordination or collusion.
      Managers can report on behalf of clients and can appear in related reports. Counts are not
      independent owners or market share.
    </p>
  </aside>
  {#if data.sharedInvestorsError}<p role="alert">{data.sharedInvestorsError}</p>{/if}
  {#if dataset && data.sharedInvestors}
    <details class="coverage">
      <summary
        >{dataset.companies.length} selected companies · {dataset.managers.length} managers · scope &
        sources</summary
      >
      <p>{dataset.catalog.selection}</p>
      <p>{dataset.upstream.selection}</p>
      <p>
        Holdings captured {dataset.upstream.observedAt}. Company metadata captured through {dataset.observedAt}.
        Catalog {dataset.catalog.version}, reviewed {dataset.catalog.reviewedAt}. Classifications
        are held fixed for both quarters; changes in the catalog are not investment changes.
      </p>
      <p>
        Only mapped common-equity CUSIPs with share units are included. Options, principal amounts
        and unmapped classes are excluded. Dollar values can be added across a company’s mapped
        classes, but share quantities and voting rights are not combined. Missing reports and
        out-of-date mappings are unavailable, never zero.
      </p>
      <p>
        The map counts selected companies by current captured business-address state. These are
        state-label anchors, not investment destinations or exact office coordinates.
      </p>
      <a
        href={`${base}/data/shared-investors/releases/${data.sharedInvestors.manifest.release}/data.json`}
        download>Download collection index</a
      >
      <p>
        <a href={`${base}/data/holdings/releases/${dataset.upstream.release}/data.json`}
          >Inspect the frozen holdings index →</a
        >
      </p>
    </details>
    <label
      >Peer group<select
        aria-label="Peer group"
        disabled={!ready}
        value={group?.id ?? ''}
        onchange={(e) => {
          q = '';
          navigate({ group: e.currentTarget.value, company: null, cell: null, state: null });
        }}
        ><option value="" disabled>Choose a group</option>{#each dataset.catalog.groups as g}<option
            value={g.id}>{g.label}</option
          >{/each}</select
      ></label
    >
    {#if group}
      <details class="group-definition">
        <summary>Why these companies belong together</summary>
        <p>{group.definition}</p>
        <p>{group.locator}</p>
        {#if group.sourceUrl}<blockquote>{group.excerpt}</blockquote>
          <a href={group.sourceUrl} target="_blank" rel="noreferrer"
            >Read the company’s competition disclosure ↗</a
          >{:else}<p>
            Classification is checked against each company’s SEC submissions profile, linked in the
            company evidence below.
          </p>{/if}
      </details>
      <label
        >Find a company<input
          aria-label="Find a company"
          type="search"
          bind:value={q}
          placeholder="Company, ticker or CIK"
        /></label
      >
      <div class="company-picker" aria-label="Companies in this collection">
        {#each choices as c}<button
            class:active={company?.cik === c.cik}
            aria-pressed={company?.cik === c.cik}
            onclick={() => navigate({ company: c.cik, cell: null })}
            ><strong>{c.label}</strong><small>{c.ticker}</small></button
          >{/each}
      </div>
      {#if !choices.length}<p class="empty">
          No selected companies match this search or state. This collection is not the whole market.
        </p>{/if}
      {#if params.get('state')}<p class="state-context">
          State filter: {params.get('state')}. It narrows the focal company, not its out-of-state
          peers.
          <button onclick={() => navigate({ state: null, company: null, cell: null })}
            >Clear state filter</button
          >
        </p>{/if}
    {:else}<p class="empty">This peer group is not in the collection.</p>
      <button onclick={() => navigate({ group: null, company: null, cell: null })}
        >Show available groups</button
      >{/if}
    {#if company && profile}
      <div class="company-heading">
        <div>
          <p class="eyebrow">Selected company</p>
          <h3>{company.label}</h3>
        </div>
        <span>{company.ticker}<br />CIK {company.cik} · {profile.state ?? 'State unavailable'}</span
        >
      </div>
      <div class="quarters">
        <label
          >Earlier quarter<select
            aria-label="Earlier quarter"
            disabled={!ready}
            value={before}
            onchange={(e) => navigate({ before: e.currentTarget.value, cell: null })}
            >{#each dataset.periods as p}<option value={p}>{quarter(p)}</option>{/each}</select
          ></label
        ><span aria-hidden="true">→</span><label
          >Later quarter<select
            aria-label="Later quarter"
            disabled={!ready}
            value={after}
            onchange={(e) => navigate({ after: e.currentTarget.value, cell: null })}
            >{#each dataset.periods as p}<option value={p}>{quarter(p)}</option>{/each}</select
          ></label
        >
      </div>
      {#if !comparable}<p class="empty">
          Choose an earlier quarter followed by a later covered quarter.
        </p>{:else}
        <section class="overlap" aria-label="Shared manager comparison">
          <div class="section-heading">
            <h3>The overlap</h3>
            <button onclick={downloadComparison}>Download comparison</button>
          </div>
          <p>
            Each connection counts managers with a positive reported position in both companies. The
            trend uses only managers with usable reports in both quarters.
          </p>
          {#each overlaps as { peer, result } (peer.cik)}<article
              class="peer-card"
              in:fly={{ y: reduced ? 0 : 8, duration: reduced ? 0 : 180 }}
            >
              <div class="peer-title">
                <span>{company.label}</span><span class="connection" aria-hidden="true"
                  ><i></i><b></b><i></i></span
                ><strong>{peer.label}</strong>
              </div>
              <div class="trend">
                <div><small>{quarter(before)}</small><strong>{result.before.length}</strong></div>
                <span aria-hidden="true">→</span>
                <div><small>{quarter(after)}</small><strong>{result.after.length}</strong></div>
                <p>
                  shared reporting managers<br />in a consistent group of {result.cohort.length}
                </p>
              </div>
              <details>
                <summary>Who is counted? {result.excluded.length} excluded from the trend</summary>
                <p>
                  Consistent reporting group: {result.cohort
                    .map((id) => dataset.managers.find((m) => m.cik === id)?.name)
                    .join('; ') || 'None'}.
                </p>
                <p>
                  Earlier shared managers: {result.before
                    .map((id) => dataset.managers.find((m) => m.cik === id)?.name)
                    .join('; ') || 'None observed'}.
                </p>
                <p>
                  Later shared managers: {result.after
                    .map((id) => dataset.managers.find((m) => m.cik === id)?.name)
                    .join('; ') || 'None observed'}.
                </p>
                <p>
                  Excluded because one or more company/quarter records are unavailable: {result.excluded
                    .map((id) => dataset.managers.find((m) => m.cik === id)?.name)
                    .join('; ') || 'None'}.
                </p>
                <p>
                  Without holding the group constant, observed shared counts are {result
                    .observedBefore.length} → {result.observedAfter.length}. A coverage change is
                  not proof of an investment change. Even usable public reports can omit
                  confidential or small holdings.
                </p>
              </details>
            </article>{/each}
        </section>
        <section class="matrix" aria-label="Manager and company positions">
          <h3>Open a connection</h3>
          <p>
            For each manager, compare the focal company with every peer. Select a quarter badge to
            inspect its source rows.
          </p>
          <div class="legend">
            <span>● Positive position</span><span>○ Not listed / zero reported</span><span
              >— Unavailable</span
            >
          </div>
          {#each dataset.managers as m}<article
              class="manager-card"
              class:highlighted={params.get('manager') === m.cik}
            >
              <h4>{m.name}</h4>
              <small>Reporting-manager CIK {m.cik}</small>{#each companies as c}<div
                  class="matrix-row"
                  class:focal={c.cik === company.cik}
                >
                  <span>{c.label}</span>
                  <div>
                    {#each [before, after] as period}{@const item = cell(
                        m.cik,
                        c.cik,
                        period,
                      )}{#if item}<button
                          class:positive={item.status === 'reported'}
                          class:unavailable={item.status === 'unavailable'}
                          aria-label={`${m.name}, ${c.label}, ${quarter(period)}: ${names[item.status]}`}
                          onclick={() => inspect(item)}
                          ><span aria-hidden="true"
                            >{item.status === 'reported'
                              ? '●'
                              : item.status === 'unavailable'
                                ? '—'
                                : '○'}</span
                          ><small>{quarter(period)}</small><b>{names[item.status]}</b></button
                        >{/if}{/each}
                  </div>
                </div>{/each}
            </article>{/each}
        </section>
      {/if}
      {#if selected}<section
          class="source-evidence"
          bind:this={evidenceElement}
          aria-label="Selected investment evidence"
          aria-busy={loading}
        >
          <div class="section-heading">
            <h3>Read the record</h3>
            <button onclick={() => navigate({ cell: null })}>Close evidence</button>
          </div>
          <p>
            {dataset.managers.find((m) => m.cik === selected.manager)?.name} · {company.label} · {quarter(
              selected.period,
            )}
          </p>
          <strong class="status">{names[selected.status]}</strong>
          <p>
            Reported value across mapped classes: {money(selected.value)}. Not a percentage of
            company ownership.
          </p>
          {#each selected.reasons as reason}<p class="caution">{reason}</p>{/each}
          {#if loading}<p role="status">Loading verified source evidence…</p>{/if}{#if error}<p
              role="alert"
            >
              {error}
            </p>
            <button onclick={() => retry++}>Retry source evidence</button>{/if}
          {#if evidence}<p>
              <a
                href={`${base}/data/shared-investors/releases/${data.sharedInvestors.manifest.release}/evidence/${selected.id}.json`}
                download>Download this evidence</a
              >
            </p>
            {#each evidence.positions as p}<div class="security">
                <strong
                  >{company.securities.find((s) => s.cusip === p.cusip)?.label} · {p.cusip}</strong
                >
                <p>{p.quantity} reported shares · ${p.value} reported value</p>
                <small
                  >As-filed names: {p.names.join(' / ')} · classes: {p.classes.join(' / ')}</small
                >
              </div>{/each}
            {#if !evidence.positions.length}<p>
                {selected.status === 'unavailable'
                  ? 'No usable position comparison for this report. Read the reporting context below.'
                  : 'The mapped common-equity securities were not listed in the usable report. This is not proof the manager held nothing.'}
              </p>{/if}
            {#each evidence.filings as f}<details class="filing-context">
                <summary>{f.filing.form} · {f.filing.accession} · {f.filing.amendment}</summary>
                <p>
                  Filed {f.filing.filed}; report type {f.filing.reportType}. Confidential omission
                  flag: {f.filing.confidential === null
                    ? 'unspecified'
                    : f.filing.confidential
                      ? 'yes'
                      : 'no'}.
                </p>
                <p>{f.cover.fields.ADDITIONALINFORMATION ?? ''}</p>
                <a href={holdingFilingUrl(f.filing)} target="_blank" rel="noreferrer"
                  >Open official filing ↗</a
                >
                <p>
                  Other managers reporting for this manager: {f.reportingFor.length}. Included
                  manager records: {f.includedManagers.length}. These relationships can produce
                  overlapping reporting; do not add managers’ amounts as independent ownership.
                </p>
                {#each [...f.reportingFor, ...f.includedManagers] as row}<dl>
                    {#each Object.entries(row.fields).filter(([, v]) => v) as [key, value]}<dt>
                        {key}
                      </dt>
                      <dd>{value}</dd>{/each}
                  </dl>{/each}
              </details>{/each}
            <h4>{evidence.rows.length} exact source rows</h4>
            {#each evidence.rows.slice(0, rowLimit) as r}<details class="raw-row">
                <summary>INFOTABLE.tsv row {r.row.row} · {r.accession}</summary><small
                  >Source field hash {r.row.hash}</small
                >
                <dl>
                  {#each Object.entries(r.row.fields) as [key, value]}<dt>{key}</dt>
                    <dd>{value || 'Not supplied'}</dd>{/each}
                </dl>
              </details>{/each}{#if evidence.rows.length > rowLimit}<button
                onclick={() => (rowLimit += 12)}>Show more source rows</button
              >{/if}
          {/if}
        </section>{/if}
      <details class="identity">
        <summary>Company identity & security matching</summary>
        <p>{profile.name} · SEC SIC {profile.sic}: {profile.sicDescription}</p>
        <a href={profile.profile.url} target="_blank" rel="noreferrer">SEC company profile ↗</a
        >{#each company.securities as s}{@const identity = profile.identities.find(
            (i) => i.cusip === s.cusip,
          )}
          <p>
            <strong>{s.label} · CUSIP {s.cusip}</strong><br />Curated match applies {s.from} through {s.through}.
            {#if identity}The issuer CIK and CUSIP are verified in <a
                href={identity.source.url}
                target="_blank"
                rel="noreferrer">Schedule 13G identity fields ↗</a
              >
              (event {identity.eventDate}).{/if}
          </p>{/each}
        <p>
          Schedule 13G is used only to verify identity here. All displayed investment amounts and
          manager relationships come from the frozen Form 13F collection. Matching is not based on
          similar company names.
        </p>
      </details>
      <section class="connections">
        <h3>Keep following the records</h3>
        {#if ['0000789019', '0001652044'].includes(company.cik)}
          <a href={`${base}/records/major-stakes/?issuer=${company.cik}`}>Read {company.label} major-stake disclosures →</a>
          <p>Exact issuer CIK. Schedules 13D/G report beneficial ownership; 13F reports managed holdings. They are not interchangeable totals.</p>
        {/if}
        <a
          href={`${base}/records/holdings/?${new URLSearchParams({ ...(selected ? { manager: selected.manager } : {}), before, after })}`}
          >Open current quarterly holdings →</a
        >
        <p>
          The portfolio explorer may have a newer release. This comparison stays pinned to {dataset
            .upstream.release}.
        </p>
        {#if ['0000789019', '0000019617'].includes(company.cik)}<a
            href={`${base}/records/insiders/?issuer=${company.cik}`}
            >Read {company.label} insider transaction records →</a
          >
          <p>
            Same issuer CIK, different disclosures—not a claim that officers and managers acted
            together.
          </p>{/if}{#if profile.state}<a href={`${base}/records/paycheck/?state=${profile.state}`}
            >Explore {profile.state} wage and employment context →</a
          >
          <p>Regional context, not a claim that these holdings caused wage changes.</p>{/if}
      </section>
    {:else if group}<p class="empty">
        Choose a company in this collection, or clear the state filter.
      </p>{/if}
    <footer>
      <p>Form 13F · selected public records · reproducible local pipeline</p>
      <p>No live prices. No ownership-control score. No inferred trading advice.</p>
    </footer>
  {/if}
</div>

<style>
  .shared-page {
    --accent: #648d98;
    --ink: #24383f;
    --line: #dbe7e9;
    --wash: #f2f7f7;
    color: var(--ink);
    padding: 28px 30px 45px;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .kicker,
  .eyebrow {
    font-size: 9px;
    letter-spacing: 0.17em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .kicker {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid var(--line);
    padding-bottom: 18px;
  }
  .eyebrow {
    margin-top: 25px;
  }
  h2,
  h3,
  h4 {
    font-family: 'Barlow Condensed', sans-serif;
    line-height: 1.03;
    margin: 12px 0;
  }
  h2 {
    font-size: clamp(40px, 4vw, 66px);
    letter-spacing: -0.015em;
  }
  h2 em {
    font-style: normal;
    color: var(--accent);
  }
  h3 {
    font-size: 29px;
  }
  h4 {
    font-size: 23px;
  }
  p {
    font-size: 12px;
    line-height: 1.75;
    color: #526a73;
  }
  header > p:last-child {
    max-width: 520px;
  }
  .notice {
    border-left: 3px solid var(--accent);
    background: var(--wash);
    padding: 16px;
    margin: 23px 0;
  }
  .notice strong {
    font-size: 13px;
  }
  .notice p {
    margin-bottom: 0;
  }
  details {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 13px;
    margin: 14px 0;
  }
  summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
  }
  a {
    color: #426f7c;
    text-underline-offset: 3px;
    font-size: 12px;
  }
  small {
    font-size: 10px;
    color: #6b8088;
    line-height: 1.5;
  }
  label {
    display: block;
    font-size: 11px;
    margin: 20px 0 9px;
    color: #526a73;
  }
  input,
  select {
    display: block;
    width: 100%;
    background: white;
    border: 1px solid #cfdee2;
    border-radius: 6px;
    color: var(--ink);
    min-height: 44px;
    padding: 10px;
    margin-top: 7px;
    font: inherit;
    font-size: 12px;
  }
  button {
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    color: var(--ink);
    background: white;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
    min-height: 40px;
    transition:
      background 0.18s,
      border-color 0.18s;
  }
  button:hover {
    background: var(--wash);
    border-color: var(--accent);
  }
  button:focus-visible,
  a:focus-visible,
  summary:focus-visible {
    outline: 2px solid #246277;
    outline-offset: 3px;
  }
  .company-picker {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .company-picker button {
    flex: 1;
    min-width: 100px;
    text-align: left;
    padding: 13px;
  }
  .company-picker strong,
  .company-picker small {
    display: block;
  }
  .company-picker .active {
    background: #e5f0f1;
    border-color: var(--accent);
  }
  .company-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: 27px;
  }
  .company-heading h3 {
    font-size: 38px;
  }
  .company-heading > span {
    font-size: 10px;
    text-align: right;
    line-height: 1.6;
  }
  .quarters {
    display: grid;
    grid-template-columns: 1fr 24px 1fr;
    gap: 12px;
    align-items: center;
    margin-bottom: 24px;
  }
  .quarters > span {
    padding-top: 28px;
    color: var(--accent);
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .section-heading button {
    font-size: 10px;
  }
  .peer-card {
    border: 1px solid var(--line);
    padding: 19px;
    border-radius: 10px;
    margin: 15px 0;
    background: linear-gradient(125deg, #fff, #f4f9f9);
  }
  .peer-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .connection {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    min-width: 25px;
  }
  .connection i {
    width: 6px;
    height: 6px;
    border: 1px solid var(--accent);
    border-radius: 50%;
    flex: none;
  }
  .connection b {
    height: 1px;
    background: var(--accent);
    flex: 1;
    transform-origin: left;
    animation: connect 0.45s ease-out both;
  }
  .trend {
    display: flex;
    gap: 20px;
    align-items: center;
    margin: 20px 0;
  }
  .trend > div {
    display: flex;
    flex-direction: column;
  }
  .trend strong {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 44px;
    color: #426f7c;
  }
  .trend > span {
    color: var(--accent);
  }
  .trend p {
    font-size: 10px;
    margin-left: auto;
  }
  .peer-card details {
    border: 0;
    border-top: 1px solid var(--line);
    border-radius: 0;
    padding: 12px 0 0;
    margin: 0;
  }
  .legend {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 10px;
    color: #607b83;
    margin: 18px 0;
  }
  .manager-card {
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 18px;
    margin: 15px 0;
    content-visibility: auto;
    contain-intrinsic-size: auto 330px;
  }
  .manager-card.highlighted {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .matrix-row {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 8px;
    align-items: center;
    padding: 10px 0;
    border-top: 1px solid var(--line);
    margin-top: 10px;
  }
  .matrix-row > span {
    font-size: 12px;
  }
  .matrix-row.focal > span {
    font-weight: 700;
  }
  .matrix-row > div {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }
  .matrix-row button {
    text-align: left;
    padding: 8px;
    font-size: 10px;
  }
  .matrix-row button small {
    margin-left: 6px;
    font-size: 9px;
  }
  .matrix-row button b {
    display: block;
    font-weight: 500;
    margin-top: 4px;
    font-size: 9px;
  }
  .matrix-row button.positive {
    background: #e5eff0;
    color: #315e69;
  }
  .matrix-row button.unavailable {
    background: #f3f3f1;
    color: #7c7f79;
  }
  .source-evidence {
    scroll-margin-top: 100px;
    border: 1px solid #8facb4;
    border-radius: 10px;
    background: #f8fbfb;
    padding: 20px;
    margin: 26px 0;
  }
  .status {
    font-size: 13px;
  }
  .security {
    padding: 15px;
    border-bottom: 1px solid var(--line);
    font-size: 12px;
  }
  .caution {
    border-left: 2px solid #b39c72;
    padding-left: 12px;
  }
  .raw-row dl,
  .filing-context dl {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 9px;
    font-size: 10px;
  }
  .raw-row dd,
  .filing-context dd {
    margin: 0;
  }
  .raw-row dt,
  .filing-context dt {
    color: #72868e;
  }
  .raw-row small {
    display: block;
    margin: 12px 0;
  }
  .connections {
    border-top: 1px solid var(--line);
    padding-top: 12px;
    margin-top: 25px;
  }
  .connections a {
    display: block;
    margin-top: 20px;
  }
  .connections p {
    font-size: 11px;
  }
  blockquote {
    font-size: 12px;
    line-height: 1.7;
    margin: 15px;
    border-left: 2px solid var(--accent);
    padding-left: 12px;
  }
  .empty,
  [role='alert'] {
    background: #f6f1e8;
    padding: 16px;
    border-radius: 6px;
  }
  .state-context button {
    display: block;
    margin-top: 8px;
  }
  footer {
    margin-top: 30px;
    border-top: 1px solid var(--line);
    padding-top: 15px;
  }
  footer p {
    font-size: 10px;
  }
  @keyframes connect {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
  @media (max-width: 700px) {
    .shared-page {
      padding: 23px 18px 35px;
    }
    .kicker > span:last-child {
      display: none;
    }
    .matrix-row {
      grid-template-columns: 1fr;
      gap: 6px;
    }
    .trend {
      gap: 12px;
    }
    .trend p {
      font-size: 9px;
    }
    .peer-title {
      font-size: 11px;
    }
    .peer-card {
      padding: 15px;
    }
    .source-evidence {
      padding: 14px;
    }
    .raw-row dl,
    .filing-context dl {
      grid-template-columns: 1fr;
    }
    .raw-row dd,
    .filing-context dd {
      margin-bottom: 8px;
    }
    .quarters {
      gap: 8px;
      grid-template-columns: 1fr 16px 1fr;
    }
    .company-heading h3 {
      font-size: 32px;
    }
    .section-heading {
      flex-wrap: wrap;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
    .connection b {
      animation: none;
    }
  }
</style>
