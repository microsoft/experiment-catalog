<script lang="ts">
  import { buildFilterFunction } from "./filterExpression";

  interface Props {
    metrics: string[];
    filteredCount?: number;
    totalCount?: number;
    onfilter?: (func: Function | undefined) => void;
  }

  let {
    metrics,
    filteredCount = 0,
    totalCount = 0,
    onfilter,
  }: Props = $props();

  let buttonId = crypto.randomUUID();
  let filter: string = $state("");

  function apply() {
    if (!filter) {
      onfilter?.(undefined);
      return;
    }

    const func = buildFilterFunction(filter, metrics);
    onfilter?.(func);
  }

  function clear() {
    filter = "";
    apply();
  }
</script>

<div class="top">
  <label for={buttonId}>filter:</label>
  <textarea id={buttonId} bind:value={filter}></textarea>
  <button class="btn" onclick={apply}>Apply</button>
  <button class="btn" onclick={clear}>Clear</button>
  <span class="count">{filteredCount} of {totalCount}</span>
</div>

<style>
  .top {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .top label {
    padding-top: 0.4rem;
  }
  textarea {
    width: 60em;
    height: 5em;
  }
  .count {
    font-size: 0.85rem;
    font-style: italic;
    white-space: nowrap;
    padding-top: 0.4rem;
  }
</style>
