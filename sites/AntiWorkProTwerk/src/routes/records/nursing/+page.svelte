<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { getContext, onMount, onDestroy, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import {
    filterNursing,
    nursingComparison,
    partyFacilities,
    roleLabels,
    ownershipRole,
    facilityUrl,
    type NursingDetail,
    type NursingParty,
  } from '$lib/civic/nursing';
  import { nursingMapContext, type NursingMapContext } from '$lib/civic/nursing-map';
  import { createNursingReader } from '$lib/civic/nursing-repository';
  let { data } = $props();
  const map = getContext<NursingMapContext>(nursingMapContext);
  const reader = createNursingReader(fetch, base);
  let ready = $state(false),
    reduced = $state(true),
    limit = $state(24),
    associationLimit = $state(20);
  let detail = $state.raw<NursingDetail | null>(null),
    owner = $state.raw<NursingParty | null>(null),
    catalog = $state.raw<NursingParty[] | null>(null);
  let detailError = $state(''),
    ownerError = $state(''),
    catalogError = $state('');
  let detailLoading = $state(false),
    ownerLoading = $state(false),
    catalogLoading = $state(false);
  let detailRetry = $state(0),
    ownerRetry = $state(0),
    catalogRetry = $state(0);
  let ownerSearch = $state(''),
    ownerQuery = $state(''),
    detailElement: HTMLElement | undefined = $state();
  onMount(() => {
    ready = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  onDestroy(() => {
    if (browser) map?.set(null);
  });
  const dataset = $derived(data.nursing?.data);
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const ownerId = $derived(params.get('owner'));
  const stateCode = $derived(params.get('state'));
  const filterKey = $derived(
    JSON.stringify(['q', 'owner', 'role'].map((k) => [k, params.get(k) ?? ''])),
  );
  const filterParams = $derived(new URLSearchParams(JSON.parse(filterKey)));
  const role = $derived(
    Object.hasOwn(roleLabels, params.get('role') ?? '') ? params.get('role')! : 'ownership',
  );
  const view = $derived({ facilities: dataset?.facilities ?? [], parties: owner ? [owner] : [] });
  const mapped = $derived(
    filterNursing(view, new URLSearchParams({ ...Object.fromEntries(filterParams), role })),
  );
  const rows = $derived(mapped.filter((f) => !stateCode || f.state === stateCode));
  const summary = $derived(nursingComparison(rows));
  const baseline = $derived(
    nursingComparison(
      (dataset?.facilities ?? []).filter((f) => !stateCode || f.state === stateCode),
    ),
  );
  const selected = $derived(dataset?.facilities.find((f) => f.id === params.get('facility')));
  const staffingPeriod = $derived(dataset?.intervals.find((i) => i.code === 'STAFFING_LEVELS'));
  const foundOwners = $derived(
    (catalog ?? [])
      .filter((p) =>
        ownerQuery
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .every((term) => `${p.id} ${p.names.join(' ')}`.toLowerCase().includes(term)),
      )
      .sort(
        (a, b) =>
          partyFacilities(b, role).size - partyFacilities(a, role).size || a.id.localeCompare(b.id),
      ),
  );
  $effect(() => {
    map?.set(mapped);
  });
  $effect(() => {
    void filterKey;
    void stateCode;
    limit = 24;
  });
  $effect(() => {
    const snapshot = data.nursing,
      id = ownerId;
    void ownerRetry;
    owner = null;
    ownerError = '';
    ownerLoading = false;
    if (!browser || !snapshot || !id) return;
    const controller = new AbortController();
    let active = true;
    ownerLoading = true;
    reader
      .party(snapshot, id, controller.signal)
      .then((result) => {
        if (active) owner = result;
      })
      .catch(() => {
        if (active)
          ownerError = 'This disclosed party could not load or verify. No portfolio is inferred.';
      })
      .finally(() => {
        if (active) ownerLoading = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  });
  $effect(() => {
    const snapshot = data.nursing,
      id = selected?.id;
    void detailRetry;
    detail = null;
    detailError = '';
    detailLoading = false;
    associationLimit = 20;
    if (!browser || !snapshot || !id) return;
    const controller = new AbortController();
    let active = true;
    detailLoading = true;
    reader
      .facility(snapshot, id, controller.signal)
      .then((result) => {
        if (active) detail = result;
      })
      .catch(() => {
        if (active)
          detailError = 'The facility evidence could not load or verify. Retry to try again.';
      })
      .finally(() => {
        if (active) detailLoading = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  });
  $effect(() => {
    const snapshot = data.nursing,
      query = ownerQuery;
    void catalogRetry;
    catalogError = '';
    catalogLoading = false;
    if (!browser || !snapshot || !query || catalog) return;
    const controller = new AbortController();
    let active = true;
    catalogLoading = true;
    reader
      .catalog(snapshot, controller.signal)
      .then((result) => {
        if (active) catalog = result;
      })
      .catch(() => {
        if (active)
          catalogError = 'The disclosed-party search catalog could not load. Retry to try again.';
      })
      .finally(() => {
        if (active) catalogLoading = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  });
  async function navigate(changes: Record<string, string | null>) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    await goto(url, { noScroll: true, keepFocus: true });
    if (changes.facility) {
      await tick();
      detailElement?.focus({ preventScroll: true });
      detailElement?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    }
  }
  function search(event: SubmitEvent) {
    event.preventDefault();
    navigate({
      q: String(new FormData(event.currentTarget as HTMLFormElement).get('q') ?? ''),
      facility: null,
    });
  }
  const decimal = (value: number | null, digits = 2) =>
    value === null
      ? 'Not reported'
      : value.toLocaleString('en-US', { maximumFractionDigits: digits });
  const money = (cents: number | null) =>
    cents === null
      ? 'Not reported'
      : (cents / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        });
  const partyName = (party: NursingParty) =>
    party.names.find((name) => name.trim()) || 'Name not reported';
</script>

<svelte:head
  ><title>Nursing Home Owners · Louder Than Words</title><meta
    name="description"
    content="Connect CMS nursing facilities through disclosed party IDs. Compare reported staffing, inspection findings and penalties with source periods preserved."
  /></svelte:head
>
<div class="evidence-page nursing-page">
  <div class="kicker">
    <span>28 / Nursing home owners</span><span>Names differ. Records connect.</span>
  </div>
  <header>
    <p class="eyebrow">The organization behind the sign.</p>
    <h2>Different homes.<br /><em>Shared interests.</em></h2>
    <p>
      Follow a disclosed owner across differently named facilities. Put their staffing and
      inspection records side by side, then open the evidence.
    </p>
  </header>
  {#if data.nursingError}<p role="alert">{data.nursingError}</p>{/if}
  {#if dataset && data.nursing}
    <div class="capture">
      <span></span>CMS public records · captured {dataset.observedAt.slice(0, 10)}
    </div>
    <details class="coverage">
      <summary
        >{dataset.facilities.length.toLocaleString()} facilities · {dataset.plan.states.join(' / ')} ·
        read the scope</summary
      >
      <p>
        {dataset.plan.title}. {dataset.coverage.matchedProviders.toLocaleString()} facilities joined to
        enrollment records by exact CMS identifiers; {dataset.facilities.length -
          dataset.coverage.matchedProviders} remain unjoined, not ownerless. {dataset.partyCount.toLocaleString()}
        disclosed parties include people, organizations, managers and financial interests—not just owners.
      </p>
      <p>
        Ownership is self-reported and current to its source snapshot, not a full history or a
        verified ultimate-parent map. Separate names sharing a CMS party ID are connected; similar
        names with different IDs are not merged. Current ownership and older quality measurements
        may cover different periods.
      </p>
      <p>
        {dataset.coverage.unresolvedEnrollments.length} national enrollment records have unsupported CCN
        formats and remain unjoined. Owner addresses are not published here. Facility coordinates come
        from CMS and may be approximate.
      </p>
      <p>
        Recorded source changes since {dataset.changes.baselineAt?.slice(0, 10) ??
          'the first capture'}: {dataset.changes.baselineAt
          ? `${dataset.changes.newFacilities.length} new, ${dataset.changes.changedFacilities.length} changed, ${dataset.changes.notReturned.length} not returned.`
          : 'no prior snapshot to compare.'} Source changes do not necessarily indicate ownership transfers.
      </p>
      <a href={`${base}/data/nursing/releases/${data.nursing.manifest.release}/data.json`} download
        >Download full dataset</a
      >
      · <a href={`${base}/data/nursing/manifest.json`} download>Manifest + evidence hashes</a>
    </details>
    <section class="owner-explorer" aria-label="Explore disclosed parties">
      <div class="section-heading">
        <span class="eyebrow">01 / Follow the connection</span><span
          >CMS party IDs, not name guesses</span
        >
      </div>
      <h3>Start with an organization</h3>
      <p>
        Largest organizational ownership portfolios <em>within this collection</em>, including
        direct and indirect interests. This is not a ranking of quality or national size.
      </p>
      <div class="owner-options">
        {#each dataset.featured.slice(0, 6) as party}<button
            disabled={!ready}
            class:chosen={params.get('owner') === party.id}
            onclick={() =>
              navigate({
                owner: party.id,
                facility: null,
                q: null,
                state: null,
                role: 'ownership',
              })}
            ><span>{partyName(party)}</span><strong
              >{partyFacilities(party).size}<small>facilities</small></strong
            ></button
          >{/each}
      </div>
      <form
        class="owner-search"
        onsubmit={(e) => {
          e.preventDefault();
          ownerQuery = ownerSearch.trim();
        }}
      >
        <label for="owner-search">Find any disclosed person or organization</label>
        <div class="input-row">
          <input
            id="owner-search"
            bind:value={ownerSearch}
            placeholder="Name or ten-digit CMS party ID"
          /><button disabled={!ready}>Find party</button>
        </div>
      </form>
      <p class="small">
        Some source records do not report a party name. You can still look up their exact CMS party
        ID. “PAC” here means PECOS Associate Control, not a political committee.
      </p>
      {#if catalogLoading}<p role="status">Loading the party search catalog…</p>{/if}
      {#if catalogError}<p role="alert">
          {catalogError} <button onclick={() => catalogRetry++}>Retry party search</button>
        </p>{/if}
      {#if ownerQuery && catalog}<p class="small">
          {foundOwners.length.toLocaleString()} matching parties. Showing up to 30; refine your search
          for more.
        </p>
        <div class="search-results">
          {#each foundOwners.slice(0, 30) as p}<button
              onclick={() => navigate({ owner: p.id, facility: null, q: null, state: null })}
              >{partyName(p)}
              <small>PAC {p.id} · {partyFacilities(p, role).size} facilities in selected role</small
              ></button
            >{/each}
        </div>{/if}
    </section>
    {#if ownerLoading}<p role="status">Verifying disclosed relationships…</p>{/if}
    {#if ownerError}<p role="alert">
        {ownerError} <button onclick={() => ownerRetry++}>Retry owner</button>
        <button onclick={() => navigate({ owner: null })}>Clear owner</button>
      </p>{/if}
    {#if owner}<section class="portfolio" in:fly={{ y: 10, duration: reduced ? 0 : 220 }}>
        <div class="section-heading">
          <span class="eyebrow">Selected disclosed party</span><button
            onclick={() => navigate({ owner: null, links: null, facility: null })}
            >Clear owner ×</button
          >
        </div>
        <h3>{partyName(owner)}</h3>
        <p>
          PAC {owner.id} · {owner.type === 'O'
            ? 'Organization'
            : owner.type === 'I'
              ? 'Individual'
              : 'Type not reported'}
        </p>
        {#if owner.names.filter(Boolean).length > 1}<details>
            <summary>Other names under this same ID</summary>
            <p>{owner.names.filter(Boolean).slice(1).join(' / ')}</p>
          </details>{/if}
        <label
          >Relationship to facilities<select
            aria-label="Disclosed relationship"
            value={role}
            onchange={(e) => navigate({ role: e.currentTarget.value, facility: null })}
            >{#each Object.entries(roleLabels) as [code, label]}<option value={code}>{label}</option
              >{/each}</select
          ></label
        >
        <p>
          Direct and indirect interests can overlap. A facility is counted once, regardless of
          roles. Percentages are never added across ownership levels.
        </p>
        <label class="checkbox"
          ><input
            type="checkbox"
            checked={params.get('links') === '1'}
            onchange={(e) => navigate({ links: e.currentTarget.checked ? '1' : null })}
          />Connect this party’s mapped facilities</label
        >
        <p class="small">
          Lines group shared disclosed relationships. The first facility is only a drawing
          anchor—not headquarters, a controlling parent, or a travel route.
        </p>
      </section>{/if}
    <div class="section-heading">
      <span class="eyebrow">02 / Compare the records</span><span
        >{rows.length.toLocaleString()} facilities in view</span
      >
    </div>
    <form class="facility-search" onsubmit={search}>
      <label for="facility-search">Filter facilities by name, city or CCN</label>
      <div class="input-row">
        <input
          id="facility-search"
          name="q"
          value={params.get('q') ?? ''}
          placeholder="Try Austin or a facility name"
        /><button disabled={!ready}>Search facilities</button>
      </div>
    </form>
    <p class="period">
      Staffing: {staffingPeriod?.from ?? 'unknown'} — {staffingPeriod?.through ?? 'unknown'}.
      Reported hours per resident per day; not case-mix adjusted.
    </p>
    <div class="metrics">
      {#each [{ key: 'rnHours' as const, label: 'RN hours / resident / day' }, { key: 'totalHours' as const, label: 'Total nurse hours / resident / day' }, { key: 'deficiencies' as const, label: 'Cycle 1 health deficiencies' }] as metric}<div
        >
          <strong>{decimal(summary[metric.key].value)}</strong><span>Median · {metric.label}</span
          ><small
            >{summary[metric.key].available} / {summary[metric.key].total} facilities reported</small
          >{#if owner}<small
              >All collected in region: {decimal(baseline[metric.key].value)} ({baseline[metric.key]
                .available}/{baseline[metric.key].total})</small
            >{/if}
        </div>{/each}
    </div>
    <p class="small">
      These are descriptive medians, not risk-adjusted comparisons or evidence that ownership caused
      a result. Cycle 1 combines the most recent standard survey with complaint/infection-control
      findings in its reporting window; it is not one inspection.
    </p>
    {#if params.get('facility') && !selected}<p role="status">
        That facility is outside this captured collection.
      </p>{/if}
    {#if selected}<section
        class="facility-detail"
        bind:this={detailElement}
        tabindex="-1"
        aria-label="Facility source evidence"
        in:fly={{ y: 12, duration: reduced ? 0 : 220 }}
      >
        <div class="section-heading">
          <span class="eyebrow">03 / Open the evidence · CCN {selected.id}</span><button
            onclick={() => navigate({ facility: null })}>Close facility ×</button
          >
        </div>
        <h3>{selected.name}</h3>
        <p>{selected.legalName} · {selected.city}, {selected.state}</p>
        {#if detailLoading}<p role="status">Verifying facility source records…</p>{/if}
        {#if detailError}<p role="alert">{detailError}</p>
          <button onclick={() => detailRetry++}>Retry facility details</button>{/if}
        {#if detail}<p>{detail.address}, {detail.zip}</p>
          <div class="detail-stats">
            <span><strong>{selected.overall ?? '—'}/5</strong>CMS overall rating</span><span
              ><strong>{selected.health ?? '—'}/5</strong>Health inspection rating</span
            ><span><strong>{selected.staffing ?? '—'}/5</strong>Staffing rating</span><span
              ><strong>{selected.beds ?? '—'}</strong>Certified beds</span
            >
          </div>
          <p class="notice">
            CMS reports ownership changed in the last 12 months: <strong
              >{detail.changedOwnership === 'Y'
                ? 'Yes'
                : detail.changedOwnership === 'N'
                  ? 'No'
                  : 'Not reported'}</strong
            >. This flag is not an acquisition date. This current-owner snapshot does not establish
            before/after ownership effects.
          </p>
          <h4>Disclosed relationships ({detail.associations.length})</h4>
          <p class="small">
            An association date is the reported start of that relationship—not necessarily an
            acquisition. Blank ownership percentage means not reported. Direct/indirect interests,
            managers, officers and other roles are distinct.
          </p>
          {#if !detail.enrollments.length}<p class="notice">
              No exact enrollment join was available. No owner is inferred from the facility name.
            </p>{/if}
          <div class="associations">
            {#each detail.associations.slice(0, associationLimit) as association}<article
                class:ownership={ownershipRole(association.role) === 'ownership'}
              >
                <button
                  onclick={() =>
                    navigate({
                      owner: association.ownerId,
                      role: ownershipRole(association.role),
                      q: null,
                    })}>{association.name || 'Name not reported'} ↗</button
                >
                <p>{association.roleText} · code {association.role}</p>
                <small
                  >PAC {association.ownerId} · reported from {association.associated ?? 'unknown'} · {association.percentage ===
                  null
                    ? 'percentage not reported'
                    : `${association.percentage}% reported interest`}</small
                ><small
                  >Owner CSV record {association.sourceRow} · enrollment {association.enrollmentId}</small
                >
              </article>{/each}
          </div>
          {#if detail.associations.length > associationLimit}<button
              onclick={() => (associationLimit += 30)}>Show more relationships</button
            >{/if}
          <h4>Inspection context</h4>
          <p>
            Most recent standard survey: {detail.surveyDate ?? 'not reported'}. Cycle 1 health
            deficiencies: {decimal(selected.deficiencies, 0)}. Prior standard survey: {detail.priorSurveyDate ??
              'not reported'}; reported cycle 2/3 deficiencies: {decimal(
              detail.priorDeficiencies,
              0,
            )}. These cover different source windows and are not presented as a like-for-like trend.
          </p>
          <h4>Penalties in the source’s last-three-year window</h4>
          <p>
            {decimal(selected.penalties, 0)} reported penalties · {money(selected.finesCents)} reported
            fines. Fine totals are not total losses or payments to residents; payment denials are a different
            action.
          </p>
          {#if detail.penalties.length}<ol class="penalties">
              {#each detail.penalties as penalty}<li>
                  <time>{penalty.date}</time><strong>{penalty.type}</strong><span
                    >{penalty.fineCents === null
                      ? 'Fine not reported'
                      : money(penalty.fineCents)}</span
                  >{#if penalty.denialStart}<span
                      >Denial starts {penalty.denialStart} · {penalty.denialDays ?? 'unknown'} days</span
                    >{/if}<small>Penalty CSV record {penalty.sourceRow}</small>
                </li>{/each}
            </ol>{:else}<p>
              No matched penalty detail rows in this snapshot. This is not a certification of
              compliance.
            </p>{/if}
          <details class="source-notes">
            <summary>Source footnotes, exact joins and row fingerprints</summary>
            <p>
              Provider CSV record {detail.providerRow}; processed {detail.processingDate}. Geocoding
              footnote: {detail.geocodingFootnote || 'none reported'}.
            </p>
            {#each Object.entries(detail.footnotes).filter(([, v]) => v) as [name, value]}<p>
                {name}: {value}
              </p>{/each}
            <p>Provider row SHA-256: <code>{detail.providerRowHash}</code></p>
            <p>Combined facility evidence SHA-256: <code>{detail.facility.recordHash}</code></p>
            {#each detail.enrollments as enrollment}<p>
                Enrollment {enrollment.id} → CCN {enrollment.ccn} · provider PAC {enrollment.associateId}
                · CSV record {enrollment.sourceRow}. {enrollment.legalName}
              </p>{/each}
            <p>
              CSV record numbers are one-based data rows, excluding the header. Full row
              fingerprints are available in the downloadable evidence shards.
            </p>
          </details>
          <div class="connections">
            <a href={facilityUrl(selected.id)} target="_blank" rel="noreferrer"
              >Open Medicare Care Compare ↗</a
            ><a href={`${base}/records/paycheck/?state=${selected.state}`}
              >Explore this state’s wage context →</a
            >
            <p>
              Statewide private-sector earnings are geographic context, not this facility’s wages.
              No employer or ownership link to another dataset is inferred.
            </p>
          </div>
        {/if}
      </section>{/if}
    <div class="facility-list" aria-label="Collected nursing facilities">
      {#each rows.slice(0, limit) as facility (facility.id)}<button
          class="facility-card"
          class:selected={selected?.id === facility.id}
          disabled={!ready}
          onclick={() => navigate({ facility: facility.id })}
          ><div class="card-heading">
            <span>{facility.city}, {facility.state} · {facility.id}</span><span>↗</span>
          </div>
          <h3>{facility.name}</h3>
          <p>{facility.legalName}</p>
          <div class="card-metrics">
            <span><strong>{decimal(facility.rnHours)}</strong>RN hours / day</span><span
              ><strong>{decimal(facility.deficiencies, 0)}</strong>Cycle 1 findings</span
            ><span><strong>{money(facility.finesCents)}</strong>Reported fines</span>
          </div>
          <div class="meter" aria-hidden="true">
            <span style={`width:${facility.overall === null ? 0 : facility.overall * 20}%`}></span>
          </div>
          <small
            >CMS overall rating: {facility.overall === null
              ? 'not reported'
              : `${facility.overall}/5`} · {facility.enrollmentCount
              ? `${facility.ownerCount} distinct parties in ownership roles`
              : 'ownership join unavailable'}</small
          ></button
        >{/each}
    </div>
    {#if !rows.length && !ownerLoading}<p class="notice" role="status">
        No facilities match this state, role and search in the captured collection. This is not
        evidence of absence nationally.
      </p>{/if}
    {#if rows.length > limit}<button class="more" onclick={() => (limit += 24)}
        >Show 24 more facilities</button
      >{/if}
    <details class="sources">
      <summary>Five official sources · reporting windows and downloads</summary
      >{#each dataset.sources as source}<p>
          <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.kind} ↗</a
          ><br />{source.kind} · {source.period} · {source.rows.toLocaleString()} national rows<br
          /><a href={source.metadataUrl} target="_blank" rel="noreferrer">Source metadata</a>
        </p>{/each}<a
        href="https://data.cms.gov/provider-data/sites/default/files/data_dictionaries/nursing_home/NH_Data_Dictionary.pdf"
        target="_blank"
        rel="noreferrer">CMS quality-data dictionary ↗</a
      >
      <p>Full reporting intervals:</p>
      <ul>
        {#each dataset.intervals as interval}<li>
            {interval.label || interval.code}: {interval.from ?? ''} — {interval.through ?? ''}
            {interval.range}
          </li>{/each}
      </ul>
    </details>
    <footer>
      Structured public records, no AI ownership guesses. Missing and unjoined records remain
      visible. This explorer is not a recommendation of a care facility or proof of causation.
    </footer>
  {/if}
</div>

<style>
  .nursing-page {
    --ink: #254943;
    --muted: #627c75;
    --line: #d4e2dc;
    --wash: #f0f6f2;
    color: var(--ink);
  }
  .kicker,
  .section-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  header {
    padding: 25px 0 15px;
  }
  header h2 {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: clamp(48px, 5vw, 70px);
    line-height: 0.94;
    margin: 12px 0 22px;
    letter-spacing: -0.02em;
  }
  header em {
    font-style: normal;
    color: #669077;
  }
  p {
    font-size: 13px;
    line-height: 1.7;
  }
  header > p:last-child {
    font-size: 15px;
    max-width: 510px;
  }
  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  h3 {
    font-size: 22px;
    line-height: 1.2;
    margin: 12px 0;
    overflow-wrap: anywhere;
  }
  h4 {
    font-size: 17px;
    margin: 26px 0 8px;
  }
  .capture {
    display: flex;
    gap: 9px;
    align-items: center;
    font-size: 11px;
    padding: 15px 0;
  }
  .capture > span {
    background: #649b79;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    box-shadow: 0 0 0 4px #e9f1ec;
  }
  .coverage,
  .sources {
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    padding: 15px 0;
    font-size: 12px;
    margin-bottom: 25px;
  }
  summary {
    cursor: pointer;
    line-height: 1.6;
  }
  a {
    color: #32695b;
    text-underline-offset: 3px;
  }
  button {
    color: inherit;
    font: inherit;
    cursor: pointer;
    border: 1px solid var(--line);
    background: white;
    border-radius: 5px;
    padding: 10px 12px;
    font-size: 12px;
    transition:
      background 0.18s,
      border-color 0.18s,
      transform 0.18s;
  }
  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }
  button:hover {
    background: #eaf2ed;
    border-color: #7fa28c;
  }
  .owner-explorer {
    padding: 20px 0;
  }
  .owner-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
    margin: 18px 0;
  }
  .owner-options > button {
    display: flex;
    align-items: center;
    gap: 15px;
    justify-content: space-between;
    text-align: left;
    min-height: 82px;
    font-size: 11px;
  }
  .owner-options strong {
    font-size: 25px;
    font-weight: 500;
  }
  .owner-options small {
    display: block;
    font-size: 9px;
    font-weight: 400;
  }
  .owner-options .chosen {
    background: #e4efe6;
    border-color: #527d63;
  }
  .input-row {
    display: flex;
    gap: 8px;
    margin-top: 7px;
  }
  input,
  select {
    min-width: 0;
    width: 100%;
    border: 1px solid var(--line);
    padding: 12px;
    background: #fff;
    border-radius: 5px;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
  }
  label {
    display: block;
    font-size: 12px;
  }
  .input-row button {
    flex-shrink: 0;
  }
  .search-results {
    display: grid;
    max-height: 360px;
    overflow: auto;
    gap: 5px;
  }
  .search-results button {
    text-align: left;
  }
  .search-results small {
    display: block;
    margin-top: 5px;
  }
  .portfolio {
    background: linear-gradient(135deg, #e7f0e7, #f6f8f1);
    border: 1px solid #c5d6c8;
    border-radius: 10px;
    padding: 22px;
    margin: 20px 0 30px;
  }
  .portfolio label {
    margin-top: 15px;
  }
  .portfolio select {
    margin-top: 7px;
  }
  .checkbox {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .checkbox input {
    width: auto;
    accent-color: #517961;
  }
  .small,
  small {
    font-size: 11px;
    line-height: 1.6;
    color: var(--muted);
  }
  .facility-search {
    margin: 18px 0;
  }
  .period {
    font-size: 11px;
    border-left: 3px solid #8ea991;
    padding-left: 10px;
    margin: 20px 0;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: var(--line);
    margin: 15px 0;
  }
  .metrics > div {
    background: var(--wash);
    padding: 17px 13px;
  }
  .metrics strong {
    display: block;
    font-size: 28px;
    font-weight: 500;
  }
  .metrics span,
  .metrics small {
    display: block;
    font-size: 10px;
    margin-top: 6px;
    line-height: 1.5;
  }
  .facility-list {
    display: grid;
    gap: 12px;
    margin: 25px 0;
  }
  .facility-card {
    padding: 20px;
    text-align: left;
    border-radius: 9px;
    background: #fff;
  }
  .facility-card:hover {
    transform: translateY(-2px);
  }
  .facility-card.selected {
    border-color: #527d63;
    background: #f1f6ef;
  }
  .card-heading {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .facility-card h3 {
    font-size: 19px;
  }
  .facility-card > p {
    font-size: 11px;
    color: var(--muted);
    margin: 7px 0 18px;
  }
  .card-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .card-metrics span {
    font-size: 9px;
  }
  .card-metrics strong {
    display: block;
    font-size: 16px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .meter {
    height: 3px;
    background: #e9eeea;
    margin: 18px 0 10px;
  }
  .meter > span {
    display: block;
    height: 100%;
    background: #7b9c85;
    transition: width 0.4s;
  }
  .facility-detail {
    scroll-margin-top: 15px;
    background: #f7f9f4;
    border: 1px solid #adc5b3;
    border-radius: 10px;
    padding: 24px;
    margin: 25px 0;
    outline: none;
  }
  .facility-detail h3 {
    font-size: 29px;
  }
  .detail-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin: 25px 0;
  }
  .detail-stats span {
    font-size: 10px;
  }
  .detail-stats strong {
    display: block;
    font-size: 24px;
  }
  .notice {
    padding: 15px;
    border-left: 3px solid #93a986;
    background: #ebf0e5;
    font-size: 12px;
  }
  .associations {
    display: grid;
    gap: 8px;
    margin: 15px 0;
  }
  .associations article {
    padding: 12px;
    background: white;
    border-left: 3px solid #c9d6d1;
  }
  .associations article.ownership {
    border-left-color: #517a5e;
  }
  .associations button {
    padding: 0;
    border: 0;
    text-align: left;
    background: transparent;
    font-weight: 600;
  }
  .associations p {
    font-size: 11px;
    margin: 7px 0;
  }
  .associations small {
    display: block;
    overflow-wrap: anywhere;
  }
  .penalties {
    list-style: none;
    border-left: 1px solid #c0d2c4;
    padding: 0 0 0 18px;
  }
  .penalties li {
    position: relative;
    display: grid;
    gap: 5px;
    padding: 0 0 20px;
    font-size: 12px;
  }
  .penalties li:before {
    content: '';
    position: absolute;
    left: -23px;
    top: 3px;
    width: 8px;
    height: 8px;
    background: #63846d;
    border-radius: 50%;
  }
  .penalties time {
    font-size: 10px;
    color: var(--muted);
  }
  .source-notes {
    font-size: 12px;
    margin: 20px 0;
  }
  code {
    overflow-wrap: anywhere;
    font-size: 10px;
  }
  .connections {
    border-top: 1px solid var(--line);
    padding-top: 15px;
  }
  .connections a {
    display: block;
    font-size: 12px;
    line-height: 2;
  }
  .connections p {
    font-size: 11px;
  }
  .sources {
    margin-top: 30px;
  }
  .sources li {
    font-size: 11px;
    line-height: 1.7;
  }
  footer {
    font-size: 11px;
    line-height: 1.7;
    color: var(--muted);
    margin-top: 25px;
  }
  .more {
    margin-bottom: 20px;
  }
  .nursing-page :is(button, a, input, select, summary):focus-visible {
    outline: 3px solid #588570;
    outline-offset: 3px;
  }
  @media (max-width: 720px) {
    .owner-options {
      grid-template-columns: 1fr;
    }
    .kicker > span:last-child,
    .section-heading > span:last-child:not(.eyebrow) {
      display: none;
    }
    .metrics > div {
      padding: 14px 8px;
    }
    .metrics strong {
      font-size: 24px;
    }
    .facility-detail {
      padding: 17px;
    }
    .facility-card {
      padding: 17px;
    }
    .card-metrics strong {
      font-size: 14px;
    }
    .input-row {
      flex-wrap: wrap;
    }
    .input-row input {
      flex: 1 1 150px;
    }
    .portfolio {
      padding: 17px;
    }
    .facility-detail .section-heading {
      align-items: flex-start;
    }
    .facility-detail .section-heading button {
      flex-shrink: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button,
    .meter > span {
      transition: none;
    }
    .facility-card:hover {
      transform: none;
    }
  }
</style>
