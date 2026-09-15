<script lang="ts">
  let { name }: { name: string } = $props();
</script>

<svg
  viewBox="0 0 32 32"
  aria-hidden="true"
  fill="none"
  stroke="currentColor"
  stroke-width="2.8"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === 'call'}<path
      d="m7 3 4 6-3 3c2 4 4 6 8 8l3-3 6 4c-1 6-5 7-10 4C8 21 3 16 2 10 1 6 3 3 7 3Z"
      fill="currentColor"
      stroke="none"
    />
  {:else if name === 'votes'}<path
      d="M4 16h5v12H4zm9-12h5v24h-5zm9 6h5v18h-5z"
      fill="currentColor"
      stroke="none"
    />
  {:else if name === 'donors'}<circle cx="13" cy="13" r="9" /><path d="m20 20 9 9" />
  {:else if name === 'compare'}<g fill="currentColor" stroke="none"
      ><circle cx="16" cy="10" r="5" /><circle cx="5" cy="13" r="3.5" /><circle
        cx="27"
        cy="13"
        r="3.5"
      /><path
        d="M8 28v-5a8 8 0 0 1 16 0v5ZM0 27v-5a5 5 0 0 1 7-4v9ZM32 27v-5a5 5 0 0 0-7-4v9Z"
      /></g
    >
  {:else}<path d="M6 2h13l7 7v21H6Z" fill="currentColor" stroke="none" /><path
      d="M19 2v8h7M10 15h12M10 20h12M10 25h8"
      stroke="#ff0525"
      stroke-width="2"
    />{/if}
</svg>
