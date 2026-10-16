<script lang="ts">
  import { onMount } from "svelte";
  import { getComparison } from "./api";
  import { extractComparisonFilterOptions } from "./comparisonData";
  import type { RefFilter } from "./Tools";

  interface Props {
    project: Project;
    experiment: Experiment;
    applied?: RefFilter;
    onapply: (filter: RefFilter | undefined) => void;
  }

  let { project, experiment, applied, onapply }: Props = $props();
  let sets: string[] = $state([]);
  let metrics: string[] = $state([]);
  let selectedSet = $state("");
  let selectedMetric = $state("");
  let loading = $state(true);
  let error = $state("");
  onMount(async () => {
    selectedSet = applied?.set ?? "";
    selectedMetric = applied?.metric ?? "";
    try {
      const comparison = await getComparison(project.name, experiment.name);
      ({ sets, metrics } = extractComparisonFilterOptions(comparison));
      selectedSet ||= sets[sets.length - 1] ?? "";
      selectedMetric ||= metrics[0] ?? "";
    } catch (cause) {
      console.error("Failed to load ref filter options:", cause);
      error = "Failed to load ref filter options.";
    } finally {
      loading = false;
    }
  });
</script>

<div class="ref-filter">
  <label>
    Set
    <select
      class="comparison-filter-dropdown"
      aria-label="Ref filter set"
      bind:value={selectedSet}
      disabled={loading}
    >
      {#if sets.length === 0}
        <option value="">{loading ? "Loading sets..." : "No sets"}</option>
      {:else}
        {#each sets as setName}
          <option value={setName}>{setName}</option>
        {/each}
      {/if}
    </select>
  </label>
  <label>
    Metric
    <select class="comparison-filter-dropdown" aria-label="Ref filter metric" bind:value={selectedMetric} disabled={loading}>
      {#if metrics.length === 0}
        <option value="">{loading ? "Loading metrics..." : "No metrics"}</option>
      {:else}
        {#each metrics as metric}
          <option value={metric}>{metric}</option>
        {/each}
      {/if}
    </select>
  </label>
  <button
    class="btn"
    aria-label="Apply ref filter"
    disabled={loading || !sets.includes(selectedSet) || !metrics.includes(selectedMetric)}
    onclick={() => onapply({
      project: project.name,
      experiment: experiment.name,
      set: selectedSet,
      metric: selectedMetric,
    })}
  >apply</button>
  {#if applied}
    <button class="btn" aria-label="Clear ref filter" onclick={() => onapply(undefined)}>clear</button>
  {/if}
  {#if error}
    <span role="alert">{error}</span>
  {/if}
</div>

<style>
  .ref-filter {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  span {
    color: #aaa;
    font-size: 0.85rem;
  }
</style>
