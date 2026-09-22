<script lang="ts">
  import EvidencePage from '$lib/said-did/EvidencePage.svelte';
  let { data } = $props();
</script>

<EvidencePage evidence={data.evidence} />
