<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { Dialog } from 'bits-ui';
  import { createQuery } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { createRepository, money } from '$lib/data/repository';
  import type { Panel, StateSummary } from '$lib/data/schema';
  import { readSaved, writeSaved, accountRequest, type SavedItem } from '$lib/account/client';
  import AccountPanel from './AccountPanel.svelte';
  let {
    panel,
    personId,
    summary,
    release,
    onclose,
    onnavigate,
  }: {
    panel: Panel;
    personId: string;
    summary: StateSummary | undefined;
    release: string;
    onclose: () => void;
    onnavigate: (panel: Panel, id?: string) => void;
  } = $props();
  const repository = createRepository(base);
  const needsPerson = $derived(['profile', 'call', 'votes', 'donors', 'bills'].includes(panel));
  const personQuery = createQuery(() => ({
    queryKey: ['person', release, personId],
    queryFn: ({ signal }) => repository.getPolitician(release, personId, signal),
    enabled: browser && needsPerson && !!personId,
    staleTime: Infinity,
  }));
  const person = $derived(personQuery.data);
  const titles: Record<Panel, string> = {
    people: 'Politicians',
    call: 'Make your voice heard.',
    votes: 'Follow the record.',
    donors: 'Follow the funding.',
    compare: 'Find your common ground.',
    bills: 'See policy in motion.',
    profile: 'Your representative.',
    account: 'Make it personal.',
    saved: 'Keep them in view.',
    impact: 'Information into action.',
  };
  let saved = $state<SavedItem[]>([]),
    local = $state(true),
    message = $state(''),
    note = $state(''),
    saving = $state(false),
    premium = $state('');
  const isSaved = $derived(saved.some((item) => item.politician_id === personId));
  $effect(() => {
    note = saved.find((item) => item.politician_id === personId)?.note ?? '';
    premium = '';
  });
  onMount(() => {
    loadSaved();
  });
  async function loadSaved() {
    try {
      const result = await readSaved();
      saved = result.items;
      local = result.local;
    } catch (error) {
      message = (error as Error).message;
    }
  }
  async function save(remove = false) {
    if (!person) return;
    saving = true;
    try {
      await writeSaved(
        { politician_id: person.id, name: person.name, state: person.state, note },
        remove,
      );
      await loadSaved();
      message = remove
        ? 'Representative removed.'
        : local
          ? 'Saved on this device.'
          : 'Saved to your account.';
    } catch (error) {
      message = (error as Error).message;
    } finally {
      saving = false;
    }
  }
  async function removeItem(item: SavedItem) {
    try {
      await writeSaved(item, true);
      await loadSaved();
    } catch (error) {
      message = (error as Error).message;
    }
  }
  async function loadPremium() {
    try {
      const result = await accountRequest(`premium/${personId}`);
      premium = result.analysis;
    } catch (error) {
      premium = (error as Error).message;
    }
  }
</script>

<Dialog.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onclose();
  }}
>
  <Dialog.Portal
    ><Dialog.Overlay class="detail-overlay" /><Dialog.Content
      class="detail-sheet"
      aria-describedby="detail-description"
      ><div class="dialog-top">
        <span class="eyebrow">Louder Than Words / {summary?.state.name ?? 'United States'}</span
        ><Dialog.Close class="close-dialog" aria-label="Close details">×</Dialog.Close>
      </div>
      <Dialog.Title class="detail-title"
        >{panel === 'profile' && person ? person.name : titles[panel]}</Dialog.Title
      ><Dialog.Description id="detail-description" class="detail-description"
        >{panel === 'account'
          ? 'Your account, saved representatives, and subscription.'
          : panel === 'saved'
            ? 'Your saved representatives and private notes.'
            : 'Explore illustrative civic records. All political figures and positions below are sample data.'}</Dialog.Description
      >
      {#if needsPerson}<nav class="detail-tabs" aria-label="Representative details">
          {#each [['profile', 'Profile'], ['votes', 'Votes'], ['donors', 'Donations'], ['bills', 'Bills']] as [id, label]}<button
              class:active={panel === id}
              aria-current={panel === id ? 'page' : undefined}
              onclick={() => onnavigate(id as Panel, personId)}>{label}</button
            >{/each}
        </nav>{/if}
      {#if needsPerson && panel !== 'profile'}<label class="field-label" for="person-select"
          >Representative</label
        ><select
          id="person-select"
          value={personId}
          onchange={(e) => onnavigate(panel, e.currentTarget.value)}
          >{#each summary?.people ?? [] as p}<option value={p.id}>{p.name}</option>{/each}</select
        >{/if}
      {#if needsPerson}
        {#if personQuery.isPending || !personId}<div class="detail-loading" role="status">
            <div class="card-skeleton"></div>
            <p>Loading the selected record…</p>
          </div>
        {:else if personQuery.isError}<div class="empty-state">
            <h3>Couldn’t load this record.</h3>
            <p>{personQuery.error.message}</p>
            <button class="primary-button" onclick={() => personQuery.refetch()}>Try again</button>
          </div>
        {:else if person}<div class="detail-body" in:fade={{ duration: 120 }}>
            {#if panel === 'profile'}<div class="detail-profile">
                {#if person.portrait}<img
                    src={`${base}/assets/${person.portrait}`}
                    alt={`Portrait of ${person.name}`}
                  />{:else}<div class="portrait-placeholder">
                    {person.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>{/if}
                <div>
                  <span class={`party ${person.party}`}>{person.party}</span>
                  <p>{person.role}</p>
                  <p>{person.description}</p>
                </div>
              </div>
              <div class="issue-tags">
                {#each person.issues as issue}<span>{issue}</span>{/each}
              </div>
              <dl class="detail-metrics">
                <div>
                  <dt>Sample approval</dt>
                  <dd>{person.approval}%</dd>
                </div>
                <div>
                  <dt>Sample donations</dt>
                  <dd>{money(person.donations)}</dd>
                </div>
                <div>
                  <dt>Sample bills</dt>
                  <dd>{person.billCount}</dd>
                </div>
              </dl>
              <div class="profile-actions">
                <button class="primary-button" onclick={() => onnavigate('votes', person.id)}
                  >Explore votes ↗</button
                ><button class="secondary-button" disabled={saving} onclick={() => save(isSaved)}
                  >{isSaved ? 'Unsave representative' : 'Save representative'}</button
                >
              </div>
              <label class="field-label" for="private-note"
                >Private note {local ? '· this device' : ''}</label
              ><textarea
                id="private-note"
                maxlength="2000"
                placeholder="What would you like to follow up on?"
                bind:value={note}></textarea><button
                class="secondary-button"
                disabled={saving}
                onclick={() => save(false)}>Save note</button
              >
              <details class="premium-detail">
                <summary>Subscriber analysis</summary>
                <p>
                  Subscriber records are delivered only after your account’s access is verified.
                </p>
                <button class="secondary-button" onclick={loadPremium}
                  >Load subscriber analysis</button
                >{#if premium}<p role="status">{premium}</p>{/if}
              </details>
            {:else if panel === 'call'}<div class="contact-card">
                <span class="eyebrow">Sample office contact</span>
                <h3>{person.name}</h3>
                <p>{person.role}</p>
                <strong>(202) 555-0110</strong><small
                  >Placeholder number. Calling is disabled in this demo.</small
                >
              </div>
              <h3>A simple starting point</h3>
              <blockquote>
                “Hi, I’m a constituent from {summary?.state.name}. I’m calling about an issue that
                matters to my community. Could you share the representative’s position?”
              </blockquote>
            {:else if panel === 'votes'}<div class="vote-list">
                {#each person.votes as record}<div>
                    <span
                      ><small>{record.bill.number} · {record.date} · Sample vote</small><strong
                        >{record.bill.title}</strong
                      ></span
                    ><b class="vote" class:nay={record.vote === 'Nay'}>{record.vote}</b>
                  </div>{/each}
              </div>
              <p class="record-note">
                {person.alignment}% sample vote alignment · {person.billCount} sample bills
              </p>
            {:else if panel === 'donors'}<div class="donor-total">
                <span>Sample contributions</span><strong>{money(person.donations)}</strong>
              </div>
              {#each person.donors as donor}<div class="donor-row">
                  <div><span>{donor.category}</span><strong>{money(donor.amount)}</strong></div>
                  <meter
                    min="0"
                    max={person.donations}
                    value={donor.amount}
                    aria-label={donor.category}
                    >{Math.round((donor.amount / person.donations) * 100)}%</meter
                  >
                </div>{/each}
            {:else if panel === 'bills'}<div class="bill-list">
                {#each person.bills as bill}<article>
                    <div class="bill-meta">
                      <span>{bill.number} · Fictional bill</span><span>{bill.status}</span>
                    </div>
                    <h3>{bill.title}</h3>
                    <p>{bill.description}</p>
                  </article>{/each}
              </div>{/if}
            <details class="source-details">
              <summary>Source &amp; dataset details</summary>
              <p>
                Source: {person.source.id}<br />Collected: {person.source.collectedAt.slice(
                  0,
                  10,
                )}<br />Transformation: {person.source.transformationVersion}<br />Dataset: {release}
              </p>
              <a href={person.source.url} target="_blank" rel="noreferrer">Source information ↗</a>
            </details>
          </div>{/if}
      {:else if panel === 'compare'}<div class="comparison-list">
          {#each summary?.people ?? [] as p}<div>
              <h3>{p.name} <span class={`party ${p.party}`}>{p.party}</span></h3>
              <div class="issue-tags">
                {#each p.issues as issue}<span>{issue}</span>{/each}
              </div>
              <button class="text-button" onclick={() => onnavigate('profile', p.id)}
                >Explore profile ↗</button
              >
            </div>{/each}
        </div>
      {:else if panel === 'account'}<AccountPanel />
      {:else if panel === 'saved'}<p>
          {local
            ? 'Saved on this device. Sign in to keep a separate collection across devices.'
            : 'Saved to your account. Only you can access your notes.'}
        </p>
        {#if !saved.length}<div class="empty-state">
            <h3>Your collection starts here.</h3>
            <p>Open a representative’s profile and select “Save representative.”</p>
          </div>{:else}<div class="saved-list">
            {#each saved as item}<article>
                <button class="saved-name" onclick={() => onnavigate('profile', item.politician_id)}
                  >{item.name} <span>{item.state} ↗</span></button
                >{#if item.note}<p>{item.note}</p>{/if}<button
                  class="text-button"
                  onclick={() => removeItem(item)}>Remove</button
                >
              </article>{/each}
          </div>{/if}
      {:else}<h3>01 / Know your representatives</h3>
        <p>Explore the United States and the people representing your community.</p>
        <h3>02 / Connect the dots</h3>
        <p>Compare votes, campaign funding, priorities, and proposed legislation.</p>
        <h3>03 / Make yourself heard</h3>
        <p>Save a profile, make a note, and use the call guide to prepare for a conversation.</p>
        <a class="text-button" href="https://louderthanwords.fyi">louderthanwords.fyi ↗</a>{/if}
      {#if message}<p class="feedback-message" role="status">{message}</p>{/if}
      <p class="dialog-disclaimer">
        Demo only. Political profiles, statistics, votes, bills, and contact details are
        illustrative. Geographic boundaries are real.
      </p>
    </Dialog.Content></Dialog.Portal
  >
</Dialog.Root>
