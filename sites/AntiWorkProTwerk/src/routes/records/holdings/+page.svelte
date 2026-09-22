<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    compareHoldingsAsync,
    holdingChangeNames,
    holdingFilingUrl,
    type HoldingComparison,
    type HoldingDetail,
  } from '$lib/civic/holdings';
  import { createHoldingsReader } from '$lib/civic/holdings-repository';
  let { data } = $props();
  let positionElement: HTMLElement | undefined = $state(),
    filingElement: HTMLElement | undefined = $state();
  let ready = $state(false),
    reduced = $state(true),
    loading = $state(false),
    error = $state(''),
    retry = $state(0),
    limit = $state(25),
    rowLimit = $state(12);
  let comparison = $state.raw<HoldingComparison[]>([]);
  let evidence = $state.raw<{ accession: string; row: number; fields: Record<string, string> }[]>(
      [],
    ),
    evidenceLoading = $state(false),
    evidenceError = $state(''),
    evidenceRetry = $state(0);
  let filing = $state.raw<HoldingDetail | null>(null),
    filingLoading = $state(false),
    filingError = $state(''),
    filingRetry = $state(0);
  const reader = createHoldingsReader(fetch, base);
  const dataset = $derived(data.holdings?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const managers = $derived.by(() => {
    if (!dataset) return [];
    return dataset.plan.managers
      .map((cik) => dataset.snapshots.filter((s) => s.cik === cik).at(-1))
      .filter((s) => s !== undefined)
      .filter((s) => !params.get('state') || s.state === params.get('state'));
  });
  const manager = $derived(
    managers.find((m) => m.cik === params.get('manager')) ??
      (!params.get('manager') ? managers[0] : undefined),
  );
  const snapshots = $derived(dataset?.snapshots.filter((s) => s.cik === manager?.cik) ?? []);
  const after = $derived(
    params.get('after')
      ? snapshots.find((s) => s.period === params.get('after'))
      : snapshots.at(-1),
  );
  const before = $derived(
    params.get('before')
      ? snapshots.find((s) => s.period === params.get('before'))
      : snapshots.filter((s) => s.period < (after?.period ?? '')).at(-1),
  );
  const comparable = $derived(
    !!before &&
      !!after &&
      before.period < after.period &&
      before.status === 'reported' &&
      after.status === 'reported',
  );
  const filtered = $derived.by(() => {
    const q = (params.get('q') ?? '').toLowerCase().trim(),
      change = params.get('change');
    return comparison.filter(
      (c) =>
        (!change || c.change === change) &&
        (params.get('concentration') !== 'growing' || c.concentrationDirection === 1) &&
        (!q ||
          [c.key, ...(c.next ?? c.prior)!.names, ...(c.next ?? c.prior)!.classes]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  });
  const selected = $derived(comparison.find((c) => c.key === params.get('position')));
  const selectedFiling = $derived(
    dataset?.filings.find((f) => f.accession === params.get('filing') && f.cik === manager?.cik),
  );
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  $effect(() => {
    void params.get('q');
    void params.get('change');
    void params.get('concentration');
    void manager?.cik;
    void after?.id;
    void before?.id;
    limit = 25;
  });
  $effect(() => {
    const bundle = data.holdings,
      a = before,
      b = after;
    void retry;
    comparison = [];
    error = '';
    loading = false;
    if (!browser || !bundle || !a || !b || !comparable) return;
    const controller = new AbortController();
    let active = true;
    loading = true;
    Promise.all([
      reader.positions(bundle, a.id, controller.signal),
      reader.positions(bundle, b.id, controller.signal),
    ])
      .then(([left, right]) => compareHoldingsAsync(a, b, left, right, controller.signal))
      .then((value) => {
        if (active) comparison = value;
      })
      .catch(() => {
        if (active) error = 'The quarter evidence could not load or verify. Retry to try again.';
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
    const bundle = data.holdings,
      s = selected;
    void evidenceRetry;
    evidence = [];
    evidenceError = '';
    evidenceLoading = false;
    rowLimit = 12;
    if (!bundle || !s || !browser) return;
    const refs = [...(s.prior?.refs ?? []), ...(s.next?.refs ?? [])];
    const controller = new AbortController();
    let active = true;
    evidenceLoading = true;
    const pages = [...new Set(refs.map((r) => `${r.accession}/${Math.floor(r.index / 500)}`))];
    Promise.all(
      pages.map(async (key) => {
        const [accession, page] = key.split('/');
        return {
          accession,
          page: Number(page),
          rows: await reader.rows(bundle, accession, Number(page), controller.signal),
        };
      }),
    )
      .then((values) => {
        if (active)
          evidence = refs.map((ref) => {
            const found = values.find(
                (p) => p.accession === ref.accession && p.page === Math.floor(ref.index / 500),
              )!,
              row = found.rows[ref.index % 500];
            return { accession: ref.accession, row: row.row, fields: row.fields };
          });
      })
      .catch(() => {
        if (active) evidenceError = 'The source rows could not load or verify.';
      })
      .finally(() => {
        if (active) evidenceLoading = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  });
  $effect(() => {
    const bundle = data.holdings,
      id = selectedFiling?.accession;
    void filingRetry;
    filing = null;
    filingError = '';
    filingLoading = false;
    if (!browser || !bundle || !id) return;
    const controller = new AbortController();
    let active = true;
    filingLoading = true;
    reader
      .filing(bundle, id, controller.signal)
      .then((value) => {
        if (active) filing = value;
      })
      .catch(() => {
        if (active) filingError = 'The filing metadata could not load or verify.';
      })
      .finally(() => {
        if (active) filingLoading = false;
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
    if (changes.position || changes.filing) {
      await tick();
      const target = changes.filing ? filingElement : positionElement;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    }
  }
  function search(event: SubmitEvent) {
    event.preventDefault();
    navigate({
      q: String(new FormData(event.currentTarget as HTMLFormElement).get('q') ?? ''),
      position: null,
    });
  }
  const number = (s: string) => {
    const [whole, fraction] = s.split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
  };
  const quarter = (date: string) =>
    `Q${Math.ceil(Number(date.slice(5, 7)) / 3)} ${date.slice(0, 4)} · ${date}`;
  const percent = (p: number | null | undefined) =>
    p == null ? 'Unavailable' : `${p.toFixed(2)}%`;
  function exportComparison() {
    if (!data.holdings || !before || !after) return;
    const blob = new Blob(
        [
          JSON.stringify(
            {
              formatVersion: 1,
              release: data.holdings.manifest.release,
              before: before.id,
              after: after.id,
              method:
                'CUSIP + unit + option; exact quantities; unadjusted for corporate actions; reported-value concentrations, not total assets',
              cautions: [...before.cautions, ...after.cautions],
              comparisons: comparison,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `holdings-${manager?.cik}-${before.period}-${after.period}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<svelte:head
  ><title>Quarterly Holdings · Louder Than Words</title><meta
    name="description"
    content="Compare disclosed investment holdings across quarters, with exact quantities, amended filings and original SEC evidence."
  /></svelte:head
>
<div class="evidence-page holdings-page">
  <div class="kicker">
    <span>21 / Quarterly holdings</span><span>Positions, with perspective.</span>
  </div>
  <header>
    <p class="eyebrow">Follow the disclosed portfolio.</p>
    <h2>What changed<br /><em>between quarters?</em></h2>
    <p>
      Newly reported positions. Changing quantities. Growing concentrations. Compare the
      snapshots—and open the records behind each change.
    </p>
  </header>
  <aside class="notice">
    <strong>A snapshot is not a trading tape.</strong>
    <p>
      13F reports arrive after quarter-end. They omit many assets, short positions and sometimes
      confidential holdings. A missing position is not proof of a sale; a quantity increase can
      reflect a split, transfer or reporting change. This is not investment advice.
    </p>
  </aside>
  {#if data.holdingsError}<p role="alert">{data.holdingsError}</p>{/if}
  {#if dataset && data.holdings}
    <details class="coverage">
      <summary
        >{dataset.plan.managers.length} selected managers · {dataset.filings.length} filings · scope &
        sources</summary
      >
      <p>{dataset.plan.selection}</p>
      <p>
        Captured through {dataset.observedAt}. Publication windows contain filings, including late
        amendments—not necessarily holdings for that same window. The map counts managers by their
        latest collected cover-page state, not where investments or trades occurred.
      </p>
      <p>
        Positions match exact CUSIP + share/principal unit + put/call. Discretion-split rows within
        a report are added; managers are never added together. Class descriptions and all source
        rows remain visible. Values are normalized to dollars using the filing-date unit change on
        January 3, 2023.
      </p>
      <p>
        Small reportable holdings may be omitted under reporting rules. Concentration means share of
        reported table value, not total assets under management. Options/principal amounts are
        separate positions, not converted to ordinary shares.
      </p>
      <p>
        {dataset.changes.baselineAt
          ? `${dataset.changes.added.length} newly collected filings; ${dataset.changes.updated.length} changed since ${dataset.changes.baselineAt}. These are capture changes, not trades.`
          : 'First capture; no earlier collection-change history.'}
      </p>
      <a
        href={`${base}/data/holdings/releases/${data.holdings.manifest.release}/data.json`}
        download>Download collection index</a
      >{#each dataset.archives as a}<p>
          <a href={a.source.url} target="_blank" rel="noreferrer">SEC archive · {a.id} ↗</a><br
          /><small
            >{a.tables.find((t) => t.member === 'SUBMISSION.tsv')?.rows.toLocaleString()} submissions
            scanned · SHA-256 {a.source.hash}</small
          >
        </p>{/each}
    </details>
    <label class="manager-picker"
      >Reporting manager<select
        aria-label="Reporting manager"
        disabled={!ready}
        value={manager?.cik ?? ''}
        onchange={(e) =>
          navigate({
            manager: e.currentTarget.value,
            before: null,
            after: null,
            position: null,
            filing: null,
            q: null,
            change: null,
            concentration: null,
          })}
        ><option value="" disabled>Choose a manager</option>{#each managers as m}<option
            value={m.cik}>{m.name}</option
          >{/each}</select
      ></label
    >
    {#if !manager}<p class="empty">
        No selected reporting manager in this state/filter. This is a bounded collection, not
        evidence that no investors operate here.
      </p>
      <button onclick={() => navigate({ state: null, manager: null })}
        >Show all collected managers</button
      >{:else}
      <div class="manager-heading">
        <h3>{manager.name}</h3>
        <span
          >CIK {manager.cik} · {manager.city ?? 'City unspecified'}{manager.state
            ? `, ${manager.state}`
            : ''}</span
        >
      </div>
      <div class="quarters">
        <label
          >Earlier snapshot<select
            aria-label="Earlier snapshot"
            value={before?.period ?? ''}
            disabled={!ready}
            onchange={(e) =>
              navigate({ before: e.currentTarget.value, position: null, filing: null })}
            ><option value="" disabled>Choose earlier quarter</option>{#each snapshots as s}<option
                value={s.period}
                >{quarter(s.period)}{s.status !== 'reported' ? ` · ${s.status}` : ''}</option
              >{/each}</select
          ></label
        ><span aria-hidden="true">→</span><label
          >Later snapshot<select
            aria-label="Later snapshot"
            value={after?.period ?? ''}
            disabled={!ready}
            onchange={(e) =>
              navigate({ after: e.currentTarget.value, position: null, filing: null })}
            >{#each snapshots as s}<option value={s.period}
                >{quarter(s.period)}{s.status !== 'reported' ? ` · ${s.status}` : ''}</option
              >{/each}</select
          ></label
        >
      </div>
      <div class="snapshot-cards">
        {#each [before, after] as s}{#if s}<article>
              <span class="eyebrow">Holdings at {s.period}</span>
              <h4>
                {s.status === 'reported'
                  ? s.positions.toLocaleString()
                  : s.status === 'notice'
                    ? 'Reported elsewhere'
                    : 'Unresolved'}
              </h4>
              <p>
                {s.status === 'reported'
                  ? 'distinct reported positions'
                  : s.status === 'notice'
                    ? 'Notice—not an empty portfolio'
                    : 'Inspect the filing history below'}
              </p>
              <small>Public filings through {s.filedThrough}</small
              >{#if s.status === 'reported'}<div class="value">
                  ${number(s.value)}<small>reported table value</small>
                </div>
                <div class="concentration">
                  <div><span>Top 10 positions</span><strong>{percent(s.topTenWeight)}</strong></div>
                  <div class="bar">
                    <i style:width={`${Math.min(100, s.topTenWeight ?? 0)}%`}></i>
                  </div>
                  <small>Share of reported value, not total assets</small>
                </div>{/if}{#each [...s.issues, ...s.cautions] as issue}<p class="caution">
                  {issue}
                </p>{/each}
            </article>{/if}{/each}
      </div>
      {#if comparable}
        <section class="comparison" aria-busy={loading}>
          <div class="section-heading">
            <div>
              <span class="eyebrow">01 / Compare the snapshots</span>
              <h3>The reported changes</h3>
            </div>
            <button disabled={!ready || loading || !!error} onclick={exportComparison}
              >Export comparison ↓</button
            >
          </div>
          <div class="change-filters" aria-label="Position changes">
            <button
              class:active={!params.get('change')}
              aria-pressed={!params.get('change')}
              onclick={() => navigate({ change: null, position: null })}>All positions</button
            >{#each Object.entries(holdingChangeNames) as [key, label]}<button
                class:active={params.get('change') === key}
                aria-pressed={params.get('change') === key}
                onclick={() => navigate({ change: key, position: null })}
                >{label} <span>{comparison.filter((c) => c.change === key).length}</span></button
              >{/each}
          </div>
          <form class="search" onsubmit={search}>
            <label for="holding-search">Find an issuer or CUSIP</label>
            <div>
              <input
                id="holding-search"
                name="q"
                value={params.get('q') ?? ''}
                placeholder="Issuer name, security class or CUSIP"
              /><button disabled={!ready}>Search holdings</button>
            </div>
          </form>
          <label class="check"
            ><input
              type="checkbox"
              checked={params.get('concentration') === 'growing'}
              onchange={(e) =>
                navigate({
                  concentration: e.currentTarget.checked ? 'growing' : null,
                  position: null,
                })}
            /> Only positions with a growing share of reported value</label
          >
          <p class="small">
            Quantities are not split-adjusted. “Newly reported” and “no longer reported” describe
            disclosure differences, not confirmed purchases or exits. Concentration can change with
            market prices without any trade.
          </p>
          {#if loading}<p role="status">
              Loading and verifying both quarterly snapshots…
            </p>{:else if error}<p role="alert">{error}</p>
            <button onclick={() => retry++}>Retry quarter evidence</button>{:else}
            <p class="result-count" aria-live="polite">
              {filtered.length.toLocaleString()} matching positions · ordered by reported value
            </p>
            <div class="positions">
              {#each filtered.slice(0, limit) as c (c.key)}{@const p = (c.next ?? c.prior)!}<button
                  class="position-card"
                  class:selected={selected?.key === c.key}
                  aria-expanded={selected?.key === c.key}
                  onclick={() => navigate({ position: selected?.key === c.key ? null : c.key })}
                  ><div class="position-top">
                    <span class="badge" data-change={c.change}>{holdingChangeNames[c.change]}</span
                    ><span class="identity"
                      >{p.cusip} · {p.unit}{p.option ? ` · ${p.option}` : ''}</span
                    >
                  </div>
                  <h4>{p.names.join(' / ')}</h4>
                  <p class="small">{p.classes.join(' / ')}</p>
                  <div class="quantity">
                    <div>
                      <small>{before!.period}</small><strong
                        >{c.prior ? number(c.prior.quantity) : 'Not reported'}</strong
                      >
                    </div>
                    <span aria-hidden="true">→</span>
                    <div>
                      <small>{after!.period}</small><strong
                        >{c.next ? number(c.next.quantity) : 'Not reported'}</strong
                      >
                    </div>
                  </div>
                  <p class="delta">
                    {c.delta !== null
                      ? `${c.delta.startsWith('-') || c.delta === '0' ? '' : '+'}${number(c.delta)} ${p.unit === 'SH' ? 'shares' : 'principal amount'} as reported`
                      : 'Missing from one snapshot—not a known zero holding'}
                  </p>
                  <div class="weights">
                    <span>Reported-value share</span><strong
                      >{c.prior ? percent(c.priorWeight) : 'Not reported'} → {c.next
                        ? percent(c.nextWeight)
                        : 'Not reported'}</strong
                    >
                  </div>
                  <span class="inspect"
                    >{selected?.key === c.key ? 'Close position' : 'Inspect source rows'} ↗</span
                  ></button
                >{/each}
            </div>
            {#if !filtered.length}<p class="empty">
                No matching positions. Try another filter or issuer.
              </p>{/if}{#if filtered.length > limit}<button
                class="more"
                onclick={() => (limit += 25)}>Show 25 more positions</button
              >{/if}
          {/if}
        </section>
      {:else}<aside class="notice comparison-unavailable">
          <strong>No defensible quarter-to-quarter comparison for this selection.</strong>
          <p>
            Choose two resolved holdings snapshots in chronological order. A notice points to
            another reporting manager; it does not mean every prior holding was sold. Filing
            evidence remains available below.
          </p>
        </aside>{/if}
      {#if selected}<section
          class="position-evidence"
          bind:this={positionElement}
          tabindex="-1"
          aria-label="Position source evidence"
          in:fly={{ y: reduced ? 0 : 8, duration: reduced ? 0 : 180 }}
        >
          <div class="section-heading">
            <h3>Exact source rows</h3>
            <button onclick={() => navigate({ position: null })}>Close position ×</button>
          </div>
          <p>
            {(selected.next ?? selected.prior)!.names.join(' / ')} · {(selected.next ??
              selected.prior)!.cusip}
          </p>
          <p class="small">
            Each row keeps the filing, original TSV row number, discretion, included-manager
            references, voting authority and unrounded quantity string. Market-value units follow
            the filing date.
          </p>
          {#if evidenceLoading}<p role="status">
              Verifying original rows…
            </p>{:else if evidenceError}<p role="alert">{evidenceError}</p>
            <button onclick={() => evidenceRetry++}>Retry position evidence</button
            >{:else}{#each evidence.slice(0, rowLimit) as row}<details class="raw-row">
                <summary
                  >{row.accession} · row {row.row} · {row.fields.SSHPRNAMT}
                  {row.fields.SSHPRNAMTTYPE}{row.fields.PUTCALL
                    ? ` · ${row.fields.PUTCALL}`
                    : ''}</summary
                >
                <p>INFOTABLE.tsv · row {row.row} (excluding header)</p>
                <button onclick={() => navigate({ filing: row.accession })}
                  >Inspect filing context</button
                >
                <dl>
                  {#each Object.entries(row.fields) as [key, value]}<dt>{key}</dt>
                    <dd>{value || 'Not supplied'}</dd>{/each}
                </dl>
              </details>{/each}{#if evidence.length > rowLimit}<button
                onclick={() => (rowLimit += 12)}>Show 12 more source rows</button
              >{/if}{/if}
        </section>{/if}
      <section class="filing-history">
        <span class="eyebrow">02 / Keep the filing history</span>
        <h3>Originals, amendments & notices</h3>
        <p class="small">
          A restatement replaces the previous table. A new-holdings amendment adds entries.
          Superseded filings stay visible; their rows are not counted twice.
        </p>
        {#each snapshots as s}<h4>Holdings at {s.period}</h4>
          <div class="filing-chain">
            {#each s.filings as id}{@const f = dataset.filings.find(
                (f) => f.accession === id,
              )!}<button
                class="filing-card"
                class:active={selectedFiling?.accession === id}
                onclick={() => navigate({ filing: selectedFiling?.accession === id ? null : id })}
                ><span>{f.filed} · {f.form}</span><strong
                  >{f.amendment === 'original'
                    ? 'Original report'
                    : f.amendment === 'restatement'
                      ? 'Restatement'
                      : f.amendment === 'addition'
                        ? 'Added holdings'
                        : 'Unknown amendment'}{f.amendmentNo ? ` #${f.amendmentNo}` : ''}</strong
                ><small
                  >{id} · {s.activeFilings.includes(id)
                    ? 'Active in this snapshot'
                    : 'Superseded / historical'}{f.issues.length
                    ? ` · ${f.issues.length} source checks flagged`
                    : ''}</small
                ></button
              >{/each}
          </div>{/each}
      </section>
      {#if selectedFiling}<section
          class="filing-detail"
          aria-busy={filingLoading}
          bind:this={filingElement}
          tabindex="-1"
          aria-label="Filing source evidence"
        >
          <div class="section-heading">
            <h3>Filing context</h3>
            <button onclick={() => navigate({ filing: null })}>Close filing ×</button>
          </div>
          <p class="identity">
            {selectedFiling.accession} · filed {selectedFiling.filed} · holdings at {selectedFiling.period}
          </p>
          <a href={holdingFilingUrl(selectedFiling)} target="_blank" rel="noreferrer"
            >Open original SEC filing ↗</a
          >{#each selectedFiling.issues as issue}<p class="caution">
              {issue}
            </p>{/each}{#if filingLoading}<p role="status">
              Verifying filing metadata…
            </p>{:else if filingError}<p role="alert">{filingError}</p>
            <button onclick={() => filingRetry++}>Retry filing evidence</button>{:else if filing}<p>
              {filing.cover.fields.ADDITIONALINFORMATION ||
                'No additional cover-page explanation supplied.'}
            </p>
            <div class="manager-relations">
              <h4>Other managers reporting for this manager</h4>
              {#each filing.reportingFor as r}<p>
                  {r.fields.NAME} · {r.fields.CIK
                    ? `CIK ${r.fields.CIK}`
                    : `13F ${r.fields.FORM13FFILENUMBER || 'identifier not supplied'}`}
                </p>{:else}<p class="small">
                  None listed. This is distinct from managers included below.
                </p>{/each}
              <h4>Managers included in this report</h4>
              {#each filing.includedManagers as r}<p>
                  #{r.fields.SEQUENCENUMBER} · {r.fields.NAME}{r.fields.CIK
                    ? ` · CIK ${r.fields.CIK}`
                    : ''}
                </p>{:else}<p class="small">None listed.</p>{/each}
            </div>
            <details class="raw-row">
              <summary>Cover, summary and original field values</summary
              >{#each [filing.submission, filing.cover, filing.summary].filter(Boolean) as row}<dl>
                  {#each Object.entries(row!.fields) as [key, value]}<dt>{key}</dt>
                    <dd>{value || 'Not supplied'}</dd>{/each}
                </dl>{/each}
            </details>
            <details class="raw-pages">
              <summary
                >Download all captured information-table rows ({selectedFiling.rows.toLocaleString()})</summary
              >
              <p class="small">
                500 source rows per portable JSON page. Includes historical/unresolved evidence;
                these downloads do not imply it passed reconciliation.
              </p>
              {#each filing.rowPages as p, i}<a
                  href={`${base}/data/holdings/releases/${data.holdings.manifest.release}/${p.file}`}
                  download>Rows {i * 500 + 1}–{i * 500 + p.count} ↓</a
                >{:else}<p>No information-table rows in this filing.</p>{/each}
            </details>{/if}
        </section>{/if}
      <section class="connections">
        {#if manager?.cik === '0001336528'}
          <a href={`${base}/records/major-stakes/?q=${manager.cik}`}>Read this filer’s major-stake disclosures →</a>
          <p>Exact SEC filer CIK. Beneficial ownership schedules and quarterly managed holdings describe different reporting roles; amounts are not combined.</p>
        {/if}
        <span class="eyebrow">03 / Connected, not conflated</span>
        <h3>Follow a shared identifier</h3>
        <a href={`${base}/records/shared-investors/?manager=${manager.cik}`}>Explore this manager’s overlap across selected peer companies →</a>
        <p>Exact manager CIK. The shared-investor collection uses its own frozen holdings release and explicit company/security mappings; overlapping reports do not establish independent ownership or control.</p>
        {#if manager.cik === '0000019617'}<a
            href={`${base}/records/insiders/?issuer=${manager.cik}`}
            >Read this SEC entity’s insider disclosures →</a
          >
          <p>
            Exact CIK match. Here the company reports managed holdings; there it is an issuer named
            in ownership disclosures. Those are different roles—not proof that any listed holding is
            the company’s own investment.
          </p>{/if}{#if manager.state}<a href={`${base}/records/paycheck/?state=${manager.state}`}
            >Explore {manager.state} wage and employment context →</a
          >
          <p>
            Cover-page business geography only. Statewide earnings are not a return measure or an
            effect of this manager’s investments.
          </p>{/if}
      </section>
    {/if}
    <footer>
      <a
        href="https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets"
        target="_blank"
        rel="noreferrer">SEC Form 13F datasets ↗</a
      >
      <p>
        Local pipeline → immutable JSON → this explorer. No live trading feed, inferred intentions,
        operational-control claims or portfolio recommendations.
      </p>
    </footer>
  {/if}
</div>

<style>
  .holdings-page {
    --ink: #283e3b;
    --muted: #6b807d;
    --line: #dce5e1;
    --wash: #f0f5f1;
    color: var(--ink);
    background: #fbfdfb;
  }
  .kicker,
  .section-heading,
  .position-top,
  .weights {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .kicker,
  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted);
  }
  header {
    padding: 26px 0 16px;
  }
  header h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(48px, 5vw, 72px);
    line-height: 1;
    letter-spacing: -0.02em;
    margin: 14px 0 22px;
  }
  header em {
    font-style: normal;
    color: #678e7f;
  }
  header > p:last-child {
    font-size: 15px;
    max-width: 650px;
  }
  p {
    font-size: 13px;
    line-height: 1.75;
  }
  .small,
  small {
    font-size: 11px;
    line-height: 1.7;
    color: var(--muted);
  }
  small {
    display: block;
  }
  h3 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 29px;
    margin: 10px 0;
  }
  h4 {
    font-size: 15px;
    margin: 14px 0;
  }
  .notice {
    padding: 18px;
    background: var(--wash);
    border-left: 3px solid #8bab9c;
    margin: 12px 0 24px;
  }
  .notice p {
    font-size: 12px;
    margin-bottom: 0;
  }
  .coverage {
    border-block: 1px solid var(--line);
    padding: 16px 0;
    font-size: 12px;
  }
  .coverage p {
    font-size: 12px;
  }
  .coverage small {
    overflow-wrap: anywhere;
  }
  summary {
    cursor: pointer;
    line-height: 1.7;
  }
  a {
    color: #456f62;
    text-underline-offset: 4px;
    overflow-wrap: anywhere;
  }
  button,
  input,
  select {
    font: inherit;
  }
  button {
    cursor: pointer;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 10px 12px;
    background: #fff;
    color: var(--ink);
    transition:
      background 0.18s,
      border-color 0.18s,
      transform 0.18s;
  }
  button:hover {
    border-color: #7a9e8d;
    background: #f2f7f2;
  }
  button.active,
  button.selected {
    border-color: #628978;
    background: #e8f0e9;
  }
  button:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  button:focus-visible,
  a:focus-visible,
  select:focus-visible,
  input:focus-visible,
  summary:focus-visible {
    outline: 3px solid #638d7c;
    outline-offset: 3px;
  }
  select,
  input {
    max-width: 100%;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 12px;
    background: white;
    color: var(--ink);
    width: 100%;
    font-size: 12px;
  }
  label {
    font-size: 11px;
    color: var(--muted);
  }
  label select {
    display: block;
    margin-top: 8px;
  }
  .manager-picker {
    display: block;
    margin: 24px 0 20px;
  }
  .manager-heading span {
    font-size: 11px;
    color: var(--muted);
  }
  .manager-heading h3 {
    font-size: 30px;
  }
  .quarters {
    display: grid;
    grid-template-columns: 1fr 18px 1fr;
    align-items: end;
    gap: 12px;
    margin: 22px 0;
  }
  .quarters > span {
    padding-bottom: 12px;
  }
  .snapshot-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .snapshot-cards article {
    border: 1px solid var(--line);
    padding: 20px;
    border-radius: 5px;
    background: linear-gradient(150deg, #fff, #eff5ef);
  }
  .snapshot-cards h4 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 36px;
    margin: 12px 0 0;
  }
  .snapshot-cards article > p {
    margin: 4px 0 10px;
  }
  .value {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    margin: 20px 0;
    overflow-wrap: anywhere;
  }
  .value small {
    font-weight: 400;
  }
  .concentration > div:first-child {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    gap: 8px;
  }
  .concentration .bar {
    background: #d9e4db;
    height: 7px;
    border-radius: 8px;
    margin: 12px 0;
    overflow: hidden;
  }
  .bar i {
    display: block;
    background: #6f9580;
    height: 100%;
    transition: width 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .caution {
    background: #faf2e6;
    border-left: 2px solid #c5a779;
    padding: 10px;
    font-size: 11px !important;
  }
  .comparison,
  .filing-history,
  .connections {
    margin-top: 32px;
    border-top: 1px solid var(--line);
    padding-top: 22px;
  }
  .section-heading button {
    font-size: 11px;
  }
  .change-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 20px 0;
  }
  .change-filters button {
    font-size: 10px;
    padding: 9px;
  }
  .change-filters span {
    opacity: 0.7;
    margin-left: 4px;
  }
  .search > div {
    display: flex;
    gap: 8px;
    margin: 8px 0 14px;
  }
  .search button {
    white-space: nowrap;
    font-size: 11px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .check input {
    width: 16px;
    height: 16px;
    accent-color: #527862;
  }
  .result-count {
    font-size: 11px;
    color: var(--muted);
    margin: 24px 0 14px;
  }
  .positions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .position-card {
    text-align: left;
    padding: 16px;
    min-width: 0;
    content-visibility: auto;
    contain-intrinsic-size: auto 245px;
  }
  .position-card h4 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 23px;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  .position-top {
    align-items: start;
    flex-wrap: wrap;
    gap: 6px;
  }
  .badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: #edf2f0;
    padding: 5px 6px;
    border-radius: 3px;
  }
  .badge[data-change='new'],
  .badge[data-change='increased'] {
    background: #e5eee1;
    color: #41643e;
  }
  .badge[data-change='missing'],
  .badge[data-change='decreased'] {
    background: #f1e8e0;
    color: #795b3d;
  }
  .identity {
    font-size: 10px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .quantity {
    display: grid;
    grid-template-columns: 1fr 12px 1fr;
    gap: 8px;
    align-items: center;
    margin: 18px 0 0;
  }
  .quantity strong {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .quantity small {
    font-size: 9px;
  }
  .delta {
    font-size: 10px;
    color: var(--muted);
    min-height: 30px;
  }
  .weights {
    font-size: 9px;
    flex-wrap: wrap;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  .weights strong {
    font-size: 11px;
  }
  .inspect {
    font-size: 10px;
    display: block;
    color: #557a68;
    margin-top: 14px;
  }
  .more {
    display: block;
    margin: 22px auto;
    font-size: 12px;
  }
  .position-evidence,
  .filing-detail {
    padding: 22px;
    margin: 24px 0;
    background: #f0f5f1;
    border: 1px solid #ccdbd0;
    border-radius: 5px;
  }
  .raw-row {
    padding: 13px 0;
    border-bottom: 1px solid var(--line);
    font-size: 11px;
  }
  .raw-row dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 8px;
    background: #fff;
    padding: 14px;
  }
  .raw-row dt,
  .raw-row dd {
    overflow-wrap: anywhere;
    font-size: 10px;
    line-height: 1.7;
    margin: 0;
  }
  .raw-row dt {
    color: var(--muted);
  }
  .raw-row button {
    font-size: 10px;
  }
  .filing-chain {
    display: grid;
    gap: 8px;
  }
  .filing-card {
    text-align: left;
    display: grid;
    gap: 6px;
    font-size: 11px;
  }
  .filing-card strong {
    font-size: 14px;
  }
  .filing-card small {
    font-size: 10px;
  }
  .filing-history > h4 {
    margin-top: 24px;
    font-size: 12px;
  }
  .manager-relations p {
    font-size: 11px;
  }
  .raw-pages {
    font-size: 11px;
    margin-top: 16px;
  }
  .raw-pages a {
    display: inline-block;
    font-size: 10px;
    padding: 8px;
  }
  .connections a {
    display: block;
    font-size: 12px;
    margin: 18px 0 10px;
  }
  .connections p {
    font-size: 11px;
  }
  .empty {
    padding: 20px;
    background: var(--wash);
    font-size: 12px;
  }
  footer {
    margin-top: 30px;
    padding-top: 22px;
    border-top: 1px solid var(--line);
    font-size: 11px;
  }
  footer p {
    font-size: 11px;
  }
  [role='alert'] {
    padding: 15px;
    background: #f7eeee;
    color: #8a5353;
  }
  @media (max-width: 700px) {
    .kicker > span:last-child {
      display: none;
    }
    .quarters {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .quarters > span {
      display: none;
    }
    .snapshot-cards {
      gap: 8px;
    }
    .snapshot-cards article {
      padding: 12px;
    }
    .snapshot-cards h4 {
      font-size: 28px;
    }
    .snapshot-cards .eyebrow {
      font-size: 8px;
    }
    .value {
      font-size: 13px;
    }
    .concentration > div:first-child {
      flex-direction: column;
      gap: 4px;
    }
    .positions {
      grid-template-columns: 1fr;
    }
    .position-card {
      contain-intrinsic-size: auto 260px;
    }
    .search > div {
      flex-direction: column;
    }
    .section-heading {
      align-items: start;
      flex-wrap: wrap;
    }
    .position-evidence,
    .filing-detail {
      padding: 14px;
    }
    .raw-row dl {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .raw-row dd {
      margin-bottom: 10px;
    }
    .snapshot-cards article > p {
      font-size: 11px;
    }
    .manager-heading h3 {
      font-size: 26px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button,
    .bar i {
      transition: none;
    }
  }
</style>
