<script lang="ts">
  import { onMount } from "svelte";
  import DistributionChart from "./charts/DistributionChart.svelte";
  import { getSets, getSetResults, getComparison } from "./api";

  interface Props {
    project: Project;
    experiment: Experiment;
    onback?: () => void;
  }

  let { project, experiment, onback }: Props = $props();

  let loadingState: "loading" | "loaded" | "error" = $state("loading");
  let allMetrics: string[] = $state([]);
  let selectedMetric: string = $state("");
  let metricDefinitions: Record<string, MetricDefinition> = $state({});

  interface SetGroup {
    label: string;
    values: number[];
    annotations: Annotation[];
  }

  let groups: SetGroup[] = $state([]);

  let currentMetricDefinition: MetricDefinition | undefined = $derived(
    metricDefinitions[selectedMetric],
  );

  let chartGroups: SetGroup[] = $derived.by(() => {
    if (!selectedMetric) return [];
    return groups.filter((g) => g.values.length > 0);
  });

  // Store all results per set for metric switching without re-fetching
  let resultsBySet: Map<string, Result[]> = new Map();
  let setOrder: string[] = [];

  const fetchData = async () => {
    try {
      loadingState = "loading";

      // Get metric definitions from comparison
      const comparison = await getComparison(project.name, experiment.name);
      metricDefinitions = comparison.metric_definitions ?? {};

      // Get ordered set list: project baseline, experiment baseline, then remaining sets
      const allSets = await getSets(project.name, experiment.name);
      const projBaseline = comparison.project_baseline;
      const expBaseline = comparison.experiment_baseline;

      setOrder = [];
      resultsBySet = new Map();

      // Determine if project and experiment baselines point to the same set
      const sameBaseline =
        projBaseline?.set &&
        expBaseline?.set &&
        projBaseline.project === expBaseline.project &&
        projBaseline.experiment === expBaseline.experiment &&
        projBaseline.set === expBaseline.set;

      if (sameBaseline) {
        // Single entry for both baselines
        const label = `baseline: ${projBaseline!.set}`;
        setOrder.push(label);
        const results = await getSetResults(
          projBaseline!.project,
          projBaseline!.experiment,
          projBaseline!.set!,
        );
        resultsBySet.set(label, results);
      } else {
        // Fetch project baseline (may be from a different experiment)
        if (projBaseline?.set) {
          const label = `project-baseline: ${projBaseline.set}`;
          setOrder.push(label);
          const results = await getSetResults(
            projBaseline.project,
            projBaseline.experiment,
            projBaseline.set,
          );
          resultsBySet.set(label, results);
        }

        // Fetch experiment baseline
        if (expBaseline?.set) {
          const label = `experiment-baseline: ${expBaseline.set}`;
          setOrder.push(label);
          const results = await getSetResults(
            expBaseline.project,
            expBaseline.experiment,
            expBaseline.set,
          );
          resultsBySet.set(label, results);
        }
      }

      // Add remaining sets (skip any that are already shown as a baseline)
      const baselineSets = new Set<string | undefined>([projBaseline?.set, expBaseline?.set]);
      for (const s of allSets) {
        if (!baselineSets.has(s)) {
          setOrder.push(s);
        }
      }

      // Fetch results for non-baseline sets in parallel
      const fetches = setOrder
        .filter((label) => !resultsBySet.has(label))
        .map(async (setName) => {
          const results = await getSetResults(
            project.name,
            experiment.name,
            setName,
          );
          resultsBySet.set(setName, results);
        });
      await Promise.all(fetches);

      // Extract all metric names
      const metricSet = new Set<string>();
      for (const results of resultsBySet.values()) {
        for (const r of results) {
          if (r.metrics) {
            for (const key of Object.keys(r.metrics)) {
              metricSet.add(key);
            }
          }
        }
      }
      allMetrics = [...metricSet].sort();

      if (!selectedMetric || !allMetrics.includes(selectedMetric)) {
        selectedMetric = allMetrics[0] ?? "";
      }

      rebuildGroups();
      loadingState = "loaded";
    } catch (error) {
      console.error(error);
      loadingState = "error";
    }
  };

  function rebuildGroups() {
    groups = setOrder.map((setName) => ({
      label: setName,
      values: extractMetricValues(resultsBySet.get(setName) ?? [], selectedMetric),
      annotations: extractAnnotations(resultsBySet.get(setName) ?? []),
    }));
  }

  function extractAnnotations(results: Result[]): Annotation[] {
    const seen = new Set<string>();
    const annotations: Annotation[] = [];
    for (const r of results) {
      if (r.annotations) {
        for (const a of r.annotations) {
          const key = `${a.text ?? ""}|${a.uri ?? ""}`;
          if (!seen.has(key)) {
            seen.add(key);
            annotations.push(a);
          }
        }
      }
    }
    return annotations;
  }

  function extractMetricValues(results: Result[], metric: string): number[] {
    const values: number[] = [];
    for (const r of results) {
      const v = r.metrics?.[metric]?.value;
      if (v != null && Number.isFinite(v)) {
        values.push(v);
      }
    }
    return values;
  }

  function onMetricChange() {
    rebuildGroups();
  }

  type ChartType = "distribution";

  const chartTypes: { value: ChartType; label: string }[] = [
    { value: "distribution", label: "distribution" },
  ];

  let selectedChart: ChartType = $state("distribution");

  onMount(() => {
    fetchData();
  });
</script>

<button class="btn" onclick={onback}>&larr; back</button>
<h1>PROJECT: {project.name}</h1>
<h2>EXPERIMENT: {experiment.name}</h2>

{#if loadingState === "loading"}
  <div>Loading...</div>
  <div>
    <img class="loading" alt="loading" src="/spinner.gif" />
  </div>
{:else if loadingState === "error"}
  <div>Error loading data.</div>
{:else}
  <div class="controls">
    <div class="control-group">
      <label for="chart-select">Chart</label>
      <select id="chart-select" bind:value={selectedChart}>
        {#each chartTypes as ct}
          <option value={ct.value}>{ct.label}</option>
        {/each}
      </select>
    </div>
    <div class="control-group">
      <label for="metric-select">Metric</label>
      <select id="metric-select" bind:value={selectedMetric} onchange={onMetricChange}>
        {#each allMetrics as metric}
          <option value={metric}>{metric}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if selectedChart === "distribution"}
    {#if chartGroups.length === 0}
      <div class="no-data">No data available for metric "{selectedMetric}"</div>
    {:else}
      <DistributionChart
        groups={chartGroups}
        metric={selectedMetric}
        metricDefinition={currentMetricDefinition}
      />
    {/if}
  {/if}
{/if}

<style>
  .controls {
    display: flex;
    align-items: flex-start;
    gap: 1.5rem;
    margin: 1rem 0;
    flex-wrap: wrap;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .control-group label {
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #999;
  }

  select {
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-size: 0.85rem;
    color: #222;
    cursor: pointer;
  }

  select:hover {
    border-color: #999;
  }

  .no-data {
    padding: 2rem;
    text-align: center;
    color: #999;
    font-style: italic;
  }
</style>

