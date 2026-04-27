<script lang="ts">
  import { onMount } from "svelte";
  import { sortMetrics } from "./Tools";
  import { getComparison, listTags, getMeaningfulTags } from "./api";

  interface Props {
    project: Project;
    experiment: Experiment;
  }

  let { project, experiment }: Props = $props();

  type MeaningfulTagsComparisonMode = "Baseline" | "Zero" | "Average";

  let initialized: boolean = $state(false);
  let loading: boolean = $state(false);
  let errorMessage: string = $state("");

  let metrics: string[] = $state([]);
  let sets: string[] = $state([]);
  let excludeTags: string[] = $state([]);

  let selectedMetric: string = $state("");
  let selectedSet: string = $state("");
  let selectedCompareTo: MeaningfulTagsComparisonMode = $state("Baseline");
  let selectedExcludeTag: string = $state("");

  let modalOpen: boolean = $state(false);
  let resultsLoading: boolean = $state(false);
  let results: {
    impact: number;
    diff: number;
    tag: string;
    count?: number | null;
  }[] = $state([]);

  const handleBackdropKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      closeResults();
    }
  };

  const fetchMetadata = async () => {
    if (initialized) return;
    try {
      loading = true;
      const comparison = await getComparison(project.name, experiment.name);
      const allMetrics = [
        ...Object.keys(comparison.project_baseline?.result?.metrics ?? {}),
        ...Object.keys(comparison.experiment_baseline?.result?.metrics ?? {}),
        ...(comparison.sets ?? []).flatMap((entity) =>
          Object.keys(entity.result?.metrics ?? {}),
        ),
      ];
      metrics = [...new Set(allMetrics)].sort((a, b) =>
        sortMetrics(comparison.metric_definitions, a, b),
      );
      sets = (comparison.sets ?? [])
        .map((entity) => entity.set)
        .filter((set): set is string => Boolean(set));

      try {
        excludeTags = await listTags(project.name);
      } catch {
        // tags are optional
      }

      if (!selectedMetric && metrics.length > 0) {
        selectedMetric = metrics[0];
      }
      if (!selectedSet && sets.length > 0) {
        selectedSet = sets[sets.length - 1];
      }
      initialized = true;
    } catch (error) {
      console.error(error);
      errorMessage = "Failed to load metrics and sets.";
    } finally {
      loading = false;
    }
  };

  const openResults = async () => {
    errorMessage = "";
    modalOpen = true;
    resultsLoading = true;
    results = [];
    await fetchMetadata();
    if (!selectedMetric || !selectedSet) {
      resultsLoading = false;
      errorMessage = "Select a metric and set to run meaningful tags.";
      return;
    }
    try {
      const data = await getMeaningfulTags({
        project: project.name,
        experiment: experiment.name,
        set: selectedSet,
        metric: selectedMetric,
        compare_to: selectedCompareTo,
        exclude_tags: selectedExcludeTag ? [selectedExcludeTag] : undefined,
      });
      results = data?.tags ?? [];
    } catch (error) {
      console.error(error);
      errorMessage = "Failed to load meaningful tags.";
    } finally {
      resultsLoading = false;
    }
  };

  const closeResults = () => {
    modalOpen = false;
  };

  onMount(() => {
    fetchMetadata();
  });
</script>

<div class="meaningful-tags-row">
  <span class="controls">
    <label>
      Set
      <select class="dropdown" bind:value={selectedSet}>
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
      <select class="dropdown" bind:value={selectedMetric}>
        {#if metrics.length === 0}
          <option value=""
            >{loading ? "Loading metrics..." : "No metrics"}</option
          >
        {:else}
          {#each metrics as metricName}
            <option value={metricName}>{metricName}</option>
          {/each}
        {/if}
      </select>
    </label>
    <label>
      Compare
      <select class="dropdown" bind:value={selectedCompareTo}>
        <option value="Baseline">Baseline</option>
        <option value="Zero">Zero</option>
        <option value="Average">Average</option>
      </select>
    </label>
    <label>
      Exclude tag
      <select class="dropdown" bind:value={selectedExcludeTag}>
        <option value="">None</option>
        {#each excludeTags as tagName}
          <option value={tagName}>{tagName}</option>
        {/each}
      </select>
    </label>
    <button
      class="compute"
      onclick={openResults}
      disabled={!selectedSet || !selectedMetric}
    >
      compute
    </button>
  </span>
</div>

{#if modalOpen}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close meaningful tags"
    onclick={closeResults}
    onkeydown={handleBackdropKeydown}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <div class="modal-header">
        <h3>Meaningful tags</h3>
        <button class="link" onclick={closeResults}>close</button>
      </div>
      <div class="modal-body">
        {#if resultsLoading}
          <div>Loading...</div>
        {:else if errorMessage}
          <div class="error">{errorMessage}</div>
        {:else if results.length === 0}
          <div>No meaningful tags found.</div>
        {:else}
          <table class="meaningful-tags-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Impact</th>
                <th>Diff</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {#each results as tag}
                <tr>
                  <td>{tag.tag}</td>
                  <td>{tag.impact}</td>
                  <td>{tag.diff}</td>
                  <td>{tag.count ?? ""}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .meaningful-tags-row {
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .meaningful-tags-row .controls {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .dropdown {
    font-size: 1rem;
    line-height: 1.2;
    margin-left: 0.35rem;
  }

  button.compute {
    margin-left: 0.5rem;
    cursor: pointer;
  }

  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .modal {
    background: #262626;
    color: #eee;
    padding: 1.25rem;
    border-radius: 10px;
    width: min(760px, 92vw);
    max-height: 80vh;
    overflow: auto;
    border: 1px solid #3a3a3a;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .meaningful-tags-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
  }

  .meaningful-tags-table th,
  .meaningful-tags-table td {
    border: 1px solid #3a3a3a;
    padding: 0.4rem 0.6rem;
    text-align: left;
  }

  .meaningful-tags-table th {
    background: #1f1f1f;
    color: #ddd;
  }

  .meaningful-tags-table tr:nth-child(even) {
    background: #242424;
  }

  .error {
    color: #ff8a80;
  }
</style>
