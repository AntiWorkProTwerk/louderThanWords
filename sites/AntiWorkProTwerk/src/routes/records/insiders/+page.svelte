<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    filterInsiders,
    insiderKinds,
    insiderKindNames,
    explainInsiderCode,
    insiderFilingUrl,
    type InsiderDetail,
  } from '$lib/civic/insiders';
  import { createInsiderReader } from '$lib/civic/insiders-repository';
  let { data } = $props();
  let ready = $state(false),
    reduced = $state(true),
    limit = $state(20),
    entryLimit = $state(12),
    retry = $state(0),
    loading = $state(false),
    error = $state(''),
    openRow = $state<string | null>(null),
    table = $state('transactions');
  let detail = $state.raw<InsiderDetail | null>(null),
    detailElement: HTMLElement | undefined = $state();
  const reader = createInsiderReader(fetch, base);
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const dataset = $derived(data.insiders?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filterKey = $derived(
    JSON.stringify(
      ['q', 'issuer', 'owner', 'state', 'form', 'kind', 'month', 'plan'].map((k) => [
        k,
        params.get(k) ?? '',
      ]),
    ),
  );
  const filtered = $derived(
    dataset ? filterInsiders(dataset, new URLSearchParams(JSON.parse(filterKey))) : [],
  );
  const selected = $derived(dataset?.filings.find((f) => f.accession === params.get('filing'))),
    issuer = $derived(dataset?.issuers.find((i) => i.cik === selected?.issuerCik));
  const entries = $derived(
    (detail?.entries ?? []).filter(
      (e) =>
        (table === 'holdings'
          ? e.kind === null
          : table === 'nonDerivative'
            ? e.table === 'NONDERIV_TRANS'
            : table === 'derivative'
              ? e.table === 'DERIV_TRANS'
              : e.kind !== null) &&
        (e.kind === null || !params.get('kind') || e.kind === params.get('kind')),
    ),
  );
  const months = $derived.by(() => {
    const result = new Map<string, number>();
    for (const f of filtered)
      result.set(f.filed.slice(0, 7), (result.get(f.filed.slice(0, 7)) ?? 0) + 1);
    return [...result].sort(([a], [b]) => a.localeCompare(b));
  });
  const maxMonth = $derived(Math.max(1, ...months.map(([, n]) => n)));
  $effect(() => {
    void filterKey;
    limit = 20;
  });
  $effect(() => {
    void table;
    void params.get('kind');
    void selected?.accession;
    entryLimit = 12;
    openRow = null;
  });
  $effect(() => {
    const bundle = data.insiders,
      accession = selected?.accession;
    void retry;
    detail = null;
    error = '';
    loading = false;
    table = selected?.form.startsWith('3') ? 'holdings' : 'transactions';
    if (!browser || !bundle || !accession) return;
    const controller = new AbortController();
    let active = true;
    loading = true;
    reader(bundle, accession, controller.signal)
      .then((value) => {
        if (active) detail = value;
      })
      .catch(() => {
        if (active) error = 'The filing evidence could not load or verify. Retry to try again.';
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
    if (changes.filing) {
      await tick();
      detailElement?.focus({ preventScroll: true });
      detailElement?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    }
  }
  function search(event: SubmitEvent) {
    event.preventDefault();
    navigate({
      q: String(new FormData(event.currentTarget as HTMLFormElement).get('q') ?? ''),
      filing: null,
    });
  }
  const planLabel = (flag: boolean | null) =>
    flag === true
      ? '10b5-1 checkbox: reported'
      : flag === false
        ? '10b5-1 checkbox: not checked'
        : '10b5-1 checkbox: unavailable';
  const fieldName = (name: string) =>
    ({
      SECURITY_TITLE: 'Security',
      TRANS_DATE: 'Transaction date',
      TRANS_SHARES: 'Securities acquired / disposed',
      TRANS_PRICEPERSHARE: 'Price per security',
      TRANS_TOTAL_VALUE: 'Transaction value',
      SHRS_OWND_FOLWNG_TRANS: 'Securities held afterward',
      CONV_EXERCISE_PRICE: 'Conversion / exercise price',
      UNDLYNG_SEC_TITLE: 'Underlying security',
      UNDLYNG_SEC_SHARES: 'Underlying securities',
      DIRECT_INDIRECT_OWNERSHIP: 'Direct / indirect ownership',
      NATURE_OF_OWNERSHIP: 'Ownership explanation',
      TRANS_ACQUIRED_DISP_CD: 'Acquired / disposed',
      EXCERCISE_DATE: 'Exercise date',
      EXERCISE_DATE: 'Exercise date',
      EXPIRATION_DATE: 'Expiration date',
    })[name] ?? name;
</script>

<svelte:head
  ><title>Insider Records · Louder Than Words</title><meta
    name="description"
    content="Read SEC insider disclosures with the transaction type, trading-plan checkbox and exact footnotes. Awards, tax withholding and sales are not the same story."
  /></svelte:head
>
<div class="evidence-page insiders-page">
  <div class="kicker"><span>26 / Insider records</span><span>The code. The context.</span></div>
  <header>
    <p class="eyebrow">A filing is a starting point.</p>
    <h2>Read the transaction.<br /><em>Not the headline.</em></h2>
    <p>
      A share award is not a cash purchase. Tax withholding is not an open-market sale. Follow what
      was actually reported—and the footnotes that explain it.
    </p>
  </header>
  <details class="notice">
    <summary>Disclosures, not investment signals</summary>
    <p>
      These are historical, as-filed records. They do not reveal an insider’s motives, predict
      returns, or establish unlawful trading. Amendments and co-reporting can describe the same
      underlying event.
    </p>
  </details>
  {#if data.insidersError}<p role="alert">{data.insidersError}</p>{/if}
  {#if dataset && data.insiders}
    <details class="coverage">
      <summary
        >{dataset.filings.length.toLocaleString()} filings · {dataset.issuers.length} issuers · scope
        & dates</summary
      >
      <p>{dataset.plan.selection}</p>
      <p>
        Archives: {dataset.archives.map((a) => a.quarter.toUpperCase()).join(' / ')}. Captured
        through {dataset.observedAt}. Archive membership follows SEC publication cutoffs, not the
        dates of transactions. A quarterly archive is not a live feed.
      </p>
      <p>
        Map labels use the issuer’s separately captured business-address state, not the reporting
        person’s residence, the place a trade occurred, or historical headquarters. Owner street
        addresses, postal codes and signatures are excluded.
      </p>
      <p>
        {dataset.changes.baselineAt
          ? `${dataset.changes.added.length} filings newly collected and ${dataset.changes.updated.length} changed since ${dataset.changes.baselineAt}. Changes can be source revisions, not new trades.`
          : 'First capture; no earlier source-change comparison yet.'}
      </p>
      <a
        href={`${base}/data/insiders/releases/${data.insiders.manifest.release}/data.json`}
        download>Download frozen collection index</a
      >
    </details>
    <div class="kind-guide" aria-label="Transaction explanations">
      {#each insiderKinds as kind}<button
          class:active={params.get('kind') === kind}
          aria-pressed={params.get('kind') === kind}
          disabled={!ready}
          onclick={() => navigate({ kind: params.get('kind') === kind ? null : kind })}
          ><span class={`kind-dot ${kind}`}></span>{insiderKindNames[kind]}</button
        >{/each}
    </div>
    <form class="search" onsubmit={search}>
      <label for="insider-search">Find an issuer, reporting person, CIK or accession</label>
      <div>
        <input
          id="insider-search"
          name="q"
          value={params.get('q') ?? ''}
          placeholder="Company, name, ticker or exact identifier"
        /><button type="submit" disabled={!ready}>Search insider records</button>
      </div>
    </form>
    <div class="filters">
      <label
        >Issuer<select
          aria-label="Insider issuer"
          value={params.get('issuer') ?? ''}
          disabled={!ready}
          onchange={(e) => navigate({ issuer: e.currentTarget.value, filing: null })}
          ><option value="">All collected issuers</option>{#each dataset.issuers as i}<option
              value={i.cik}>{i.name}</option
            >{/each}</select
        ></label
      >
      <label
        >Form<select
          aria-label="Ownership form"
          value={params.get('form') ?? ''}
          disabled={!ready}
          onchange={(e) => navigate({ form: e.currentTarget.value, filing: null })}
          ><option value="">Originals & amendments</option
          >{#each ['3', '3/A', '4', '4/A', '5', '5/A'] as form}<option value={form}
              >Form {form}{form.startsWith('3')
                ? ' · initial holdings'
                : form.startsWith('5')
                  ? ' · annual statement'
                  : ''}</option
            >{/each}</select
        ></label
      >
      <label
        >Filing-level plan disclosure<select
          aria-label="Trading-plan checkbox"
          value={params.get('plan') ?? ''}
          disabled={!ready}
          onchange={(e) => navigate({ plan: e.currentTarget.value })}
          ><option value="">All disclosures</option><option value="yes">Reported / checked</option
          ><option value="no">Not checked</option><option value="unknown">Not supplied</option
          ></select
        ></label
      >
    </div>
    <div class="result-heading">
      <p>{filtered.length.toLocaleString()} filings match · counts are not trade volume</p>
      <button
        disabled={!ready}
        onclick={() =>
          navigate({
            q: null,
            issuer: null,
            owner: null,
            state: null,
            form: null,
            kind: null,
            month: null,
            plan: null,
            filing: null,
          })}>Clear insider filters</button
      >
    </div>
    {#if params.get('owner')}<p class="owner-filter">
        Following reporting-owner CIK {params.get('owner')}.
        <button onclick={() => navigate({ owner: null })}>Clear person filter</button>
      </p>{/if}
    <div class="months" aria-label="Filings by filing month">
      {#each months as [month, count]}<button
          aria-label={`Filter filings submitted ${month}`}
          aria-pressed={params.get('month') === month}
          onclick={() => navigate({ month: params.get('month') === month ? null : month })}
          ><strong>{month}</strong><span><i style={`width:${(100 * count) / maxMonth}%`}></i></span
          ><small>{count}</small></button
        >{/each}
    </div>
    {#if params.get('filing') && !selected}<p class="empty" role="status">
        This accession is not in the collected archives. No filing details are guessed.
      </p>{/if}
    {#if selected}<section
        class="insider-detail"
        bind:this={detailElement}
        tabindex="-1"
        aria-label="Selected ownership filing"
        in:fly={{ y: 12, duration: reduced ? 0 : 220 }}
      >
        <div class="detail-top">
          <span>Form {selected.form} · filed {selected.filed}</span><button
            onclick={() => navigate({ filing: null })}>Close filing ×</button
          >
        </div>
        <h3>{selected.issuerName}</h3>
        <p class="identity">
          Issuer CIK {selected.issuerCik} · {selected.symbol ?? 'No trading symbol supplied'}<br
          />Accession {selected.accession}
        </p>
        <div class="owners">
          {#each selected.owners as owner}<article>
              <h4>{owner.name}</h4>
              <p>
                {owner.relationship}{owner.title ? ` · ${owner.title}` : ''}{owner.other
                  ? ` · ${owner.other}`
                  : ''}
              </p>
              <button onclick={() => navigate({ owner: owner.cik })}
                >Follow exact reporting-owner CIK {owner.cik} →</button
              >
            </article>{/each}
        </div>
        <p class="small">
          These are reporting persons on the filing, not a row-by-row allocation of securities to
          each co-filer. A name match alone never joins people.
        </p>
        <div class="filing-facts">
          <div>
            <span>Reported event date</span><strong>{selected.period ?? 'Not supplied'}</strong>
          </div>
          <div><span>Archive</span><strong>{selected.quarter.toUpperCase()}</strong></div>
          <div>
            <span>Table I transaction rows</span><strong
              >{selected.transactions.nonDerivative}</strong
            >
          </div>
          <div>
            <span>Table II transaction rows</span><strong>{selected.transactions.derivative}</strong
            >
          </div>
        </div>
        {#if selected.form.includes('/A')}<aside class="amendment-note">
            <strong>An amendment, not another assumed trade</strong>
            <p>
              Original submission date as reported: {selected.originalFiled ?? 'not supplied'}. The
              archive does not give an unambiguous original-accession link. This filing stays
              separate; amounts are not added to an assumed original.
            </p>
          </aside>{/if}
        <aside class="plan-note">
          <strong>{planLabel(selected.tradingPlan)}</strong>
          <p>
            {selected.tradingPlan === true
              ? 'The filing reports a transaction under an arrangement intended to meet Rule 10b5-1(c)’s affirmative-defense conditions. This is the filer’s disclosure, not independent verification. Read the footnotes to identify which transactions and adoption dates it describes.'
              : selected.tradingPlan === false
                ? 'The source checkbox is false / not checked. That alone does not establish that every transaction was unplanned. Read the filing and footnotes.'
                : 'The archive does not supply a usable checkbox value. Unknown is not “no trading plan.”'}
          </p>
        </aside>
        {#if !filtered.some((f) => f.accession === selected.accession)}<p role="status">
            This linked filing is outside the current list filters; its evidence remains open.
          </p>{/if}
        {#if loading}<p role="status">Verifying the filing and its footnotes…</p>{/if}{#if error}<p
            role="alert"
          >
            {error}
          </p>
          <button onclick={() => retry++}>Retry insider evidence</button>{/if}
        {#if detail}
          {#if detail.submission.fields.REMARKS}<details class="remarks">
              <summary>Filer’s remarks</summary>
              <p>{detail.submission.fields.REMARKS}</p>
            </details>{/if}
          <div class="section-heading">
            <span class="eyebrow">01 / Read the rows in context</span>
            <h4>
              {table === 'holdings'
                ? 'Reported holdings are not trades'
                : 'What kind of transaction was reported?'}
            </h4>
          </div>
          <div class="table-tabs" aria-label="Ownership evidence tables">
            {#each [['transactions', 'All transactions'], ['nonDerivative', 'Table I · non-derivative'], ['derivative', 'Table II · derivative'], ['holdings', 'Holdings, not transactions']] as [value, label]}<button
                class:active={table === value}
                aria-pressed={table === value}
                onclick={() => (table = value)}>{label}</button
              >{/each}
          </div>
          <p class="small">
            {table === 'holdings'
              ? 'Holdings describe a reported position; they are not counted as purchases. The transaction-kind filter does not apply to holdings.'
              : 'Transaction rows are not unique economic events. Exercise/conversion can produce related rows across both tables; co-filings and amendments can repeat disclosures. No combined cash-flow or profit total is calculated.'}
          </p>
          <ol class="insider-entries">
            {#each entries.slice(0, entryLimit) as entry (`${entry.table}/${entry.id}`)}<li>
                <div class="entry-top">
                  <span class={`kind-badge ${entry.kind ?? 'holding'}`}
                    >{entry.kind === null ? 'Reported holding' : insiderKindNames[entry.kind]}</span
                  ><span
                    >{entry.date ??
                      (entry.kind === null
                        ? 'Position, not a trade date'
                        : 'Date not supplied')}</span
                  >
                </div>
                <h5>{entry.security || 'Security title not supplied'}</h5>
                {#if entry.kind !== null}<p class="entry-explanation">
                    <strong
                      >Code {entry.code || 'not supplied'} · {explainInsiderCode(entry.code)
                        .label}</strong
                    ><br />{explainInsiderCode(entry.code).explanation}
                  </p>{/if}
                <p class="small">
                  {entry.table.startsWith('NONDERIV')
                    ? 'Table I / non-derivative'
                    : 'Table II / derivative'} · row identity {entry.id}
                </p>
                <dl class="entry-facts">
                  {#each ['TRANS_SHARES', 'TRANS_PRICEPERSHARE', 'TRANS_TOTAL_VALUE', 'TRANS_ACQUIRED_DISP_CD', 'CONV_EXERCISE_PRICE', 'UNDLYNG_SEC_TITLE', 'UNDLYNG_SEC_SHARES', 'SHRS_OWND_FOLWNG_TRANS', 'DIRECT_INDIRECT_OWNERSHIP', 'NATURE_OF_OWNERSHIP'] as key}{#if key in entry.fields.fields}<dt
                      >
                        {fieldName(key)}
                      </dt>
                      <dd>
                        {entry.fields.fields[key] ||
                          'Not supplied'}{#if key === 'TRANS_ACQUIRED_DISP_CD'}
                          <small>(A = acquired; D = disposed, not the transaction code above)</small
                          >{/if}
                      </dd>{/if}{/each}
                </dl>
                <p class="value-note">
                  Numeric cells are exact source values. A blank is not zero; price currency and
                  meaning may be explained in footnotes. No currency or market value is inferred.
                </p>
                <div class="linked-footnotes">
                  <h6>Read the linked explanation</h6>
                  {#if !entry.footnotes.length}<p>
                      No field-linked footnotes for this row. Other filing footnotes remain below.
                    </p>{/if}{#each [...new Set(entry.footnotes.map((n) => n.id))] as id}{@const note =
                      entry.footnotes.find((n) => n.id === id)!}
                    <blockquote>
                      <div>
                        <strong>{id}</strong><span
                          >{entry.footnotes
                            .filter((n) => n.id === id)
                            .map((n) => fieldName(n.field))
                            .join(' · ')}</span
                        >
                      </div>
                      <p>
                        {note.text ??
                          'This field references a footnote that is absent from the captured footnote table. Check the original filing.'}
                      </p>
                    </blockquote>{/each}
                </div>
                <button
                  class="source-toggle"
                  onclick={() =>
                    (openRow =
                      openRow === `${entry.table}/${entry.id}`
                        ? null
                        : `${entry.table}/${entry.id}`)}
                  >{openRow === `${entry.table}/${entry.id}` ? 'Hide' : 'Read'} exact source fields</button
                >
                {#if openRow === `${entry.table}/${entry.id}`}<div class="raw-row">
                    <p>{entry.table}.tsv · physical row {entry.fields.row} excluding the header</p>
                    <dl>
                      {#each Object.entries(entry.fields.fields) as [key, value]}<dt>{key}</dt>
                        <dd>{value || 'Not supplied'}</dd>{/each}
                    </dl>
                    <code>{entry.fields.hash}</code>
                  </div>{/if}
              </li>{/each}
          </ol>
          {#if !entries.length}<p class="empty" role="status">
              No rows match this table and transaction-kind filter. Check the other tables; absence
              here is not evidence that no holdings or activity exist.
            </p>{/if}
          {#if entries.length > entryLimit}<button onclick={() => (entryLimit += 12)}
              >Show 12 more evidence rows</button
            >{/if}
          <details class="all-footnotes">
            <summary>All {detail.footnotes.length} filing footnotes</summary>
            <p class="small">
              Preserved separately even when a reference is missing or no current row filter
              displays it.
            </p>
            {#each detail.footnotes as note}<blockquote>
                <strong>{note.fields.FOOTNOTE_ID}</strong>
                <p>{note.fields.FOOTNOTE_TXT}</p>
                <small>FOOTNOTES.tsv · row {note.row}</small>
              </blockquote>{/each}
          </details>
          <div class="connections">
            {#if selected.issuerCik === '0000789019'}
              <a href={`${base}/records/major-stakes/?issuer=${selected.issuerCik}`}>Read major-stake disclosures for this issuer →</a>
              <p>Exact issuer CIK; a separate disclosure system, not evidence that an insider transaction caused a large investor’s position to change.</p>
            {/if}
            <span class="eyebrow">02 / Follow the evidence</span>
            <h4>A shared identifier, not an assumed connection</h4>
            {#if ['0000789019','0000019617'].includes(selected.issuerCik)}
              <a href={`${base}/records/shared-investors/?company=${selected.issuerCik}&group=${selected.issuerCik === '0000019617' ? 'commercial-banks' : 'cloud-services'}`}>Explore this company’s shared institutional investors →</a>
              <p>Exact issuer CIK. Form 13F manager positions and insider transactions are separate disclosures, not evidence of coordinated decisions.</p>
            {/if}
            {#if selected.issuerCik === '0000019617'}
              <a href={`${base}/records/holdings/?manager=${selected.issuerCik}`}
                >Compare this SEC entity’s quarterly managed holdings →</a
              >
              <p>
                Exact CIK match, different reporting roles: this issuer also files as an investment
                manager. Managed holdings are not necessarily its own investments.
              </p>
            {/if}
            <button
              onclick={() =>
                navigate({
                  issuer: selected.issuerCik,
                  owner: null,
                  kind: null,
                  form: null,
                  plan: null,
                  month: null,
                  q: null,
                })}>Explore this issuer’s collected filings →</button
            ><a href={insiderFilingUrl(selected)} target="_blank" rel="noreferrer"
              >Open original SEC filing ↗</a
            ><a
              href={`${base}/data/insiders/releases/${data.insiders.manifest.release}/filings/${selected.accession}.json`}
              download>Download captured filing evidence</a
            >
            {#if issuer}<p>
                Issuer business-address geography: {issuer.city ?? 'city not supplied'}, {issuer.stateDescription ??
                  issuer.state ??
                  'state not supplied'} · captured {issuer.source.observedAt.slice(0, 10)}. This is
                not a reporting person’s home or the location of these transactions.
              </p>
              {#if issuer.state}<a href={`${base}/records/paycheck/?state=${issuer.state}`}
                  >Explore {issuer.state} wage and employment context →</a
                >
                <p class="small">
                  Regional context only. No claim that these transactions caused a wage or
                  employment change.
                </p>{/if}<a href={issuer.source.url} target="_blank" rel="noreferrer"
                >Official issuer profile · CIK {issuer.cik} ↗</a
              >{/if}
          </div>
        {/if}
      </section>{/if}
    <div class="insider-list" aria-label="Collected SEC ownership filings">
      {#each filtered.slice(0, limit) as filing (filing.accession)}<button
          class="insider-card"
          class:selected={selected?.accession === filing.accession}
          disabled={!ready}
          onclick={() => navigate({ filing: filing.accession })}
          ><div class="card-top">
            <span>{filing.filed} · Form {filing.form}</span><span>↗</span>
          </div>
          <h3>{filing.issuerName}</h3>
          <p>{filing.owners.map((o) => o.name).join(' / ')}</p>
          <div class="card-kinds">
            {#each [...new Set(filing.codes.map((c) => explainInsiderCode(c).kind))] as kind}<span
                class={kind}>{insiderKindNames[kind]}</span
              >{/each}{#if !filing.codes.length}<span
                >Holdings / filing without transaction rows</span
              >{/if}
          </div>
          <small
            >{filing.transactions.nonDerivative} Table I transaction rows · {filing.transactions
              .derivative} Table II rows</small
          ><small
            >{planLabel(filing.tradingPlan)}{filing.form.includes('/A')
              ? ' · amendment, not an added trade'
              : ''}</small
          ></button
        >{/each}
    </div>
    {#if !filtered.length}<p class="empty" role="status">
        No filings match this collected scope and filter. This is not a complete market-wide
        ownership search.
      </p>{/if}{#if filtered.length > limit}<button onclick={() => (limit += 20)}
        >Show 20 more filings</button
      >{/if}
    <footer>
      <a
        href="https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets"
        target="_blank"
        rel="noreferrer">SEC archive and methodology ↗</a
      >
      <p>
        Source facts stay separate from interpretation. No trading recommendations, motive scores or
        inferred wrongdoing.
      </p>
    </footer>
  {/if}
</div>

<style>
  .insiders-page {
    background: #fbfdff;
    --ink: #39465c;
    --muted: #738097;
    --line: #dce2eb;
    --wash: #f1f3f7;
    color: var(--ink);
  }
  .kicker,
  .detail-top,
  .card-top,
  .entry-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--muted);
  }
  .kicker,
  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
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
    color: #8d839f;
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
  .notice,
  .plan-note,
  .amendment-note {
    padding: 18px;
    background: #f1f0f5;
    border-left: 3px solid #b0a3ba;
    margin: 12px 0 24px;
  }
  .notice p,
  .plan-note p,
  .amendment-note p {
    font-size: 12px;
    margin-bottom: 0;
  }
  .amendment-note {
    background: #f8f2e9;
    border-color: #bfa385;
  }
  .coverage {
    border-block: 1px solid var(--line);
    padding: 16px 0;
    font-size: 12px;
  }
  .coverage summary {
    cursor: pointer;
  }
  .coverage p {
    font-size: 12px;
  }
  a {
    color: #5c6389;
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
    font-size: 12px;
    transition:
      background 0.15s,
      transform 0.15s;
  }
  button:hover {
    background: #eceef4;
  }
  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible,
  summary:focus-visible {
    outline: 2px solid #7a6e96;
    outline-offset: 3px;
  }
  .kind-guide,
  .table-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 24px 0;
  }
  .kind-guide button {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }
  .active {
    background: #e4e0ed !important;
    border-color: #9f93b2 !important;
  }
  .kind-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #9ba2ad;
  }
  .purchase {
    --tone: #648a7b;
  }
  .sale {
    --tone: #a07871;
  }
  .award {
    --tone: #8c7aab;
  }
  .taxExercise {
    --tone: #8298a3;
  }
  .exercise {
    --tone: #a28c64;
  }
  .gift {
    --tone: #a489a1;
  }
  .other,
  .holding {
    --tone: #91939e;
  }
  .kind-dot {
    background: var(--tone);
  }
  .search {
    margin: 24px 0 16px;
  }
  .search label,
  .filters label {
    display: block;
    font-size: 11px;
    color: var(--muted);
  }
  .search > div {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  input,
  select {
    min-width: 0;
    width: 100%;
    padding: 12px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--ink);
    font-size: 12px;
  }
  input {
    flex: 1;
  }
  .search button {
    white-space: nowrap;
    background: #4f5b73;
    color: #fff;
  }
  .filters {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 10px;
  }
  .filters select {
    margin-top: 6px;
  }
  .result-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin: 15px 0;
  }
  .result-heading p {
    font-size: 11px;
  }
  .result-heading button,
  .owner-filter button {
    font-size: 10px;
    background: transparent;
  }
  .months {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 24px;
  }
  .months button {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
  }
  .months button > span {
    height: 5px;
    flex: 1;
    background: #edf0f4;
  }
  .months i {
    height: 100%;
    display: block;
    background: #a6a0b8;
    transition: width 0.25s;
  }
  .months small {
    font-size: 10px;
  }
  .insider-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 20px 0;
  }
  .insider-card {
    display: block;
    text-align: left;
    padding: 18px;
    min-width: 0;
    border-color: var(--line);
    background: #fcfdff;
  }
  .insider-card:hover {
    transform: translateY(-2px);
  }
  .insider-card.selected {
    border-color: #9b8eaf;
    background: #f4f1f8;
  }
  .insider-card h3 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 24px;
    line-height: 1.1;
    margin: 15px 0 8px;
  }
  .insider-card p {
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .insider-card small {
    display: block;
    font-size: 10px;
  }
  .card-kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 14px 0;
  }
  .card-kinds span {
    border-left: 2px solid var(--tone, #aaa);
    background: #f0f2f6;
    padding: 4px 6px;
    font-size: 10px;
  }
  .insider-detail {
    padding: 24px;
    border: 1px solid #b6aec6;
    background: #faf9fc;
    margin: 24px 0;
    scroll-margin: 20px;
    outline: none;
  }
  .detail-top {
    font-size: 11px;
  }
  .detail-top button {
    font-size: 10px;
  }
  .insider-detail h3 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 34px;
    line-height: 1.1;
    margin: 18px 0 12px;
  }
  .identity {
    font-size: 11px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .owners {
    display: grid;
    gap: 10px;
    margin: 22px 0 8px;
  }
  .owners article {
    padding: 12px;
    border-left: 2px solid #c7c0d3;
    background: #f1eff6;
  }
  .owners h4 {
    font-size: 14px;
    margin: 0;
  }
  .owners p {
    font-size: 11px;
    margin: 4px 0;
  }
  .owners button {
    font-size: 10px;
    border: none;
    padding: 4px 0;
    background: transparent;
  }
  .filing-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    padding: 22px 0;
    border-block: 1px solid var(--line);
    margin: 22px 0;
  }
  .filing-facts span,
  .filing-facts strong {
    display: block;
  }
  .filing-facts span {
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 7px;
  }
  .filing-facts strong {
    font-size: 14px;
  }
  .section-heading {
    margin-top: 28px;
  }
  .section-heading h4,
  .connections h4 {
    font-size: 22px;
    line-height: 1.4;
    margin: 10px 0;
  }
  .table-tabs {
    margin: 18px 0;
    gap: 6px;
  }
  .table-tabs button {
    font-size: 10px;
  }
  .insider-entries {
    list-style: none;
    padding: 0;
    margin: 22px 0;
  }
  .insider-entries > li {
    border-top: 1px solid #ced3de;
    padding: 22px 0 28px;
  }
  .kind-badge {
    border-left: 3px solid var(--tone);
    padding: 5px 8px;
    background: #ecebf2;
    font-size: 10px;
  }
  .entry-top {
    font-size: 10px;
  }
  .insider-entries h5 {
    font-size: 21px;
    line-height: 1.35;
    margin: 17px 0 12px;
  }
  .entry-explanation {
    font-size: 12px;
    line-height: 1.8;
  }
  .entry-facts,
  .raw-row dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
    gap: 9px 16px;
    font-size: 11px;
    line-height: 1.6;
    padding: 16px;
    background: #f1f1f5;
  }
  .entry-facts dt,
  .raw-row dt {
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .entry-facts dd,
  .raw-row dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .entry-facts small {
    font-size: 10px;
    display: block;
  }
  .value-note {
    font-size: 10px;
    color: var(--muted);
    border-left: 2px solid #c4bacd;
    padding-left: 12px;
  }
  .linked-footnotes h6 {
    font-size: 12px;
    margin: 24px 0 8px;
  }
  .linked-footnotes > p {
    font-size: 11px;
  }
  .linked-footnotes blockquote,
  .all-footnotes blockquote {
    margin: 12px 0;
    padding: 14px 16px;
    border-left: 3px solid #b8abc9;
    background: #efecf3;
  }
  .linked-footnotes blockquote > div {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .linked-footnotes blockquote span {
    font-size: 10px;
    color: var(--muted);
  }
  blockquote strong {
    font-size: 11px;
  }
  blockquote p {
    font-size: 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .source-toggle {
    font-size: 10px;
  }
  .raw-row {
    padding: 12px 0;
    font-size: 10px;
  }
  .raw-row p {
    font-size: 10px;
  }
  .raw-row code {
    font-size: 10px;
    overflow-wrap: anywhere;
  }
  .all-footnotes,
  .remarks {
    padding: 16px 0;
    border-block: 1px solid var(--line);
    font-size: 12px;
    margin: 16px 0;
  }
  .all-footnotes summary,
  .remarks summary {
    cursor: pointer;
  }
  .connections {
    border-top: 1px solid var(--line);
    margin-top: 28px;
    padding-top: 24px;
  }
  .connections a,
  .connections button {
    display: block;
    font-size: 12px;
    margin: 14px 0;
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
    border-top: 1px solid var(--line);
    margin-top: 28px;
    padding: 20px 0;
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
    .kicker {
      font-size: 8px;
    }
    .kicker > span:last-child {
      display: none;
    }
    .filters {
      grid-template-columns: 1fr;
    }
    .search > div {
      flex-direction: column;
    }
    .search button {
      white-space: normal;
    }
    .insider-list {
      grid-template-columns: 1fr;
    }
    .insider-detail {
      padding: 16px;
    }
    .insider-detail h3 {
      font-size: 28px;
    }
    .months {
      grid-template-columns: repeat(2, 1fr);
    }
    .result-heading {
      align-items: flex-start;
    }
    .entry-top {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .entry-facts,
    .raw-row dl {
      grid-template-columns: 1fr;
      padding: 12px;
      gap: 5px;
    }
    .entry-facts dd,
    .raw-row dd {
      margin-bottom: 9px;
    }
    .linked-footnotes blockquote > div {
      display: block;
    }
    .linked-footnotes blockquote span {
      display: block;
      margin-top: 6px;
    }
    .filing-facts {
      gap: 15px;
    }
    .insider-entries h5 {
      font-size: 19px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button,
    .months i {
      transition: none;
    }
    .insider-card:hover {
      transform: none;
    }
  }
</style>
