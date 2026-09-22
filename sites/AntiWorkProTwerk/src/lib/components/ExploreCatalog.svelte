<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import {
    catalogGroups,
    catalogViews,
    searchCatalog,
    type CatalogGroup,
  } from '$lib/civic/catalog';
  import type { ConnectionsData } from '$lib/civic/connections';
  let { companyCik }: { companyCik?: string } = $props();
  let open = $state(false),
    ready = $state(false),
    query = $state(''),
    group = $state<CatalogGroup>('all');
  let index = $state.raw<ConnectionsData | null>(null),
    checking = $state(false),
    connectionError = $state('');
  let searchInput: HTMLInputElement | undefined = $state();
  const results = $derived(searchCatalog(query, group));
  const related = $derived(index?.entities.find((e) => e.cik === companyCik));
  const relatedViews = $derived(
    related?.views.filter((v) => !page.url.pathname.includes(`/records/${v.kind}/`)) ?? [],
  );
  const current = $derived(
    catalogViews.find((v) => page.url.pathname.startsWith(`${base}${v.path}`)),
  );
  const resultGroups = $derived(
    catalogGroups.filter((g) => g.id !== 'all' && results.some((v) => v.group === g.id)),
  );
  $effect(() => {
    if (!open) return;
    if (!companyCik) {
      index = null;
      return;
    }
    let stopped = false;
    checking = true;
    connectionError = '';
    import('$lib/civic/connections-repository')
      .then((module) => module.loadConnections(fetch, base))
      .then((bundle) => {
        if (!stopped) index = bundle.data;
      })
      .catch(() => {
        if (!stopped) {
          index = null;
          connectionError =
            'Related records could not be checked. All views are still available below.';
        }
      })
      .finally(() => {
        if (!stopped) checking = false;
      });
    return () => {
      stopped = true;
    };
  });
  function closeForNavigation(event: MouseEvent) {
    // Modified clicks open a new tab and should leave this exploration state alone.
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0)
      open = false;
  }
  onMount(() => {
    ready = true;
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !event.altKey &&
        !event.repeat
      ) {
        if (!open && document.querySelector('[role="dialog"][data-state="open"],dialog[open]'))
          return;
        event.preventDefault();
        open = !open;
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger class="explore-trigger" disabled={!ready}
    ><span aria-hidden="true">▦</span> Explore data
    <kbd aria-hidden="true">⌘ / Ctrl K</kbd></Dialog.Trigger
  >
  <Dialog.Portal>
    <Dialog.Overlay class="catalog-overlay" />
    <Dialog.Content
      class="catalog-dialog"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        tick().then(() => searchInput?.focus());
      }}
    >
      <div class="catalog-top">
        <span>LOUDER THAN WORDS / EXPLORE</span><Dialog.Close
          class="catalog-close"
          aria-label="Close data explorer">×</Dialog.Close
        >
      </div>
      <div class="catalog-heading">
        <div>
          <Dialog.Title class="catalog-title"
            >Find a thread.<br /><em>Follow the evidence.</em></Dialog.Title
          ><Dialog.Description class="catalog-description"
            >Explore collected records by question, topic or source. Every view explains its
            coverage and limits.</Dialog.Description
          >
        </div>
        <div class="catalog-mark" aria-hidden="true">
          <svg viewBox="0 0 130 110"
            ><path d="M25 55C55 55 65 20 105 20M25 55H105M25 55C55 55 65 90 105 90" /><circle
              cx="25"
              cy="55"
              r="9"
            /><circle cx="105" cy="20" r="5" /><circle cx="105" cy="55" r="5" /><circle
              cx="105"
              cy="90"
              r="5"
            /></svg
          ><span>CONNECT THE RECORDS</span>
        </div>
      </div>
      <div class="catalog-search">
        <span aria-hidden="true">⌕</span><label for="catalog-search" class="catalog-sr"
          >Search data views</label
        ><input
          bind:this={searchInput}
          id="catalog-search"
          type="search"
          bind:value={query}
          placeholder="Try water, company ownership, or research…"
          autocomplete="off"
        />{#if query}<button
            aria-label="Clear data search"
            onclick={() => {
              query = '';
              searchInput?.focus();
            }}>×</button
          >{:else}<kbd aria-hidden="true">ESC TO CLOSE</kbd>{/if}
      </div>
      <div class="catalog-filters" aria-label="Data topics">
        {#each catalogGroups as item}<button
            class:chosen={group === item.id}
            aria-pressed={group === item.id}
            style={`--topic:${item.color}`}
            onclick={() => (group = item.id)}>{item.label}</button
          >{/each}
      </div>
      <div class="catalog-scroll">
        {#if companyCik && !query && group === 'all'}
          {#if checking}<p class="catalog-related-status" role="status">
              Checking exact-ID connections for this company…
            </p>
          {:else if connectionError}<p class="catalog-related-status" role="status">
              {connectionError}
            </p>
          {:else if related && relatedViews.length}<aside class="catalog-related">
              <div>
                <span>KEEP FOLLOWING THIS COMPANY</span>
                <h3>{related.ticker || related.name}</h3>
                <p>Same SEC issuer ID · {related.cik}</p>
              </div>
              <div class="related-links">
                {#each relatedViews as view}<a
                    href={`${base}${view.href}`}
                    onclick={closeForNavigation}
                    >{catalogViews.find((v) => v.id === view.kind)?.title}<span>↗</span></a
                  >{/each}
              </div>
              <small
                >These links preserve verified company identity, not a claim of causation.</small
              >
            </aside>{/if}
        {/if}
        <div class="catalog-results-line" role="status">
          <span
            >{results.length}
            {results.length === 1 ? 'view' : 'views'}{query
              ? ` for “${query}”`
              : ' to explore'}</span
          >{#if current}<span>Currently: {current.title}</span>{/if}
        </div>
        {#if !results.length}<div class="catalog-empty">
            <span aria-hidden="true">⌕</span>
            <h3>No matching view</h3>
            <p>
              Try a broader topic, or clear the filters. This searches the available tools—not every
              record inside them.
            </p>
            <button
              onclick={() => {
                query = '';
                group = 'all';
                searchInput?.focus();
              }}>Show all data views</button
            >
          </div>{/if}
        {#each resultGroups as section}
          <section
            class="catalog-group"
            style={`--topic:${section.color}`}
            aria-labelledby={`catalog-${section.id}`}
          >
            <h3 id={`catalog-${section.id}`}>
              <i></i>{section.label}<span
                >{results.filter((v) => v.group === section.id).length}</span
              >
            </h3>
            <div class="catalog-cards">
              {#each results.filter((v) => v.group === section.id) as view}<a
                  class="catalog-card"
                  class:current={current?.id === view.id}
                  href={`${base}${view.path}`}
                  onclick={closeForNavigation}
                  aria-current={current?.id === view.id ? 'page' : undefined}
                  ><div class="catalog-card-top">
                    <span
                      >{view.sample
                        ? 'ILLUSTRATIVE DEMO'
                        : current?.id === view.id
                          ? 'YOU ARE HERE'
                          : 'EXPLORE THE RECORD'}</span
                    ><b aria-hidden="true">↗</b>
                  </div>
                  <h4>{view.title}</h4>
                  <p>{view.question}</p>
                  <small>{view.source}</small></a
                >{/each}
            </div>
          </section>
        {/each}
        <footer class="catalog-footer">
          <span>Open a view → choose a record → read its source.</span>
          <p>
            Views open with their full collected scope. State and company filters remain explicit
            inside each view.
          </p>
        </footer>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.explore-trigger) {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: #edf4f7;
    border: 1px solid #cbdae4;
    border-radius: 5px;
    padding: 7px 10px !important;
    color: #315c71 !important;
    font-size: 9px !important;
    letter-spacing: 0.8px !important;
    white-space: nowrap;
    min-height: 32px;
  }
  :global(.explore-trigger > span) {
    font-size: 15px;
    line-height: 1;
  }
  :global(.explore-trigger kbd) {
    font:
      8px 'Inter Variable',
      sans-serif;
    opacity: 0.65;
    letter-spacing: 0;
  }
  :global(.explore-trigger:focus-visible) {
    outline: 3px solid #507e88;
    outline-offset: 3px;
  }
  :global(.catalog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: #18334566;
    animation: catalog-fade 0.16s ease-out;
  }
  :global(.catalog-dialog) {
    position: fixed;
    z-index: 81;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(1000px, calc(100vw - 48px));
    height: min(870px, calc(100dvh - 48px));
    display: flex;
    flex-direction: column;
    background: #fbfdfe;
    border: 1px solid #d6e3e9;
    border-radius: 18px;
    box-shadow: 0 30px 100px #0b273d40;
    padding: 24px 28px 0;
    color: #193240;
    animation: catalog-enter 0.23s ease-out;
    /* The mounted dialog is its own paint surface above the live WebGL map. */
    contain: layout paint;
    will-change: transform;
    overflow: hidden;
    outline: none;
  }
  .catalog-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: #668895;
    font-size: 9px;
    letter-spacing: 2px;
    font-weight: 700;
  }
  :global(.catalog-close) {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border: 1px solid #d6e3e9;
    border-radius: 50%;
    background: white;
    font-size: 24px;
    color: #52727f;
    flex-shrink: 0;
  }
  .catalog-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
    margin: 12px 0 20px;
  }
  :global(.catalog-title) {
    font:
      700 48px/0.98 'Barlow Condensed',
      sans-serif;
    letter-spacing: -0.7px;
    margin: 0;
  }
  :global(.catalog-title em) {
    font-style: normal;
    color: #537f86;
  }
  :global(.catalog-description) {
    color: #647f8b;
    font-size: 12px;
    line-height: 1.65;
    max-width: 570px;
    margin: 13px 0 0;
  }
  .catalog-mark {
    width: 160px;
    flex-shrink: 0;
  }
  .catalog-mark svg {
    width: 130px;
    height: 110px;
    display: block;
    margin: auto;
  }
  .catalog-mark path {
    fill: none;
    stroke: #87a9ae;
    stroke-width: 1.5;
    stroke-dasharray: 170;
    animation: catalog-trace 0.7s ease-out;
  }
  .catalog-mark circle {
    fill: #fbfdfe;
    stroke: #668f96;
    stroke-width: 2;
  }
  .catalog-mark span {
    display: block;
    text-align: center;
    font-size: 7px;
    letter-spacing: 2px;
    color: #6b8a94;
  }
  .catalog-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    background: white;
    border: 1px solid #bfd3de;
    border-radius: 9px;
    padding: 0 13px;
    box-shadow: 0 3px 9px #304d6004;
  }
  .catalog-search > span {
    font-size: 26px;
    color: #638693;
  }
  .catalog-search input {
    flex: 1;
    min-width: 0;
    font:
      13px 'Inter Variable',
      sans-serif;
    padding: 15px 90px 15px 0;
    border: 0;
    outline: none;
    background: transparent;
    color: #173544;
  }
  .catalog-search:focus-within {
    outline: 2px solid #527f88;
    outline-offset: 2px;
  }
  .catalog-search input::-webkit-search-cancel-button {
    display: none;
  }
  .catalog-search button {
    position: absolute;
    right: 13px;
    background: transparent;
    font-size: 23px;
    color: #638693;
    min-width: 32px;
    min-height: 38px;
  }
  .catalog-search kbd {
    position: absolute;
    right: 13px;
    font:
      8px 'Inter Variable',
      sans-serif;
    letter-spacing: 1px;
    color: #859aa3;
    white-space: nowrap;
  }
  .catalog-filters {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
    margin: 17px 0;
  }
  .catalog-filters button {
    font-size: 10px;
    border: 1px solid #dce6ec;
    background: white;
    border-radius: 30px;
    padding: 8px 12px;
    color: #546e7a;
    transition:
      background 0.16s,
      border-color 0.16s;
  }
  .catalog-filters button.chosen {
    background: color-mix(in srgb, var(--topic) 12%, white);
    border-color: var(--topic);
    color: #203d4b;
  }
  .catalog-scroll {
    flex: 1;
    contain: layout paint;
    overflow: auto;
    overscroll-behavior: contain;
    margin: 0 -28px;
    padding: 0 28px 24px;
    scrollbar-width: thin;
    min-height: 80px;
  }
  .catalog-results-line {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 9px;
    line-height: 1.7;
    color: #718995;
    border-top: 1px solid #dce6ec;
    padding-top: 14px;
    margin: 0 0 13px;
  }
  .catalog-group {
    margin-bottom: 22px;
  }
  .catalog-group > h3 {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 10px;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    margin: 0 0 11px;
    color: #526d7b;
  }
  .catalog-group h3 i {
    height: 5px;
    width: 5px;
    border-radius: 50%;
    background: var(--topic);
  }
  .catalog-group h3 > span {
    margin-left: auto;
    font:
      9px 'Inter Variable',
      sans-serif;
    color: #879ca6;
    letter-spacing: 0;
  }
  .catalog-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .catalog-card {
    text-decoration: none;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid #dce6ec;
    border-radius: 10px;
    background: white;
    padding: 15px 16px;
    color: #183440;
    transition:
      transform 0.18s,
      box-shadow 0.18s,
      border-color 0.18s;
  }
  .catalog-card:hover {
    transform: translateY(-3px);
    border-color: var(--topic);
    box-shadow: 0 8px 18px #2446510c;
  }
  .catalog-card.current {
    border-color: var(--topic);
    background: color-mix(in srgb, var(--topic) 5%, white);
  }
  .catalog-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
  }
  .catalog-card-top > span {
    font-size: 7px;
    letter-spacing: 1.3px;
    color: var(--topic);
  }
  .catalog-card-top b {
    font-size: 17px;
    color: var(--topic);
    font-weight: 400;
  }
  .catalog-card h4 {
    font:
      700 25px/1.05 'Barlow Condensed',
      sans-serif;
    margin: 8px 0;
  }
  .catalog-card p {
    font-size: 11px;
    color: #627d89;
    line-height: 1.65;
    margin: 0 0 15px;
  }
  .catalog-card small {
    font-size: 8px;
    line-height: 1.5;
    color: #7a929d;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid #eaf0f4;
  }
  .catalog-footer {
    border-top: 1px solid #dce6ec;
    padding-top: 15px;
    font-size: 10px;
    color: #4e707d;
  }
  .catalog-footer p {
    font-size: 9px;
    color: #78909b;
    line-height: 1.6;
    margin: 7px 0 0;
  }
  .catalog-empty {
    text-align: center;
    padding: 28px 20px 35px;
  }
  .catalog-empty > span {
    font-size: 32px;
    color: #78909b;
  }
  .catalog-empty h3 {
    font:
      700 29px 'Barlow Condensed',
      sans-serif;
    margin: 5px 0;
  }
  .catalog-empty p {
    font-size: 12px;
    color: #66808c;
    line-height: 1.7;
    max-width: 410px;
    margin: 10px auto 20px;
  }
  .catalog-empty button {
    padding: 11px 16px;
    background: #284f61;
    color: white;
    border-radius: 7px;
    font-size: 11px;
  }
  .catalog-related {
    display: grid;
    grid-template-columns: 1fr 1.6fr;
    gap: 14px;
    padding: 17px;
    background: linear-gradient(120deg, #edf5f4, #f5f8fb);
    border: 1px solid #ccdfdf;
    border-radius: 11px;
    margin: 2px 0 18px;
  }
  .catalog-related > div > span {
    font-size: 7px;
    letter-spacing: 1.5px;
    color: #5c8589;
  }
  .catalog-related h3 {
    font:
      700 29px 'Barlow Condensed',
      sans-serif;
    margin: 6px 0;
  }
  .catalog-related p {
    font-size: 9px;
    color: #63828c;
    margin: 0;
  }
  .catalog-related > small {
    grid-column: 1/-1;
    font-size: 9px;
    color: #6b838e;
  }
  .related-links {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .related-links a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex: 1;
    padding: 12px;
    background: #fff;
    border: 1px solid #d0e0e4;
    border-radius: 8px;
    font-size: 11px;
    text-decoration: none;
    color: #355d6b;
    min-width: 145px;
  }
  .related-links a span {
    color: #7a9d9f;
  }
  .catalog-related-status {
    font-size: 11px;
    color: #62818c;
    margin: 4px 0 16px;
  }
  .catalog-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  .catalog-scroll a:focus-visible,
  .catalog-filters button:focus-visible,
  :global(.catalog-close:focus-visible),
  .catalog-search button:focus-visible,
  .catalog-empty button:focus-visible {
    outline: 3px solid #527f88;
    outline-offset: 3px;
  }
  @keyframes catalog-enter {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 12px));
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }
  @keyframes catalog-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes catalog-trace {
    from {
      stroke-dashoffset: 170;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @media (max-width: 650px) {
    :global(.explore-trigger kbd) {
      display: none;
    }
    :global(.explore-trigger) {
      font-size: 8px !important;
      padding: 5px 8px !important;
      min-height: 28px;
    }
    :global(.catalog-dialog) {
      width: calc(100vw - 18px);
      height: calc(100dvh - 22px);
      border-radius: 13px;
      padding: 16px 16px 0;
    }
    .catalog-heading {
      margin: 10px 0 15px;
      gap: 12px;
    }
    :global(.catalog-title) {
      font-size: 39px;
    }
    :global(.catalog-description) {
      font-size: 11px;
      margin-top: 10px;
    }
    .catalog-mark {
      display: none;
    }
    .catalog-top {
      font-size: 7px;
      letter-spacing: 1.6px;
    }
    .catalog-search input {
      font-size: 12px;
      padding: 14px 44px 14px 0;
    }
    .catalog-search kbd {
      display: none;
    }
    .catalog-filters {
      gap: 6px;
      margin: 13px 0;
    }
    .catalog-filters button {
      font-size: 9px;
      padding: 8px 10px;
      min-height: 34px;
    }
    .catalog-scroll {
      margin: 0 -16px;
      padding: 0 16px 20px;
    }
    .catalog-cards {
      grid-template-columns: 1fr;
    }
    .catalog-card {
      padding: 14px 16px;
    }
    .catalog-card h4 {
      font-size: 27px;
    }
    .catalog-card p {
      font-size: 12px;
    }
    .catalog-card small {
      font-size: 9px;
    }
    .catalog-results-line > span:last-child:not(:first-child) {
      display: none;
    }
    .catalog-related {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .catalog-related > small {
      font-size: 9px;
    }
    .related-links a {
      font-size: 11px;
      padding: 12px;
    }
    .catalog-empty {
      padding: 16px 6px 30px;
    }
  }
  @media (max-height: 600px) {
    .catalog-heading { margin: 7px 0 12px; }
    :global(.catalog-title) { font-size: 28px; }
    :global(.catalog-description), .catalog-mark { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.catalog-dialog),
    :global(.catalog-overlay),
    .catalog-mark path {
      animation: none;
    }
    .catalog-card,
    .catalog-filters button {
      transition: none;
    }
    .catalog-card:hover {
      transform: none;
    }
  }
</style>
