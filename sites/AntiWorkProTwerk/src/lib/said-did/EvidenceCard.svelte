<script lang="ts">
  import { base } from '$app/paths';
  import { assessmentLabels, actionLabels, type IndexItem } from './schema';
  let { item, fictional = false }: { item: IndexItem; fictional?: boolean } = $props();
</script>

<a
  class="evidence-card"
  href={`${base}/said-vs-did/comparisons/${item.id}/`}
  data-sveltekit-preload-data="hover"
  data-evidence-id={item.id}
>
  <div class="evidence-card-top">
    <span class={`assessment ${item.assessment}`}
      >{item.status === 'published' ? assessmentLabels[item.assessment] : 'Review pending'}</span
    ><span>{item.state} · {item.chamber}</span><b aria-hidden="true">↗</b>
  </div>
  <h3>{item.measureTitle}</h3>
  <p class="evidence-card-quote">“{item.quote}”</p>
  <div class="evidence-card-bottom">
    <span class="member-initials"
      >{item.name
        .split(' ')
        .map((n) => n[0])
        .join('')}</span
    ><span
      ><strong>{item.name}</strong><small
        >{item.party} · {item.state}-{item.district}{fictional ? ' · Demo' : ''}</small
      ></span
    ><span class="evidence-card-action"
      >{actionLabels[item.actionKind]}<small>{item.actionDate}</small></span
    >
  </div>
  <p class="evidence-card-context">{item.explanation}</p>
</a>
