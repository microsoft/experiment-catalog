<script lang="ts">
  import { onMount } from "svelte";
  import ComparisonTable from "./ComparisonTable.svelte";
  import MeaningfulTags from "./MeaningfulTags.svelte";
  import type { ViewConfig } from "./Tools";
  import {
    useProjectBaseline,
    setAsProjectBaseline as apiSetAsProjectBaseline,
    computeStatistics as apiComputeStatistics,
  } from "./api";

  interface Props {
    project: Project;
    experiment: Experiment;
    setList?: string;
    config?: ViewConfig;
    onunselectExperiment?: () => void;
    onselectSet?: (set: string) => void;
    onchangeSetList?: (setList: string) => void;
    onchangeConfig?: (config: ViewConfig) => void;
  }

  let {
    project,
    experiment,
    setList = $bindable(),
    config = {},
    onunselectExperiment,
    onselectSet,
    onchangeSetList,
    onchangeConfig,
  }: Props = $props();

  // Local state initialized from config (set in onMount to avoid warnings)
  let checked: string = $state("");
  let tags: string = $state("");
  let showActualValue: boolean = $state(true);
  let showStdDev: boolean = $state(true);
  let showCount: boolean = $state(true);
  let showStatistics: boolean = $state(true);
  let ready: boolean = $state(false);

  // Initialize from config on mount
  onMount(() => {
    checked = config.checked_metrics ?? "";
    tags = config.tags ?? "";
    showActualValue = config.show_val ?? true;
    showStdDev = config.show_std ?? true;
    showCount = config.show_cnt ?? true;
    showStatistics = config.show_stats ?? true;
    ready = true;
  });

  const emitConfigChange = () => {
    const newConfig: ViewConfig = { ...config };
    if (checked) {
      newConfig.checked_metrics = checked;
    } else {
      delete newConfig.checked_metrics;
    }
    if (tags) {
      newConfig.tags = tags;
    } else {
      delete newConfig.tags;
    }
    // Only store non-default values (defaults are true)
    if (!showActualValue) {
      newConfig.show_val = false;
    } else {
      delete newConfig.show_val;
    }
    if (!showStdDev) {
      newConfig.show_std = false;
    } else {
      delete newConfig.show_std;
    }
    if (!showCount) {
      newConfig.show_cnt = false;
    } else {
      delete newConfig.show_cnt;
    }
    if (!showStatistics) {
      newConfig.show_stats = false;
    } else {
      delete newConfig.show_stats;
    }
    onchangeConfig?.(newConfig);
  };

  const unselectExperiment = () => {
    onunselectExperiment?.();
  };

  const selectSet = (set: string) => {
    onselectSet?.(set);
  };

  const changeSetList = (newSetList: string) => {
    onchangeSetList?.(newSetList);
  };

  const changeChecked = (newChecked: string) => {
    checked = newChecked;
    emitConfigChange();
  };

  const changeTags = (newTags: string) => {
    tags = newTags;
    emitConfigChange();
  };

  const onToggleChange = () => {
    emitConfigChange();
  };

  const useTheProjectBaseline = async () => {
    const response = await useProjectBaseline(project.name, experiment.name);
    if (response.ok) {
      comparisonTable?.reload();
      confirmUseTheProjectBaseline = false;
    }
  };

  const setAsProjectBaseline = async () => {
    const response = await apiSetAsProjectBaseline(
      project.name,
      experiment.name,
    );
    if (response.ok) {
      comparisonTable?.reload();
      confirmSetAsProjectBaseline = false;
    }
  };

  const computeStatistics = async () => {
    const response = await apiComputeStatistics(project.name, experiment.name);
    if (response.ok) {
      alert("Refresh in a few minutes to see the statistics.");
      confirmComputeStatistics = false;
    }
  };

  let confirmUseTheProjectBaseline = $state(false);
  let confirmSetAsProjectBaseline = $state(false);
  let confirmComputeStatistics = $state(false);
  let comparisonTable: ComparisonTable | undefined = $state();
  let statisticsOpen = $state(false);
</script>

<button class="link" onclick={unselectExperiment}>back</button>
<h1>PROJECT: {project.name}</h1>
<h2>EXPERIMENT: {experiment.name}</h2>
<div>
  <span>
    <label style="display:inline-flex; align-items:center; gap:0.5rem;">
      <input
        type="checkbox"
        bind:checked={confirmUseTheProjectBaseline}
        aria-label="Confirm set as project baseline"
      />
      <button
        class="link"
        onclick={useTheProjectBaseline}
        disabled={!confirmUseTheProjectBaseline}
      >
        use the project baseline
      </button>
    </label>
  </span>
</div>
<div>
  <span>
    <label style="display:inline-flex; align-items:center; gap:0.5rem;">
      <input
        type="checkbox"
        bind:checked={confirmSetAsProjectBaseline}
        aria-label="Confirm set as project baseline"
      />
      <button
        class="link"
        onclick={setAsProjectBaseline}
        disabled={!confirmSetAsProjectBaseline}
      >
        set this experiment as the project baseline
      </button>
    </label>
  </span>
</div>
<div>
  <span>
    <label style="display:inline-flex; align-items:center; gap:0.5rem;">
      <input
        type="checkbox"
        bind:checked={confirmComputeStatistics}
        aria-label="Confirm compute statistics"
      />
      <button
        class="link"
        onclick={computeStatistics}
        disabled={!confirmComputeStatistics}
      >
        compute statistics for this experiment
      </button>
    </label>
  </span>
</div>
<div>
  <span class="label">Hypothesis:</span>
  <span>{experiment.hypothesis}</span>
</div>
<div>
  <span class="label">Created:</span>
  <span>
    {new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(experiment.created))}
  </span>
</div>
<div>
  <span class="label">Legend:</span>
  <span
    >[value] ([standard-deviation]) [change-vs-experiment-baseline]
    x[number-of-values] p=[p-value] ([CI-lower] - [CI-upper])</span
  >
</div>
<div class="statistics-row">
  <button
    class="label statistics-label"
    onclick={() => (statisticsOpen = !statisticsOpen)}>Statistics:</button
  >
  <span
    >The p-value is the probability of seeing results this extreme by chance
    alone; values below 0.05 indicate statistically significant differences. The
    confidence interval shows the likely range of the true difference; if it
    excludes zero, the difference is statistically significant.</span
  >
</div>
{#if statisticsOpen}
  <div class="statistics-details">
    <p>
      <b>P-Value Calculation (Paired Permutation Test):</b>
      This service uses a paired permutation test with sign-flipping to calculate
      p-values. For each pair of observations (one from the baseline, one from the
      experiment), it computes the difference (experiment - baseline). Under the
      null hypothesis that there's no systematic difference between conditions, each
      paired difference is equally likely to be positive or negative. The test generates
      a null distribution by randomly flipping the sign of each paired difference
      thousands of times (CALC_PVALUES_USING_X_SAMPLES), calculating the mean for
      each permutation. The p-value is then computed as the proportion of permuted
      mean differences that are as extreme or more extreme than the observed mean
      difference (two-tailed), using the formula (extremeCount + 1) / (numSamples
      + 1) to ensure the p-value is never exactly zero.
    </p>
    <p style="margin-top: 0.5rem;">
      <b>Confidence Interval Calculation (Bootstrap Resampling):</b>
      The confidence interval is calculated using the bootstrap percentile method.
      The service repeatedly resamples the paired differences with replacement, calculating
      the mean of each bootstrap sample. After generating many bootstrap samples,
      the confidence interval is determined by taking the appropriate percentiles
      from the sorted bootstrap means (e.g., for a 95% CI, the 2.5th and 97.5th percentiles).
      This non-parametric approach makes no assumptions about the underlying distribution
      of the data.
    </p>
    <p style="margin-top: 0.5rem;">
      <b>Interpretation and Use:</b>
      Together, these statistics help users make informed decisions about whether
      an experiment shows a meaningful improvement over the baseline. A low p-value
      (typically &lt; 0.05) combined with a confidence interval that doesn't cross
      zero provides strong evidence of a real effect. Users should consider both
      metrics: the p-value tells you whether there's a significant difference, while
      the confidence interval tells you the magnitude and direction of that difference.
      For example, if comparing accuracy metrics between two models, a p-value of
      0.02 with a CI of [0.5, 2.3] would indicate a statistically significant improvement
      of roughly 0.5 to 2.3 units. However, users should also consider practical
      significance—a statistically significant but tiny improvement may not be worth
      pursuing in practice.
    </p>
  </div>
{/if}
<div class="meaningful-tags-row">
  <span class="label">Tag Impact:</span>
  <MeaningfulTags {project} {experiment} />
</div>
<div class="toggles">
  <span class="label">Show:</span>
  <label>
    <input
      type="checkbox"
      bind:checked={showActualValue}
      onchange={onToggleChange}
    />
    Actual Value
  </label>
  <label>
    <input
      type="checkbox"
      bind:checked={showStdDev}
      onchange={onToggleChange}
    />
    Std Dev
  </label>
  <label>
    <input type="checkbox" bind:checked={showCount} onchange={onToggleChange} />
    Count
  </label>
  <label>
    <input
      type="checkbox"
      bind:checked={showStatistics}
      onchange={onToggleChange}
    />
    Statistics
  </label>
</div>
{#if experiment.annotations}
  {#each experiment.annotations as annotation}
    <div>
      <span class="label">Annotation:</span>
      <span>{annotation.text}</span>
    </div>
  {/each}
{/if}

<div class="table">
  {#if ready}
    <ComparisonTable
      {project}
      {experiment}
      {setList}
      {checked}
      initialTags={tags}
      {showActualValue}
      {showStdDev}
      {showCount}
      {showStatistics}
      bind:this={comparisonTable}
      ondrilldown={selectSet}
      onchangeSetList={changeSetList}
      onchangeChecked={changeChecked}
      onchangeTags={changeTags}
    />
  {:else}
    <div>Loading...</div>
    <div>
      <img class="loading" alt="loading" src="/spinner.gif" />
    </div>
  {/if}
</div>

<style>
  .label {
    text-align: right;
    font-weight: bold;
    width: 100px;
    display: inline-block;
  }

  .statistics-label {
    cursor: pointer;
    text-decoration: underline;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
  }

  .statistics-details {
    margin-left: 1rem;
    line-height: 1.4;
  }

  .toggles {
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .toggles label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
  }

  .table {
    margin-top: 2rem;
  }

  .meaningful-tags-row {
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
</style>
