<script lang="ts">
  import { base } from '$app/paths';
  import { money } from '$lib/data/repository';
  import type { PoliticianSummary } from '$lib/data/schema';
  let {
    person,
    onopen,
    onpreload,
  }: { person: PoliticianSummary; onopen: (id: string) => void; onpreload: (id: string) => void } =
    $props();
</script>

<a
  class="politician-card"
  href={`${base}/?state=${person.state}&panel=profile&person=${person.id}`}
  data-person={person.id}
  onclick={(event) => {
    event.preventDefault();
    onopen(person.id);
  }}
  onpointerenter={() => onpreload(person.id)}
  onfocus={() => onpreload(person.id)}
  aria-label={`View ${person.name}, ${person.party === 'R' ? 'Republican' : person.party === 'D' ? 'Democrat' : 'Independent'}, sample profile`}
>
  <div class="profile">
    {#if person.portrait}<img
        src={`${base}/assets/${person.portrait}`}
        alt=""
        width="100"
        height="100"
      />{:else}<div class="portrait-placeholder" aria-hidden="true">
        {person.name
          .split(' ')
          .map((n) => n[0])
          .join('')}<small>DEMO</small>
      </div>{/if}
    <div class="profile-copy">
      <h3>{person.name}<span class={`party ${person.party}`}>{person.party}</span></h3>
      <p class="role">{person.role}</p>
      <p class="description">{person.description}</p>
    </div>
    <span class="chevron" aria-hidden="true">›</span>
  </div>
  <dl class="metrics">
    <div>
      <dt>Approval</dt>
      <dd>{person.approval}%</dd>
    </div>
    <div>
      <dt>Vote alignment</dt>
      <dd>{person.alignment}%</dd>
    </div>
    <div>
      <dt>Donations</dt>
      <dd>{money(person.donations)}</dd>
    </div>
    <div>
      <dt>Bills</dt>
      <dd>{person.billCount}</dd>
    </div>
  </dl>
</a>
