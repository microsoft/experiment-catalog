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
  <button onclick={apply}>Apply</button>
  <button onclick={clear}>Clear</button>
  <span class="count">{filteredCount} of {totalCount}</span>
</div>

<style>
  .top > * {
    vertical-align: top;
  }
  textarea {
    width: 60em;
    height: 5em;
  }
  .count {
    margin-left: 1rem;
    font-style: italic;
  }
</style>
