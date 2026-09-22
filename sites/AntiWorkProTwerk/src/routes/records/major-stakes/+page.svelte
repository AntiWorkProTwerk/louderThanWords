<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    stakeSelection,
    stakeComparison,
    stakeFilingUrl,
    type StakeDetail,
    type StakeFiling,
    type StakeSeries,
  } from '$lib/civic/major-stakes';
  import { readStakeDetail } from '$lib/civic/major-stakes-repository';
  let { data } = $props();
  let ready = $state(false),
    reduced = $state(true),
    query = $state(''),
    limit = $state(12),
    fieldLimit = $state(12),
    paragraphLimit = $state(4),
    retry = $state(0),
    loading = $state(false),
    error = $state('');
  let detail = $state.raw<StakeDetail | null>(null),
    detailElement: HTMLElement | undefined = $state(),
    trigger: HTMLButtonElement | undefined;
  const dataset = $derived(data.majorStakes?.data),
    params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filtered = $derived(
    dataset
      ? stakeSelection(dataset, params).sort((a, b) =>
          Date.parse(file(b.filings.at(-1)!)!.accepted) - Date.parse(file(a.filings.at(-1)!)!.accepted),
        )
      : [],
  );
  const selected = $derived(filtered.find((s) => s.id === params.get('series'))),
    history = $derived(selected?.filings.map((id) => file(id)!) ?? []);
  const current = $derived(
    params.get('filing')
      ? history.find((f) => f.accession === params.get('filing'))
      : history.at(-1),
  );
  const person = $derived(
    params.get('reporter')
      ? current?.reporters.find((r) => r.id === params.get('reporter'))
      : current?.reporters[0],
  );
  const index = $derived(
      current ? history.findIndex((f) => f.accession === current.accession) : -1,
    ),
    prior = $derived(index > 0 ? history[index - 1] : undefined);
  const comparison = $derived(prior && current ? stakeComparison(prior, current) : null),
    delta = $derived(comparison?.values.find((v) => v.id === person?.id));
  const issuer = $derived(dataset?.issuers.find((i) => i.cik === selected?.issuerCik));
  const purpose = $derived(
    detail?.fields.find(
      (f) => f.path.endsWith('.transactionPurpose') || f.path.endsWith('.certifications'),
    ),
  );
  const paragraphs = $derived(purpose?.text.split(/\n\s*\n/).filter(Boolean) ?? []);
  const earlierPurpose = $derived(
    history
      .slice(0, index)
      .filter((f) => f.purpose === '13d-purpose' || f.purpose === '13g-certification')
      .at(-1),
  );
  const comments = $derived(
    person
      ? (detail?.fields.filter(
          (f) =>
            f.label === `${person.name} · comments` ||
            f.label === `${person.name} · commentContent`,
        ) ?? [])
      : [],
  );
  const chart = $derived(
    history.map((f, i) => ({
      file: f,
      x: history.length > 1 ? 35 + (i * 470) / (history.length - 1) : 270,
      y:
        f.reporters.find((r) => r.id === person?.id)?.percent === null ||
        f.reporters.find((r) => r.id === person?.id)?.percent === undefined
          ? null
          : 110 - Number(f.reporters.find((r) => r.id === person?.id)!.percent) * 0.9,
    })),
  );
  const paths = $derived(
    chart.slice(1).flatMap((p, i) => {
      const a = chart[i],
        v = stakeComparison(a.file, p.file).values.find((v) => v.id === person?.id);
      return a.y !== null &&
        p.y !== null &&
        v?.percentagePointDelta !== null &&
        v?.percentagePointDelta !== undefined
        ? [`M ${a.x} ${a.y} L ${p.x} ${p.y}`]
        : [];
    }),
  );
  const shortForm = (f: StakeFiling) => f.form.replace('SCHEDULE ', '');
  function file(id: string) {
    return dataset?.filings.find((f) => f.accession === id);
  }
  const quantity = (v: string | null) => {
    if (v === null) return 'Not supplied';
    const [whole, fraction] = v.split('.');
    return (
      whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction)
    );
  };
  const signed = (v: string | null | undefined) =>
    v === null || v === undefined
      ? 'Not comparable'
      : `${v.startsWith('-') || v === '0' ? '' : '+'}${quantity(v)}`;
  onMount(() => {
    ready = true;
    const m = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  });
  $effect(() => {
    query = params.get('q') ?? '';
    void params.get('issuer');
    void params.get('state');
    void params.get('form');
    void params.get('initial');
    limit = 12;
  });
  function navigate(changes: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [k, v] of Object.entries(changes))
      v === null ? url.searchParams.delete(k) : url.searchParams.set(k, v);
    return goto(url, { noScroll: true, keepFocus: true });
  }
  function filters(changes: Record<string, string | null>) {
    return navigate({ ...changes, series: null, filing: null, reporter: null });
  }
  async function open(s: StakeSeries, event: MouseEvent) {
    trigger = event.currentTarget as HTMLButtonElement;
    await navigate({ series: s.id, filing: null, reporter: null });
    await tick();
    detailElement?.focus({ preventScroll: true });
    detailElement?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  }
  async function close() {
    await navigate({ series: null, filing: null, reporter: null });
    await tick();
    trigger?.focus();
  }
  $effect(() => {
    const bundle = data.majorStakes,
      accession = current?.accession;
    void retry;
    detail = null;
    loading = false;
    error = '';
    paragraphLimit = 4;
    fieldLimit = 12;
    if (!browser || !bundle || !accession) return;
    const controller = new AbortController();
    let active = true;
    loading = true;
    readStakeDetail(fetch, bundle, accession, base, controller.signal)
      .then((v) => {
        if (active) detail = v;
      })
      .catch(() => {
        if (active) error = 'The filing evidence could not load or verify.';
      })
      .finally(() => {
        if (active) loading = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  });
  function download() {
    if (!dataset || !selected || !data.majorStakes) return;
    const value = {
        formatVersion: 1,
        release: data.majorStakes.manifest.release,
        scope: dataset.plan,
        series: selected,
        history,
        selectedFiling: current?.accession,
        selectedReporter: person?.id,
        comparison,
        method:
          'Reported disclosures, not trades. Co-reporters may describe the same shares and are never added together. Missing fields and reporters are not zeros.',
      },
      url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'ownership-disclosure-history.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<svelte:head
  ><title>Major-stake disclosures · louderthanwords.fyi</title><meta
    name="description"
    content="Read large-ownership disclosures, follow amendments and inspect the investor’s stated purpose without assuming a takeover."
  /></svelte:head
>
<div class="stakes-page">
  <div class="kicker">
    <span>27 / Major-stake disclosures</span><span>Read the position. Keep the context.</span>
  </div>
  <header>
    <p class="eyebrow">An ownership disclosure is a starting point.</p>
    <h2>A larger stake.<br /><em>What does the filing say?</em></h2>
    <p>
      Follow newly filed ownership schedules and their amendments. See the reported position, the
      people behind it, and the investor’s own explanation.
    </p>
  </header>
  <aside class="notice">
    <strong>A new filing is not necessarily a new purchase.</strong>
    <p>
      Schedules 13D and 13G disclose covered beneficial ownership. Changes can reflect
      reorganizations, voting arrangements or a different share count—not just trades. Co-reporters
      may describe the same shares. Their stakes are never added together here, and a filing is not
      proof of a takeover.
    </p>
  </aside>
  {#if data.majorStakesError}<p role="alert">{data.majorStakesError}</p>{/if}
  {#if dataset && data.majorStakes}
    <div class="scope-stats">
      <div><strong>{dataset.issuers.length}</strong><span>selected companies</span></div>
      <div>
        <strong>{dataset.filings.filter((f) => !f.form.endsWith('/A')).length}</strong><span
          >initial schedules</span
        >
      </div>
      <div>
        <strong>{dataset.filings.filter((f) => f.form.endsWith('/A')).length}</strong><span
          >amendments</span
        >
      </div>
    </div>
    <details class="coverage">
      <summary
        >{dataset.filings.length} filings · {dataset.series.length} disclosure histories · scope & sources</summary
      >
      <p>{dataset.plan.selection}</p>
      <p>
        Filed {dataset.plan.from} through {dataset.plan.through}. Captured through {dataset.observedAt}.
        Event dates are recorded separately and can precede this filing window. Historical index
        pages overlapping this window are included; there is no first-N truncation.
      </p>
      <p>
        Histories match exact issuer CIK, filing-entity CIK and the same set of CUSIPs. An explicit
        reporter CIK is preferred; without one, a reporter’s exact normalized name is linked only
        within that filing entity. Names are not used to infer corporate families. Multiple reported
        CUSIPs are not split into invented class-level stakes.
      </p>
      <p>
        13D Item 4 and 13G Item 10 are shown as filed. An amendment may omit previously stated
        terms. Incorporated exhibits and earlier filings can add important context; this is not a
        reconstruction of every effective legal term.
      </p>
      <p>
        {dataset.changes.baselineAt
          ? `${dataset.changes.added.length} newly collected filings and ${dataset.changes.updated.length} changed source/projection records since ${dataset.changes.baselineAt}. These are collection changes, not trades.`
          : 'First collection baseline; no earlier capture comparison.'}
      </p>
      <p>
        {dataset.exclusions.length} indexed filings excluded because the XML names a different subject
        issuer. The map counts covered companies once by captured business-address state, not investor
        residences, investment destinations or ownership percentages.
      </p>
      <a
        href={`${base}/data/major-stakes/releases/${data.majorStakes.manifest.release}/data.json`}
        download>Download collection index</a
      >
      <p>
        <a
          href="https://www.investor.gov/introduction-investing/investing-basics/glossary/schedules-13d-and-13g"
          target="_blank"
          rel="noreferrer">SEC explanation of beneficial-ownership reports ↗</a
        >
      </p>
    </details>
    <form
      class="search"
      onsubmit={(e) => {
        e.preventDefault();
        void filters({ q: query.trim() || null });
      }}
    >
      <label
        >Find a company or reporting person<input
          aria-label="Find a company or reporting person"
          bind:value={query}
          placeholder="Name, ticker, CIK or CUSIP"
        /></label
      ><button disabled={!ready}>Search disclosures</button>
    </form>
    <div class="filters">
      <label
        >Company<select
          aria-label="Stake company"
          value={params.get('issuer') ?? ''}
          disabled={!ready}
          onchange={(e) => filters({ issuer: e.currentTarget.value || null })}
          ><option value="">All selected companies</option>{#each dataset.issuers as i}<option
              value={i.cik}>{i.name}</option
            >{/each}</select
        ></label
      ><label
        >Schedule<select
          aria-label="Schedule type"
          value={params.get('form') ?? ''}
          disabled={!ready}
          onchange={(e) => filters({ form: e.currentTarget.value || null })}
          ><option value="">13D and 13G</option><option value="13D">Schedule 13D</option><option
            value="13G">Schedule 13G</option
          ></select
        ></label
      >
    </div>
    <label class="check"
      ><input
        type="checkbox"
        checked={params.get('initial') === '1'}
        onchange={(e) => filters({ initial: e.currentTarget.checked ? '1' : null })}
      />Histories with a collected initial schedule</label
    >
    <div class="section-heading">
      <p>
        {filtered.length} disclosure histories{params.get('state')
          ? ` · company state ${params.get('state')}`
          : ''}
      </p>
      <button
        onclick={() => filters({ q: null, issuer: null, form: null, initial: null, state: null })}
        >Clear disclosure filters</button
      >
    </div>
    {#if !filtered.length}<p class="empty">
        No histories match this bounded collection. This does not mean no large shareholders exist
        in that company or state.
      </p>{/if}
    <div class="series-list">
      {#each filtered.slice(0, limit) as s (s.id)}{@const latest = file(
          s.filings.at(-1)!,
        )!}{@const owner = latest.reporters[0]}<button
          class="stake-card"
          class:selected={selected?.id === s.id}
          disabled={!ready}
          onclick={(e) => open(s, e)}
          ><div class="card-top">
            <span>{latest.issuerName}</span><span>{shortForm(latest)}</span>
          </div>
          <h3>{owner.name}</h3>
          <p>
            {latest.reporters.length > 1
              ? `First listed reporter · ${latest.reporters.length - 1} co-reporters shown separately`
              : 'One listed reporting person'}
          </p>
          <div class="card-bottom">
            <span
              ><strong>{owner.percent === null ? '—' : `${owner.percent}%`}</strong><small
                >this reporter’s stated share of class</small
              ></span
            ><span
              >{s.filings.length} collected filing{s.filings.length === 1 ? '' : 's'}<br /><small
                >Latest filed {latest.filed}</small
              ></span
            >
          </div>
          <small
            >{s.initialSchedules.length
              ? 'Includes an initial schedule—not proof of a new purchase'
              : 'Starts with an amendment; earlier history is outside this collection'}</small
          ></button
        >{/each}
    </div>
    {#if filtered.length > limit}<button class="more" onclick={() => (limit += 12)}
        >Show more disclosure histories</button
      >{/if}
    {#if selected && issuer}<section
        class="stake-detail"
        tabindex="-1"
        bind:this={detailElement}
        aria-label="Ownership disclosure history"
        in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 200 }}
      >
        <div class="section-heading">
          <span class="eyebrow">Follow the amendments</span><button onclick={close}
            >Close disclosure history</button
          >
        </div>
        <h3>{issuer.name}</h3>
        <p>
          Issuer CIK {issuer.cik} · {selected.securityClass}<br />CUSIP{selected.cusips.length === 1
            ? ''
            : 's'}
          {selected.cusips.join(' / ') || 'not supplied'} · Filing entity CIK {selected.filerCik}
        </p>
        {#each selected.issues as issue}<p class="caution">{issue}</p>{/each}
        <div class="timeline" aria-label="Filings in acceptance order">
          {#each history as f}<button
              class:active={current?.accession === f.accession}
              aria-pressed={current?.accession === f.accession}
              onclick={() => navigate({ filing: f.accession, reporter: null })}
              ><span class="timeline-dot" aria-hidden="true"></span><small>Filed {f.filed}</small
              ><strong
                >{shortForm(f)}{f.form.endsWith('/A')
                  ? ` · amendment ${f.amendmentNo ?? 'unspecified'}`
                  : ' · initial schedule'}</strong
              ><small>Event {f.event}</small></button
            >{/each}
        </div>
        {#if current}<div class="filing-heading" aria-live="polite">
            <h4>
              {shortForm(current)} · {current.form.endsWith('/A')
                ? 'Amendment'
                : 'Initial schedule'}
            </h4>
            <p>
              Filed {current.filed} · reported event {current.event}<br />Accession {current.accession}
            </p>
          </div>
          <div class="filing-links">
            <a href={stakeFilingUrl(current)} target="_blank" rel="noreferrer"
              >Official SEC filing & exhibits ↗</a
            ><a
              href={`${base}/data/major-stakes/releases/${data.majorStakes.manifest.release}/filings/${current.accession}.json`}
              download>Download filing evidence</a
            ><button onclick={download}>Download history comparison</button>
          </div>
          <label
            >Reporting person<select
              aria-label="Reporting person"
              value={person?.id ?? ''}
              onchange={(e) => navigate({ reporter: e.currentTarget.value })}
              ><option value="" disabled>Choose a reporter</option
              >{#each current.reporters as p}<option value={p.id}>{p.name}</option>{/each}</select
            ></label
          >
          <p class="identity-note">
            {person?.cik
              ? `Explicit reporting-person CIK ${person.cik}.`
              : 'No explicit reporting-person CIK for this selection; matching is limited to the exact name within this filing entity.'}
            Co-reporters can describe overlapping shares. Do not sum their quantities or percentages.
          </p>
          {#if person}<div class="position-stats">
              <div>
                <small>Reported amount</small><strong>{quantity(person.quantity)}</strong><span
                  >shares / units as filed</span
                >
              </div>
              <div>
                <small>Reported percent of class</small><strong
                  >{person.percent === null ? 'Not supplied' : `${person.percent}%`}</strong
                ><span>not added to other reporters</span>
              </div>
            </div>
            <div class="ownership-chart">
              <h4>The same reporter, across filings</h4>
              <svg
                viewBox="0 0 540 144"
                role="img"
                aria-label="Reported percentage by filing sequence, from zero to one hundred percent. Gaps are not connected; the filing buttons and selected values provide the text alternative."
                ><line x1="35" y1="20" x2="505" y2="20" /><line
                  x1="35"
                  y1="65"
                  x2="505"
                  y2="65"
                /><line x1="35" y1="110" x2="505" y2="110" /><text x="2" y="24">100</text><text
                  x="10"
                  y="69">50</text
                ><text x="16" y="114">0</text>{#each paths as path}<path
                    d={path}
                  />{/each}{#each chart as p}{#if p.y !== null}<circle
                      cx={p.x}
                      cy={p.y}
                      r={p.file.accession === current.accession ? 5 : 3}
                      class:current={p.file.accession === current.accession}
                      ><title
                        >{p.file.filed}: {p.file.reporters.find((r) => r.id === person.id)
                          ?.percent}% reported</title
                      ></circle
                    >{/if}{/each}<text x="35" y="137">Earlier filings</text><text x="432" y="137"
                  >Later filings</text
                ></svg
              >
              <p>
                Equal spacing means filing sequence, not elapsed time. Only comparable adjacent
                observations are connected. Percentages can change when the company’s share count
                changes.
              </p>
            </div>
            <div class="change">
              <h4>Compared with the prior collected filing</h4>
              {#if prior && delta}<p>{prior.filed} → {current.filed} · {person.name}</p>
                <div>
                  <span
                    ><strong>{signed(delta.quantityDelta)}</strong><small
                      >change in reported amount</small
                    ></span
                  ><span
                    ><strong>{signed(delta.percentagePointDelta)}</strong><small
                      >percentage-point change</small
                    ></span
                  >
                </div>
                {#each delta.reasons as reason}<p class="caution">
                    {reason}
                  </p>{/each}{#if delta.quantityDelta !== null}<p>
                    This is a disclosure difference, not an inferred purchase or sale. Read the
                    notes and any reporting changes below.
                  </p>{/if}{:else}<p>
                  No earlier collected filing for comparison. This is not a zero starting position.
                </p>{/if}{#if comparison?.notRepeated.length}<p>
                  Not repeated in this filing: {comparison.notRepeated
                    .map((p) => p.name)
                    .join('; ')}. Missing names are not treated as exited positions.
                </p>{/if}
            </div>
            <details class="powers">
              <summary>Voting, disposal and reporting flags</summary>
              <dl>
                <dt>Sole voting power</dt>
                <dd>{quantity(person.soleVoting)}</dd>
                <dt>Shared voting power</dt>
                <dd>{quantity(person.sharedVoting)}</dd>
                <dt>Sole dispositive power</dt>
                <dd>{quantity(person.soleDispositive)}</dd>
                <dt>Shared dispositive power</dt>
                <dd>{quantity(person.sharedDispositive)}</dd>
                <dt>Aggregate excludes certain shares</dt>
                <dd>
                  {person.excludesShares === null
                    ? 'Not supplied'
                    : person.excludesShares
                      ? 'Checked'
                      : 'Not checked'}
                </dd>
                <dt>Group checkbox</dt>
                <dd>{person.group ?? 'Not supplied'}</dd>
                <dt>Reporter type codes</dt>
                <dd>{person.types.join(', ') || 'Not supplied'}</dd>
                <dt>Source-of-funds codes</dt>
                <dd>{person.fundTypes.join(', ') || 'Not supplied in this form'}</dd>
              </dl>
              <p>
                Dispositive power is the reported power to dispose of securities. Shared and sole
                powers are source fields, not extra holdings to add to the aggregate.
              </p>
            </details>
          {:else}<p class="empty">
              That reporter is not listed in this selected filing. Choose one of its listed
              reporting persons.
            </p>{/if}
          {#each current.issues as issue}<p class="caution">{issue}</p>{/each}
          {#if current.belowThreshold === true}<p class="caution">
              The filing checks ownership of five percent or less. That threshold notice does not
              establish why the reported position changed.
            </p>{/if}
          {#if current.rules.length}<p>
              Stated filing basis: {current.rules.join(' / ')}. Read the certification rather than
              assuming an investment strategy.
            </p>{/if}
          <section class="source-text" aria-busy={loading}>
            <h4>
              {current.form.includes('13D') ? 'The stated purpose' : 'The filer’s certification'}
            </h4>
            {#if loading}<p role="status">Loading verified filing text…</p>{/if}{#if error}<p
                role="alert"
              >
                {error}
              </p>
              <button onclick={() => retry++}>Retry filing evidence</button>{/if}
            {#if detail}
              {#each comments as comment}<aside class="reporter-note">
                  <strong>{person?.name} · source explanation</strong>
                  <p>{comment.text}</p>
                  <small>{comment.path}</small>
                </aside>{/each}
              {#if purpose}<p class="source-label">
                  {purpose.label} · verbatim field, XML entities decoded
                </p>
                <div class="statement">
                  {#each paragraphs.slice(0, paragraphLimit) as paragraph}<p>{paragraph}</p>{/each}
                </div>
                {#if paragraphs.length > paragraphLimit}<button
                    onclick={() => (paragraphLimit = paragraphs.length)}
                    >Read the complete source field ({paragraphs.length} paragraphs)</button
                  >{/if}<small class="locator">{purpose.path}</small>{:else}<p class="not-restated">
                  {current.form.endsWith('/A')
                    ? 'This amendment does not restate the purpose or certification field. An empty field does not erase the earlier disclosure.'
                    : 'No purpose or certification field was supplied in this collected document.'}
                </p>
                {#if earlierPurpose}<button
                    onclick={() => navigate({ filing: earlierPurpose.accession, reporter: null })}
                    >Read the earlier disclosed text · {earlierPurpose.filed}</button
                  >{/if}{/if}
              <p>
                Amendments can add, replace or incorporate earlier text. This excerpt alone may not
                contain the complete effective terms. Exhibits are linked from the official filing.
              </p>
              <details class="source-fields">
                <summary>Inspect {detail.fields.length} projected source fields</summary
                >{#each detail.fields.slice(0, fieldLimit) as field}<details>
                    <summary>{field.label}</summary><small>{field.path}</small>
                    <p class="field-text">{field.text || 'Empty source field'}</p>
                  </details>{/each}{#if detail.fields.length > fieldLimit}<button
                    onclick={() => (fieldLimit += 20)}>Show more source fields</button
                  >{/if}<small>Original XML SHA-256 {current.source.hash}</small>
              </details>
            {/if}
          </section>
        {:else}<p class="empty">
            This accession is not in the selected history. Choose one of the collected filings.
          </p>{/if}
        <section class="connections">
          <h4>Follow a verified identifier</h4>
          <a href={issuer.source.url} target="_blank" rel="noreferrer"
            >SEC profile for issuer CIK {issuer.cik} ↗</a
          >{#if ['0001652044', '0000789019'].includes(issuer.cik)}<a
              href={`${base}/records/shared-investors/?company=${issuer.cik}&group=cloud-services`}
              >Explore {issuer.name} shared institutional investors →</a
            >
            <p>
              Same issuer CIK, different reporting rules and dates. 13F positions are not a
              substitute for beneficial-ownership disclosures.
            </p>{/if}{#if selected.filerCik === '0001336528'}<a
              href={`${base}/records/holdings/?manager=${selected.filerCik}`}
              >Open this filing entity’s quarterly managed holdings →</a
            >
            <p>
              Exact filing-entity CIK. A manager’s 13F portfolio and a group’s 13D stake have
              different scope; their quantities are not expected to match or add together.
            </p>{/if}{#if issuer.cik === '0000789019'}<a
              href={`${base}/records/insiders/?issuer=${issuer.cik}`}
              >Read this issuer’s insider transaction records →</a
            >
            <p>
              Different disclosure roles, not proof of coordinated decisions.
            </p>{/if}{#if issuer.state}<a href={`${base}/records/paycheck/?state=${issuer.state}`}
              >Explore {issuer.state} wage and employment context →</a
            >
            <p>
              Company business-state geography only, not investor residences or a claim that
              ownership changes caused local outcomes.
            </p>{/if}
        </section>
      </section>{/if}
    <footer>
      <p>Official SEC disclosures · local pipeline · source-linked histories</p>
      <p>No takeover score. No inferred trades. No summed co-reporter stakes.</p>
    </footer>
  {/if}
</div>

<style>
  .stakes-page {
    --ink: #323549;
    --accent: #84799d;
    --line: #e1dfeb;
    --wash: #f5f3f8;
    color: var(--ink);
    padding: 28px 30px 45px;
    overflow-wrap: anywhere;
  }
  .kicker,
  .eyebrow {
    font-size: 9px;
    letter-spacing: 0.16em;
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
    line-height: 1.05;
    margin: 13px 0;
  }
  h2 {
    font-size: clamp(40px, 4vw, 65px);
    letter-spacing: -0.015em;
  }
  h2 em {
    font-style: normal;
    color: var(--accent);
  }
  h3 {
    font-size: 30px;
  }
  h4 {
    font-size: 25px;
  }
  p {
    font-size: 12px;
    line-height: 1.75;
    color: #626579;
  }
  header > p:last-child {
    max-width: 530px;
  }
  .notice {
    border-left: 3px solid var(--accent);
    background: var(--wash);
    padding: 17px;
    margin: 24px 0;
  }
  .notice strong {
    font-size: 13px;
  }
  .notice p {
    margin-bottom: 0;
  }
  .scope-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin: 25px 0;
  }
  .scope-stats > div {
    border-right: 1px solid var(--line);
  }
  .scope-stats > div:last-child {
    border: 0;
  }
  .scope-stats strong {
    display: block;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 38px;
    font-weight: 500;
  }
  .scope-stats span {
    font-size: 10px;
    color: #7c7b91;
  }
  details {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 13px;
    margin: 15px 0;
  }
  summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.6;
  }
  a {
    color: #665789;
    font-size: 12px;
    text-underline-offset: 3px;
  }
  small {
    font-size: 10px;
    color: #7c7b91;
    line-height: 1.6;
  }
  label {
    display: block;
    font-size: 11px;
    margin: 16px 0 10px;
    color: #696980;
  }
  input:not([type='checkbox']),
  select {
    display: block;
    width: 100%;
    min-height: 44px;
    background: white;
    color: var(--ink);
    border: 1px solid #d4d1e1;
    border-radius: 6px;
    padding: 10px;
    font: inherit;
    font-size: 12px;
    margin-top: 7px;
  }
  button {
    font: inherit;
    font-size: 11px;
    min-height: 40px;
    padding: 10px 12px;
    cursor: pointer;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: white;
    color: var(--ink);
    transition:
      border-color 0.18s,
      background 0.18s;
  }
  button:hover {
    border-color: var(--accent);
    background: var(--wash);
  }
  button:focus-visible,
  a:focus-visible,
  summary:focus-visible {
    outline: 2px solid #685294;
    outline-offset: 3px;
  }
  .search {
    display: flex;
    align-items: end;
    gap: 9px;
    margin-top: 25px;
  }
  .search label {
    flex: 1;
    margin: 0;
  }
  .search button {
    height: 44px;
    flex: none;
  }
  .filters {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 12px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    line-height: 1.6;
  }
  .check input {
    accent-color: var(--accent);
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin: 20px 0;
  }
  .section-heading p {
    margin: 0;
  }
  .section-heading .eyebrow {
    margin: 0;
  }
  .series-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .stake-card {
    text-align: left;
    border-radius: 9px;
    padding: 17px;
    content-visibility: auto;
    contain-intrinsic-size: auto 260px;
  }
  .stake-card.selected {
    border-color: var(--accent);
    background: #f5f2f9;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 8px;
    font-size: 10px;
    color: #7b728d;
  }
  .card-top > span:last-child {
    flex: none;
    background: var(--wash);
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 9px;
  }
  .stake-card h3 {
    font-size: 26px;
  }
  .stake-card p {
    font-size: 10px;
    line-height: 1.6;
    margin: 8px 0 16px;
  }
  .card-bottom {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 10px;
    margin-bottom: 17px;
    align-items: center;
  }
  .card-bottom strong {
    display: block;
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 500;
    font-size: 32px;
    color: #75678e;
  }
  .card-bottom small {
    display: block;
    font-size: 9px;
  }
  .card-bottom > span:last-child {
    text-align: right;
  }
  .stake-card > small {
    display: block;
    font-size: 9px;
    line-height: 1.6;
  }
  .more {
    display: block;
    margin: 18px auto;
  }
  .stake-detail {
    border: 1px solid #b0a5c4;
    border-radius: 12px;
    padding: 22px;
    margin-top: 30px;
    background: #fdfcfe;
    scroll-margin-top: 100px;
  }
  .stake-detail:focus {
    outline: none;
  }
  .stake-detail > .section-heading {
    margin-top: 0;
  }
  .stake-detail > h3 {
    font-size: 38px;
  }
  .caution {
    border-left: 2px solid #baaa83;
    background: #faf8f2;
    padding: 10px 13px;
    font-size: 11px;
  }
  .timeline {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 15px 2px;
    margin: 17px 0;
    scrollbar-width: thin;
    scrollbar-color: #bcb3cd transparent;
  }
  .timeline button {
    min-width: 156px;
    position: relative;
    text-align: left;
    padding: 13px;
    flex: none;
  }
  .timeline button.active {
    background: #efeaf6;
    border-color: var(--accent);
  }
  .timeline small,
  .timeline strong {
    display: block;
  }
  .timeline strong {
    font-size: 11px;
    margin: 6px 0;
  }
  .timeline-dot {
    display: block;
    width: 7px;
    height: 7px;
    border: 1px solid var(--accent);
    border-radius: 50%;
    margin-bottom: 8px;
  }
  .active .timeline-dot {
    background: var(--accent);
  }
  .filing-heading p {
    font-size: 11px;
  }
  .filing-links {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
    margin: 18px 0;
  }
  .filing-links a,
  .filing-links button {
    font-size: 10px;
  }
  .identity-note {
    font-size: 11px;
  }
  .position-stats {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 12px;
    margin: 22px 0;
  }
  .position-stats > div {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--wash);
  }
  .position-stats strong {
    display: block;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 36px;
    font-weight: 500;
    margin: 8px 0;
  }
  .position-stats span {
    font-size: 9px;
    color: #81758e;
  }
  .ownership-chart svg {
    display: block;
    width: 100%;
    height: auto;
    max-height: 200px;
  }
  .ownership-chart line {
    stroke: #e4deec;
    stroke-dasharray: 3 4;
    stroke-width: 1;
  }
  .ownership-chart path {
    stroke: #9483ac;
    stroke-width: 2;
    fill: none;
  }
  .ownership-chart circle {
    fill: #aa9cbd;
  }
  .ownership-chart circle.current {
    fill: #66517f;
    stroke: #fff;
    stroke-width: 2;
  }
  .ownership-chart text {
    font-size: 10px;
    fill: #8d8399;
  }
  .ownership-chart p {
    font-size: 10px;
  }
  .change {
    background: var(--wash);
    padding: 16px;
    border-radius: 8px;
    margin: 20px 0;
  }
  .change > div {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .change strong {
    display: block;
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 500;
    font-size: 28px;
    margin: 8px 0;
  }
  .change small {
    display: block;
    font-size: 9px;
  }
  .change p {
    font-size: 11px;
  }
  .powers dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    font-size: 11px;
    gap: 12px;
  }
  .powers dd {
    margin: 0;
  }
  .powers dt {
    color: #7c768a;
  }
  .source-text {
    border-top: 1px solid var(--line);
    padding-top: 10px;
    margin-top: 25px;
  }
  .reporter-note {
    background: #f2edf7;
    border-left: 3px solid var(--accent);
    padding: 15px;
    margin: 20px 0;
  }
  .reporter-note strong {
    font-size: 12px;
  }
  .reporter-note p,
  .statement p,
  .field-text {
    white-space: pre-wrap;
    font-size: 12px;
    line-height: 1.85;
  }
  .source-label {
    font-size: 10px;
    letter-spacing: 0.04em;
    color: var(--accent);
  }
  .statement {
    border-left: 2px solid var(--line);
    padding-left: 17px;
  }
  .locator {
    display: block;
    margin: 17px 0;
  }
  .source-fields .field-text {
    font-size: 11px;
  }
  .source-fields > small {
    display: block;
    margin-top: 15px;
  }
  .connections {
    border-top: 1px solid var(--line);
    margin-top: 25px;
    padding-top: 10px;
  }
  .connections a {
    display: block;
    margin-top: 18px;
  }
  .connections p {
    font-size: 11px;
  }
  .empty,
  [role='alert'] {
    padding: 17px;
    background: #f8f1eb;
    border-radius: 7px;
  }
  .empty {
    font-size: 12px;
  }
  footer {
    border-top: 1px solid var(--line);
    padding-top: 17px;
    margin-top: 30px;
  }
  footer p {
    font-size: 10px;
  }
  @media (max-width: 700px) {
    .stakes-page {
      padding: 23px 18px 35px;
    }
    .kicker > span:last-child {
      display: none;
    }
    .series-list {
      grid-template-columns: 1fr;
    }
    .search {
      align-items: stretch;
      flex-direction: column;
    }
    .filters {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .stake-detail {
      padding: 15px;
    }
    .stake-detail > h3 {
      font-size: 32px;
    }
    .position-stats {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .position-stats > div {
      padding: 11px;
    }
    .position-stats strong {
      font-size: 28px;
    }
    .position-stats small {
      font-size: 9px;
    }
    .change strong {
      font-size: 23px;
    }
    .scope-stats span {
      font-size: 9px;
    }
    .scope-stats strong {
      font-size: 34px;
    }
    .timeline button {
      min-width: 145px;
    }
    .section-heading {
      flex-wrap: wrap;
    }
    .powers dl {
      grid-template-columns: 1fr;
      gap: 6px;
    }
    .powers dd {
      margin-bottom: 8px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
