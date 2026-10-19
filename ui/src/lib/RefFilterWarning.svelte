<script lang="ts">
  import type { RefFilter } from "./Tools";

  interface Props {
    filter?: RefFilter;
  }

  let { filter }: Props = $props();
</script>

{#if filter}
  <p class="ref-filter-warning" role="status">
    <strong>Ref filter active.</strong>
    Comparisons are limited to refs in <strong>{filter.set}</strong> with
    <strong>{filter.metric}</strong>. Tag filters cannot include refs outside this boundary.
  </p>
{/if}

<style>
  .ref-filter-warning {
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    overflow-wrap: anywhere;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid #b78536;
    border-left: 4px solid #b78536;
    border-radius: 4px;
    background-color: #302b1f;
    color: #ffd27f;
    font-size: 0.85rem;
  }
</style>
