<script lang="ts">
  import { browser } from '$app/environment';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import Explorer from '$lib/components/Explorer.svelte';
  import '../style.css';
  import '../explorer.css';
  let { data, children } = $props();
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 300_000,
        gcTime: 900_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
</script>

<QueryClientProvider {client}>
  <Explorer manifest={data.manifest} initialSummary={data.initialSummary} />
  {@render children()}
</QueryClientProvider>
