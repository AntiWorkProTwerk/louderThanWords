<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import {
    filterRules,
    relatedRules,
    ruleAlerts,
    matchesRuleTopics,
    ruleFingerprint,
    ruleWatchSchema,
    type RuleText,
    type RuleWatch,
  } from '$lib/civic/rules';
  import { loadRuleText } from '$lib/civic/rules-repository';
  let { data } = $props();
  const dataset = $derived(data.rules?.data);
  const params = $derived(browser ? page.url.searchParams : new URLSearchParams());
  const filters = $derived({
    q: params.get('q') ?? '',
    type: params.get('type') ?? '',
    topic: params.get('topic') ?? '',
    docket: params.get('docket') ?? '',
    rin: params.get('rin') ?? '',
  });
  const view = $derived(params.get('view') ?? 'documents');
  const documents = $derived(dataset ? filterRules(dataset, filters) : []);
  const selected = $derived(
    dataset?.documents.find((d) => d.id === params.get('document')) ?? null,
  );
  const related = $derived(dataset && selected ? relatedRules(dataset, selected) : []);
  const connectedTopics = $derived([...new Set(related.flatMap((c) => c.document.topics))].sort());
  const topics = $derived([...new Set(dataset?.documents.flatMap((d) => d.topics) ?? [])].sort());
  let reduced = $state(true),
    ready = $state(false),
    limit = $state(24),
    textLimit = $state(40),
    textSection = $state(''),
    textQuery = $state('');
  let text = $state<RuleText | null>(null),
    textError = $state(''),
    textLoading = $state(false);
  let watch = $state<RuleWatch>({ formatVersion: 1, topics: [], seen: [] }),
    notice = $state(''),
    checking = $state(false);
  const alerts = $derived(dataset ? ruleAlerts(dataset, watch) : []);
  const followed = $derived(
    dataset ? documents.filter((d) => matchesRuleTopics(dataset, d, watch.topics)) : [],
  );
  const displayed = $derived(
    view === 'following'
      ? followed
      : view === 'updates'
        ? alerts.filter((d) => documents.some((f) => f.id === d.id))
        : documents,
  );
  const blocks = $derived(
    text?.blocks.filter(
      (b) =>
        (!textSection || b.section === textSection) &&
        b.text.toLowerCase().includes(textQuery.toLowerCase()),
    ) ?? [],
  );
  const storageKey = 'ltw:quiet-rulebook:topics:v1';
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => (reduced = media.matches);
    update();
    media.addEventListener('change', update);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) watch = ruleWatchSchema.parse(JSON.parse(saved));
    } catch {
      notice = 'Saved topics could not be read. Import a backup or choose topics again.';
    }
    ready = true;
    return () => media.removeEventListener('change', update);
  });
  $effect(() => {
    void filters;
    void view;
    limit = 24;
  });
  $effect(() => {
    const doc = selected;
    text = null;
    textError = '';
    textLoading = !!doc;
    textLimit = 40;
    textQuery = '';
    textSection = doc?.amendmentCount ? 'regulatory' : 'dates';
    if (!doc) return;
    const controller = new AbortController();
    loadRuleText(fetch, doc.id, doc.textHash, base, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          text = value;
          textLoading = false;
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          textError =
            'Source passages could not load or failed integrity validation. Open the original document below.';
          textLoading = false;
        }
      });
    return () => controller.abort();
  });
  async function navigate(changes: Record<string, string | null>, replace = false) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(changes))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    await goto(url, { noScroll: true, keepFocus: true, replaceState: replace });
  }
  function save(value: RuleWatch) {
    try {
      ruleWatchSchema.parse(value);
      localStorage.setItem(storageKey, JSON.stringify(value));
      watch = value;
      notice = 'Saved on this device.';
    } catch {
      notice = 'Could not save topics on this device. Export a backup before leaving.';
    }
  }
  function toggleTopic(topic: string) {
    const adding = !watch.topics.includes(topic),
      next = adding ? [...watch.topics, topic] : watch.topics.filter((t) => t !== topic);
    const baseline = adding
      ? (dataset?.documents
          .filter((d) => matchesRuleTopics(dataset, d, [topic]))
          .map(ruleFingerprint) ?? [])
      : [];
    save({
      formatVersion: 1,
      topics: next,
      seen: [...new Set([...watch.seen, ...baseline])].slice(-20000),
    });
  }
  function markRead() {
    save({
      ...watch,
      seen: [...new Set([...watch.seen, ...alerts.map(ruleFingerprint)])].slice(-20000),
    });
  }
  function exportWatch() {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(watch, null, 2)], { type: 'application/json' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'quiet-rulebook-topics.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importWatch(event: Event) {
    const input = event.currentTarget as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error();
      save(ruleWatchSchema.parse(JSON.parse(await file.text())));
    } catch {
      notice = 'That file is not a valid rulebook topic backup. Existing topics were kept.';
    }
    input.value = '';
  }
  async function checkUpdates() {
    checking = true;
    notice = '';
    try {
      await invalidateAll();
      notice =
        'Checked the published snapshot. New records require a pipeline update; this browser does not run acquisition.';
    } catch {
      notice = 'Could not check the snapshot. Try again later.';
    } finally {
      checking = false;
    }
  }
</script>

<svelte:head
  ><title>The Quiet Rulebook · Louder Than Words</title><meta
    name="description"
    content="Follow agency rules, proposals and stated dates. Inspect exact source passages and connected regulatory records."
  /></svelte:head
>
<div class="evidence-page rules-page">
  <div class="rule-kicker">
    <span>06 / Beyond the floor vote</span><a href={`${base}/records/votes/`}
      >Explore congressional votes ↗</a
    >
  </div>
  <header class="rule-heading">
    <p class="eyebrow">Public policy. In the fine print.</p>
    <h2>The quiet<br /><em>rulebook.</em></h2>
    <p>
      Rules change outside Congress, too. Follow agency actions, read the exact language, and see
      the dates the agency actually states.
    </p>
  </header>
  {#if !dataset}<section role="alert" class="rule-empty">
      <h3>Rulebook snapshot unavailable</h3>
      <p>{data.rulesError}</p>
      <a href={page.url.pathname}>Reload ↻</a>
    </section>
  {:else}
    <div class="rule-coverage">
      <span class="rule-dot"></span><strong>Federal Register records</strong><span
        >Captured {dataset.observedAt.slice(0, 10)}</span
      >
    </div>
    <details class="rule-method">
      <summary>Collection, source status & what this can establish</summary>
      <p>
        {dataset.documents.length} tracked documents. Search: “{dataset.term}”, {dataset.agency},
        published {dataset.from} through {dataset.through}. Discovery reported {dataset.totalMatches}
        matches{dataset.truncated
          ? '; the configured page limit left additional matches uncollected'
          : ''}. This is a historical collection, not a current inventory of all agency rules. A
        text match is not necessarily the main subject of a document.
      </p>
      <p>
        FederalRegister.gov supplies an informational XML rendition. Verify legal research against
        the linked official GovInfo PDF. Dates are quoted as published, not a calculation of which
        requirements apply today. Later courts, corrections or agency actions may change the
        position.
      </p>
      <p>
        Shared docket and regulation identifier (RIN) links connect records. They do not mean one
        document replaces the whole of another. A proposal is not a final rule. A missing record is
        never treated as a withdrawal.
      </p>
      <p>
        The map supplies geographic context only. These records have no verified impact-location
        mapping; state selection does not filter them or imply nationwide applicability. Topic
        labels come from the source, not AI sentiment or importance scores.
      </p>
      <a href={`${base}/data/rules/releases/${data.rules!.manifest.release}/data.json`} download
        >Download this snapshot’s index ↧</a
      >
    </details>
    <div class="rule-stats">
      <div><strong>{dataset.documents.length}</strong><span>tracked records</span></div>
      <div>
        <strong>{dataset.documents.filter((d) => d.type === 'Rule').length}</strong><span
          >rules</span
        >
      </div>
      <div>
        <strong>{dataset.documents.filter((d) => d.type === 'Proposed Rule').length}</strong><span
          >proposals</span
        >
      </div>
      <div><strong>{watch.topics.length}</strong><span>followed topics</span></div>
    </div>
    <div class="rule-filters">
      <label
        >Search records<input
          type="search"
          value={filters.q}
          placeholder="A chemical, action, docket or title…"
          oninput={(e) => navigate({ q: e.currentTarget.value, document: null }, true)}
        /></label
      >
      <label
        >Document type<select
          aria-label="Document type"
          value={filters.type}
          onchange={(e) => navigate({ type: e.currentTarget.value, document: null })}
          ><option value="">All document types</option><option>Rule</option><option
            >Proposed Rule</option
          ><option>Notice</option><option>Presidential Document</option></select
        ></label
      >
      <label
        >Source topic<select
          aria-label="Source topic"
          value={filters.topic}
          onchange={(e) => navigate({ topic: e.currentTarget.value, document: null })}
          ><option value="">All topics</option>{#each topics as topic}<option>{topic}</option
            >{/each}</select
        ></label
      >
    </div>
    <div class="rule-tabs" aria-label="Rulebook views">
      {#each [['documents', 'Documents'], ['following', 'Following'], ['updates', `Updates (${alerts.length})`]] as [id, label]}<button
          class:active={view === id}
          aria-pressed={view === id}
          onclick={() => navigate({ view: id === 'documents' ? null : id, document: null })}
          >{label}</button
        >{/each}<button
        onclick={() =>
          navigate({
            q: null,
            type: null,
            topic: null,
            docket: null,
            rin: null,
            document: null,
            view: null,
          })}>Clear filters</button
      >
    </div>
    {#if filters.docket || filters.rin}<p class="rule-context">
        Linked identifier: {filters.docket || filters.rin}. This is a recorded connection, not proof
        of equivalent legal effect.
      </p>{/if}
    {#if view === 'following' || view === 'updates'}
      <section class="rule-follow">
        <h3>Your topics. On this device.</h3>
        <p>
          Follow a source topic to see its collected records here. Future published snapshots flag
          new or changed matching records. Existing records become your baseline; no email, account
          or background service is enabled.
        </p>
        <p>Includes directly tagged records and their one-step docket, RIN or correction connections. Linked documents are marked separately; we do not invent missing topic labels. This retains connected delay notices that have no topic tags of their own.</p>
        <div class="rule-topics">
          {#each topics as topic}<button
              disabled={!ready}
              aria-pressed={watch.topics.includes(topic)}
              onclick={() => toggleTopic(topic)}
              >{watch.topics.includes(topic) ? '✓' : '+'} {topic}</button
            >{/each}
        </div>
        <div class="rule-tools">
          <button disabled={checking} onclick={checkUpdates}
            >{checking ? 'Checking…' : 'Check for updates'}</button
          ><button disabled={!alerts.length} onclick={markRead}>Mark updates read</button><button
            onclick={exportWatch}>Export topics</button
          ><label class="rule-import"
            >Import topics<input
              type="file"
              accept="application/json,.json"
              onchange={importWatch}
            /></label
          >
        </div>
      </section>
    {/if}
    {#if notice}<p class="rule-notice" role="status">{notice}</p>{/if}
    {#if selected}
      {#key selected.id}<article
          class="rule-detail"
          in:fly={{ y: 12, duration: reduced ? 0 : 220 }}
        >
          <button class="rule-back" onclick={() => navigate({ document: null })}
            >← Back to records</button
          >
          <p class="eyebrow">{selected.id} · {selected.type}</p>
          <h3>{selected.title}</h3>
          <div class="rule-action">
            <span>Agency’s action label</span><strong>{selected.action || 'Not supplied'}</strong>
          </div>
          <p>{selected.abstract || 'No summary supplied. Read the original document.'}</p>
          <div class="rule-date-grid">
            <div><span>Published</span><strong>{selected.publicationDate}</strong></div>
            <div>
              <span>Indexed effective date</span><strong
                >{selected.effectiveOn ?? 'Not supplied'}</strong
              >
            </div>
            <div>
              <span>Indexed comment deadline</span><strong
                >{selected.commentsCloseOn ?? 'Not supplied'}</strong
              >
            </div>
          </div>
          <section class="rule-dates">
            <h4>Read the dates, not just the date field</h4>
            <blockquote>
              {selected.dates ||
                'No dates paragraph supplied by the API. Inspect the original document.'}
            </blockquote>
            <p>
              This paragraph may distinguish partial postponements, applicability dates and
              conditions. The indexed date alone cannot establish the status of the entire rule.
            </p>
          </section>
          <div class="rule-source-links">
            <a href={selected.htmlUrl} target="_blank" rel="noreferrer"
              >Read Federal Register document ↗</a
            ><a href={selected.pdfUrl} target="_blank" rel="noreferrer">Official GovInfo PDF ↗</a>
          </div>
          {#if !selected.topics.length}<p class="rule-context">
              This document has no source topic tags.{#if connectedTopics.length}
                You can follow topics on its identifier-linked records below. These are connections,
                not topic labels assigned to this document.{/if}
            </p>{/if}
          <div class="rule-topics">
            {#each selected.topics.length ? selected.topics : connectedTopics as topic}<button
                disabled={!ready}
                aria-pressed={watch.topics.includes(topic)}
                onclick={() => toggleTopic(topic)}
                >{watch.topics.includes(topic) ? '✓ Following' : '+ Follow'} {topic}</button
              >{/each}
          </div>
          <section class="rule-passages">
            <p class="eyebrow">Inspect the wording</p>
            <h4>Source language, with its context</h4>
            <p>
              Paragraphs from the source XML; whitespace is normalized. Amendatory instructions and
              accompanying regulatory text are shown as published, not a reconstructed current CFR.
              Tables are flattened; use the official PDF for layout, equations and images.
            </p>
            <div class="rule-text-controls">
              <label
                >Source section<select
                  aria-label="Source section"
                  bind:value={textSection}
                  onchange={() => (textLimit = 40)}
                  ><option value="">All extracted passages</option><option value="dates"
                    >Dates</option
                  ><option value="summary">Agency summary</option><option value="supplement"
                    >Agency explanation</option
                  ><option value="regulatory">Amendments & regulatory text</option></select
                ></label
              ><label
                >Find in source<input
                  type="search"
                  bind:value={textQuery}
                  oninput={() => (textLimit = 40)}
                  placeholder="Search these passages…"
                /></label
              >
            </div>
            {#if textLoading}<p role="status">
                Loading verified source passages…
              </p>{:else if textError}<p role="alert">{textError}</p>{:else if !blocks.length}<p
                class="rule-empty"
              >
                No extracted passages match this section and search. Some date changes are stated in
                the dates or agency explanation rather than an amendment block.
              </p>{:else}
              <p class="rule-text-count">
                {blocks.length} matching passages · {selected.amendmentCount} marked amendatory instructions
                in this document
              </p>
              {#each blocks.slice(0, textLimit) as block}<div
                  class="rule-passage"
                  class:amendment={block.kind === 'amendment'}
                  id={`rule-${selected.id}-${block.id}`}
                >
                  <span>{block.section} · {block.kind} · {block.id}</span
                  >{#if block.kind === 'heading'}<h5>{block.text}</h5>{:else}<p>
                      {block.text}
                    </p>{/if}
                </div>{/each}
              {#if blocks.length > textLimit}<button
                  class="rule-more"
                  onclick={() => (textLimit += 40)}
                  >Show 40 more passages ({blocks.length - textLimit} remaining)</button
                >{/if}
            {/if}
            <a href={selected.xmlUrl} target="_blank" rel="noreferrer"
              >Original XML, including unprojected material ↗</a
            >
          </section>
          <section class="rule-connections">
            <p class="eyebrow">Follow the record</p>
            <h4>Connected documents</h4>
            <p>
              Only shared source identifiers or explicit correction relationships connect this
              timeline. Similar wording alone is not a link.
            </p>
            {#each related as connection}<button
                onclick={() => navigate({ document: connection.document.id })}
                ><span>{connection.document.publicationDate} · {connection.document.type}</span
                ><strong>{connection.document.title}</strong><small
                  >{connection.reasons.join(' · ')}</small
                ></button
              >{:else}<p>
                No identifier-linked documents in this collection. That does not establish there are
                none elsewhere.
              </p>{/each}
            <div class="rule-identifiers">
              {#each selected.docketIds as id}<span
                  >Docket: <button
                    onclick={() => navigate({ docket: id, document: null, rin: null })}>{id}</button
                  >{#if /^EPA-HQ-/.test(id)}
                    · <a
                      href={`https://www.regulations.gov/docket/${encodeURIComponent(id)}`}
                      target="_blank"
                      rel="noreferrer">Docket & comments ↗</a
                    >{/if}</span
                >{/each}{#each selected.rins as id}<span
                  >RIN: <button onclick={() => navigate({ rin: id, document: null, docket: null })}
                    >{id}</button
                  ></span
                >{/each}{#each selected.cfr as cfr}<span
                  >{cfr.title} CFR part {cfr.part} · citation, not version proof</span
                >{/each}
            </div>
          </section>
          <details class="rule-method">
            <summary>Provenance & observed revisions</summary>
            <p>
              Captured {selected.source.observedAt}. Source metadata SHA-256:
              <code>{selected.source.hash}</code>. XML SHA-256:
              <code>{selected.source.xmlHash}</code>.
            </p>
            <a href={selected.source.url} target="_blank" rel="noreferrer">Source API record ↗</a>
            {#each dataset.events.filter((e) => e.documentId === selected.id) as event}<p>
                {event.observedAt.slice(0, 10)} · {event.kind === 'document_added'
                  ? 'Newly collected record'
                  : 'Changed captured fields'}: {event.changedFields.join(', ') ||
                  'First seen after baseline'}.
              </p>
              {#if event.previousTextHash && event.previousTextHash !== event.textHash}<a
                  href={`${base}/data/rules/texts/${event.previousTextHash}.json`}
                  download>Download previous extracted text ↧</a
                >{/if}{:else}<p>
                This record establishes a baseline; no later revision has been detected in our
                captured snapshots.
              </p>{/each}
          </details>
        </article>{/key}
    {:else}
      <p class="rule-result-count">
        {displayed.length} records in this view · newest publication first
      </p>
      <div class="rule-list">
        {#each displayed.slice(0, limit) as document}<button
            class="rule-card"
            onclick={() => navigate({ document: document.id })}
            ><span class="rule-card-meta">{document.publicationDate} <b>{document.type}</b></span
            ><strong>{document.title}</strong><span class="rule-card-action"
              >{document.action || 'Action label not supplied'}</span
            >{#if (view === 'following' || view === 'updates') && !document.topics.some( (t) => watch.topics.includes(t) )}<span
                class="rule-card-action"
                >Included via a shared docket, RIN or correction link to a followed topic.</span
              >{/if}<span class="rule-card-footer"
              >{document.id} <span>Inspect the record ↗</span></span
            ></button
          >{:else}<section class="rule-empty">
            <h3>
              {view === 'updates'
                ? 'No unread updates.'
                : view === 'following'
                  ? 'Follow a topic to build your view.'
                  : 'No records match these filters.'}
            </h3>
            <p>
              {view === 'updates'
                ? 'Current records establish your starting point. Updates appear when a later pipeline snapshot contains a new or changed record for a followed topic.'
                : 'Try a broader search or choose a source topic above.'}
            </p>
          </section>{/each}
      </div>
      {#if displayed.length > limit}<button class="rule-more" onclick={() => (limit += 24)}
          >Show 24 more records</button
        >{/if}
    {/if}
    <footer class="rule-footer">
      Sources over scores. Dates with context. <a href={`${base}/records/trials/`}
        >Explore research records ↗</a
      >
    </footer>
  {/if}
</div>

<style>
  .rules-page {
    --accent: #6850aa;
    --wash: #f2eff9;
    color: #1d354c;
  }
  .rule-kicker,
  .rule-coverage,
  .rule-tools,
  .rule-source-links,
  .rule-card-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .rule-kicker {
    justify-content: space-between;
    font-size: 10px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: #627e9b;
  }
  .rules-page a {
    color: var(--accent);
  }
  .rule-heading {
    margin: 36px 0 24px;
    max-width: 630px;
  }
  .rule-heading h2 {
    font: 700 clamp(48px, 5vw, 78px)/0.95 var(--condensed);
    margin: 10px 0 20px;
    letter-spacing: -1px;
  }
  .rule-heading em {
    font-style: normal;
    color: var(--accent);
  }
  .rule-heading p:not(.eyebrow) {
    font-size: 15px;
    line-height: 1.7;
    color: #577089;
    max-width: 550px;
  }
  .rule-coverage {
    font-size: 11px;
    border-block: 1px solid #dce5ef;
    padding: 14px 0;
    color: #60788e;
  }
  .rule-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 5px var(--wash);
  }
  .rule-method {
    font-size: 12px;
    line-height: 1.7;
    color: #546b81;
    margin: 18px 0;
  }
  .rule-method summary {
    cursor: pointer;
    color: var(--accent);
  }
  .rule-method code {
    overflow-wrap: anywhere;
    font-size: 10px;
  }
  .rule-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 24px 0;
  }
  .rule-stats div {
    border-left: 2px solid #d9d0ed;
    padding-left: 14px;
  }
  .rule-stats strong {
    display: block;
    font: 700 36px var(--condensed);
  }
  .rule-stats span {
    font-size: 10px;
    color: #667e95;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .rule-filters {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 14px;
  }
  .rule-filters label:first-child {
    grid-column: 1/-1;
  }
  .rules-page label {
    display: grid;
    gap: 6px;
    font-size: 11px;
    color: #58728a;
  }
  .rules-page input,
  .rules-page select {
    min-width: 0;
    max-width: 100%;
    width: 100%;
    border: 1px solid #cdddeb;
    background: #fff;
    color: #243b51;
    border-radius: 4px;
    padding: 12px;
    font: inherit;
    font-size: 13px;
    box-sizing: border-box;
  }
  .rule-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    border-bottom: 1px solid #dce5ef;
    padding: 20px 0;
  }
  .rule-tabs button,
  .rule-tools button,
  .rule-back,
  .rule-more {
    background: #edf3fa;
    border: 0;
    border-radius: 4px;
    padding: 12px 14px;
    font-size: 12px;
    color: #385d81;
    cursor: pointer;
  }
  .rule-tabs button.active {
    background: var(--accent);
    color: white;
  }
  .rule-result-count {
    font-size: 12px;
    color: #5c7892;
    margin: 22px 0 12px;
  }
  .rule-list {
    display: grid;
    gap: 12px;
  }
  .rule-card {
    display: grid;
    gap: 10px;
    text-align: left;
    background: linear-gradient(120deg, #fff, #faf9fd);
    border: 1px solid #dce5ef;
    border-left: 3px solid #b6a4da;
    padding: 20px;
    border-radius: 5px;
    color: inherit;
    cursor: pointer;
    transition:
      transform 0.18s,
      box-shadow 0.18s;
  }
  .rule-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 22px #293c5810;
  }
  .rule-card-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    color: #60758d;
  }
  .rule-card-meta b {
    background: var(--wash);
    padding: 4px 8px;
    border-radius: 3px;
    color: var(--accent);
    font-weight: 500;
  }
  .rule-card > strong {
    font: 600 25px/1.1 var(--condensed);
  }
  .rule-card-action {
    font-size: 12px;
    line-height: 1.5;
    color: #536e85;
  }
  .rule-card-footer {
    justify-content: space-between;
    font-size: 10px;
    color: #71869a;
  }
  .rule-card-footer > span {
    color: var(--accent);
  }
  .rule-detail {
    border-top: 3px solid var(--accent);
    margin-top: 24px;
    padding-top: 20px;
  }
  .rule-detail > .eyebrow {
    margin-top: 28px;
  }
  .rule-detail > h3 {
    font: 600 39px/1.1 var(--condensed);
    margin: 15px 0 20px;
  }
  .rule-detail > p {
    font-size: 14px;
    line-height: 1.8;
    color: #50677e;
  }
  .rule-action {
    display: grid;
    gap: 6px;
    background: var(--wash);
    padding: 15px 18px;
    border-radius: 4px;
    font-size: 13px;
  }
  .rule-action span,
  .rule-date-grid span {
    font-size: 10px;
    color: #687d91;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .rule-action strong {
    font-weight: 600;
  }
  .rule-date-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 28px 0;
  }
  .rule-date-grid div {
    display: grid;
    gap: 8px;
  }
  .rule-date-grid strong {
    font-size: 14px;
  }
  .rules-page h4 {
    font: 600 27px var(--condensed);
    margin: 8px 0 12px;
  }
  .rule-dates {
    padding: 18px;
    border-left: 2px solid var(--accent);
    background: var(--wash);
  }
  .rule-dates blockquote {
    font-size: 14px;
    line-height: 1.8;
    margin: 0;
  }
  .rule-dates p {
    font-size: 11px;
    line-height: 1.6;
    color: #6d6384;
  }
  .rule-source-links {
    margin: 22px 0;
    font-size: 12px;
  }
  .rule-topics {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 20px 0;
  }
  .rule-topics button {
    border: 1px solid #d4cae8;
    border-radius: 20px;
    padding: 8px 12px;
    background: #fff;
    color: var(--accent);
    font-size: 11px;
    cursor: pointer;
  }
  .rule-topics button[aria-pressed='true'] {
    background: var(--wash);
    border-color: var(--accent);
  }
  .rule-passages,
  .rule-connections {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid #dce5ef;
  }
  .rule-passages > p,
  .rule-connections > p,
  .rule-follow > p {
    font-size: 12px;
    line-height: 1.7;
    color: #60788e;
  }
  .rule-text-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 20px 0;
  }
  .rule-text-count {
    font-size: 10px !important;
  }
  .rule-passage {
    padding: 14px 0;
    border-bottom: 1px solid #e4ebf1;
  }
  .rule-passage > span {
    font-size: 9px;
    color: #70869a;
    text-transform: uppercase;
    letter-spacing: 0.7px;
  }
  .rule-passage p {
    font-size: 13px;
    line-height: 1.85;
    margin: 8px 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .rule-passage h5 {
    font-size: 16px;
    line-height: 1.5;
    margin: 10px 0;
  }
  .rule-passage.amendment {
    border-left: 3px solid var(--accent);
    padding-left: 15px;
    background: var(--wash);
  }
  .rule-passages > a {
    display: inline-block;
    font-size: 12px;
    margin-top: 20px;
  }
  .rule-connections > button {
    display: grid;
    gap: 8px;
    width: 100%;
    margin: 10px 0;
    text-align: left;
    background: #fff;
    border: 1px solid #dce5ef;
    border-left: 2px solid var(--accent);
    padding: 16px;
    color: inherit;
    cursor: pointer;
  }
  .rule-connections > button span,
  .rule-connections small {
    font-size: 10px;
    color: #687c93;
    line-height: 1.6;
  }
  .rule-connections strong {
    font: 600 22px/1.15 var(--condensed);
  }
  .rule-identifiers {
    display: grid;
    gap: 10px;
    margin-top: 24px;
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .rule-identifiers button {
    font: inherit;
    background: none;
    border: 0;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
  .rule-follow {
    background: #f6f4fb;
    border-radius: 5px;
    padding: 20px;
    margin: 22px 0;
  }
  .rule-follow h3 {
    font: 600 29px var(--condensed);
    margin: 0;
  }
  .rule-tools {
    gap: 8px;
  }
  .rule-import {
    cursor: pointer;
  }
  .rule-import input {
    font-size: 10px;
    padding: 6px;
    width: 190px;
  }
  .rule-context,
  .rule-notice {
    font-size: 12px;
    line-height: 1.6;
    background: var(--wash);
    padding: 14px;
  }
  .rule-empty {
    background: #f3f7fb;
    padding: 24px;
    margin: 20px 0;
    font-size: 13px;
    line-height: 1.7;
  }
  .rule-empty h3 {
    font: 600 28px var(--condensed);
    margin: 0 0 10px;
  }
  .rule-more {
    margin: 20px 0;
  }
  .rule-footer {
    margin: 40px 0 12px;
    padding-top: 20px;
    border-top: 1px solid #dce5ef;
    font-size: 10px;
    color: #667e95;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .rules-page button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .rules-page :focus-visible {
    outline: 3px solid #9380c3;
    outline-offset: 3px;
  }
  @media (max-width: 650px) {
    .rule-heading {
      margin-top: 28px;
    }
    .rule-heading h2 {
      font-size: 56px;
    }
    .rule-stats {
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    .rule-filters,
    .rule-text-controls,
    .rule-date-grid {
      grid-template-columns: 1fr;
    }
    .rule-detail > h3 {
      font-size: 32px;
    }
    .rule-card {
      padding: 16px;
    }
    .rule-kicker {
      font-size: 9px;
    }
    .rule-follow {
      padding: 16px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rule-card {
      transition: none;
    }
    .rule-card:hover {
      transform: none;
    }
  }
</style>
