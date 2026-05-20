<script lang="ts">
  import { onMount } from "svelte";
  import ComparisonTable from "./ComparisonTable.svelte";
  import MeaningfulTags from "./MeaningfulTags.svelte";
  import type { ViewConfig } from "./Tools";
  import {
    useProjectBaseline,
    setAsProjectBaseline as apiSetAsProjectBaseline,
    computeStatistics as apiComputeStatistics,
    getExperimentDownloadUrl,
  } from "./api";

  interface Props {
    project: Project;
    experiment: Experiment;
    setList?: string;
    config?: ViewConfig;
    uiSettings?: UiSettings;
    onunselectExperiment?: () => void;
    onselectSet?: (set: string) => void;
    onshowChart?: () => void;
    onchangeSetList?: (setList: string) => void;
    onchangeConfig?: (config: ViewConfig) => void;
  }

  let {
    project,
    experiment,
    setList = $bindable(),
    config = {},
    uiSettings = {},
    onunselectExperiment,
    onselectSet,
    onshowChart,
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
  let showImportantOnly: boolean = $state(false);
  let hasImportantMetrics: boolean = $state(false);
  let ready: boolean = $state(false);

  // Initialize from config on mount
  onMount(() => {
    checked = config.checked_metrics ?? "";
    tags = config.tags ?? "";
    showActualValue = config.show_val ?? true;
    showStdDev = config.show_std ?? true;
    showCount = config.show_cnt ?? true;
    showStatistics = config.show_stats ?? true;
    showImportantOnly = config.show_important_only ?? uiSettings.show_only_important_metrics_by_default ?? false;
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
    // Always persist show_important_only once user has toggled it
    newConfig.show_important_only = showImportantOnly;
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
    }
  };

  const setAsProjectBaseline = async () => {
    const response = await apiSetAsProjectBaseline(
      project.name,
      experiment.name,
    );
    if (response.ok) {
      comparisonTable?.reload();
    }
  };

  const computeStatistics = async () => {
    const response = await apiComputeStatistics(project.name, experiment.name);
    if (response.ok) {
      alert("Refresh in a few minutes to see the statistics.");
    }
  };



  let comparisonTable: ComparisonTable | undefined = $state();
</script>

<button class="btn" onclick={unselectExperiment}>&larr; back</button>
<h1>PROJECT: {project.name}</h1>
<h2>EXPERIMENT: {experiment.name}</h2>

<div class="toolbar">
  <div class="toolbar-group">
    <span class="toolbar-label">Baseline</span>
    <button class="btn" onclick={useTheProjectBaseline}>
      use the project baseline
    </button>
    <button class="btn" onclick={setAsProjectBaseline}>
      set this experiment as the project baseline
    </button>
  </div>
  <div class="toolbar-divider"></div>
  <div class="toolbar-group">
    <span class="toolbar-label">Actions</span>
    <button class="btn" onclick={computeStatistics}>
      compute statistics
    </button>
    <a
      class="btn"
      href={getExperimentDownloadUrl(project.name, experiment.name)}
      download="{experiment.name}.jsonl"
    >
      download
    </a>
  </div>
  <div class="toolbar-divider"></div>
  <div class="toolbar-group">
    <button class="btn btn-nav" onclick={() => onshowChart?.()}>
      charts
    </button>
  </div>
</div>

<section class="page-content">
  <div class="meta-row">
    <span class="meta-label">Hypothesis</span>
    <span>{experiment.hypothesis}</span>
  </div>
  <div class="meta-row">
    <span class="meta-label">Created</span>
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
  {#if experiment.annotations}
    {#each experiment.annotations as annotation}
      <div class="meta-row">
        <span class="meta-label">Annotation</span>
        <span>{annotation.text}</span>
      </div>
    {/each}
  {/if}
  <div class="meta-row">
    <span class="meta-label">Tag Impact</span>
    <MeaningfulTags {project} {experiment} />
  </div>
  <div class="meta-row">
    <span class="meta-label">Show</span>
    <div class="toggles">
      <label class="toggle-label">
        <input
          type="checkbox"
          bind:checked={showActualValue}
          onchange={onToggleChange}
        />
        Actual Value
      </label>
      <label class="toggle-label">
        <input
          type="checkbox"
          bind:checked={showStdDev}
          onchange={onToggleChange}
        />
        Std Dev
      </label>
      <label class="toggle-label">
        <input type="checkbox" bind:checked={showCount} onchange={onToggleChange} />
        Count
      </label>
      <label class="toggle-label">
        <input
          type="checkbox"
          bind:checked={showStatistics}
          onchange={onToggleChange}
        />
        Statistics
      </label>
      {#if hasImportantMetrics}
        <label class="toggle-label">
          <input
            type="checkbox"
            bind:checked={showImportantOnly}
            onchange={onToggleChange}
          />
          Important Metrics Only
        </label>
      {/if}
    </div>
  </div>
</section>

<details class="reference-info">
  <summary>Details</summary>
  <div class="reference-content">
    <p class="legend">
      <strong>Legend:</strong>
      [value] ([standard-deviation]) [change-vs-experiment-baseline]
      x[number-of-values] p=[p-value] ([CI-lower] - [CI-upper])
    </p>
    <p>
      <strong>Statistics:</strong>
      The p-value is the probability of seeing results this extreme by chance
      alone; values below 0.05 indicate statistically significant differences. The
      confidence interval shows the likely range of the true difference; if it
      excludes zero, the difference is statistically significant.
    </p>
    <div class="statistics-subsections">
      <p>
        <strong>P-Value Calculation (Paired Permutation Test):</strong>
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
      <p>
        <strong>Confidence Interval Calculation (Bootstrap Resampling):</strong>
        The confidence interval is calculated using the bootstrap percentile method.
        The service repeatedly resamples the paired differences with replacement, calculating
        the mean of each bootstrap sample. After generating many bootstrap samples,
        the confidence interval is determined by taking the appropriate percentiles
        from the sorted bootstrap means (e.g., for a 95% CI, the 2.5th and 97.5th percentiles).
        This non-parametric approach makes no assumptions about the underlying distribution
        of the data.
      </p>
      <p>
        <strong>Interpretation and Use:</strong>
        Together, these statistics help users make informed decisions about whether
        an experiment shows a meaningful improvement over the baseline. A low p-value
        (typically &lt; 0.05) combined with a confidence interval that doesn't cross
        zero provides strong evidence of a real effect. Users should consider both
        metrics: the p-value tells you whether there's a significant difference, while
        the confidence interval tells you the magnitude and direction of that difference.
      </p>
    </div>
  </div>
</details>

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
      {showImportantOnly}
      bind:this={comparisonTable}
      ondrilldown={selectSet}
      onchangeSetList={changeSetList}
      onchangeChecked={changeChecked}
      onchangeTags={changeTags}
      onimportantMetricsDetected={(has) => { hasImportantMetrics = has; }}
    />
  {:else}
    <div>Loading...</div>
    <div>
      <img class="loading" alt="loading" src="/spinner.gif" />
    </div>
  {/if}
</div>

<style>
  .page-content {
    margin: 1.25rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .meta-label {
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #999;
    min-width: 90px;
    flex-shrink: 0;
  }

  .reference-info {
    margin: 0.75rem 0;
    border: 1px solid #3a3a3a;
    border-radius: 6px;
    padding: 0.75rem 1rem;
  }

  .reference-info summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
    color: #aaa;
  }

  .reference-info summary:hover {
    color: #ddd;
  }

  .reference-content {
    margin-top: 0.75rem;
    font-size: 0.85rem;
    color: #bbb;
    line-height: 1.5;
  }

  .reference-content p {
    margin: 0.5rem 0;
  }

  .reference-content .legend {
    font-family: monospace;
    font-size: 0.8rem;
  }

  .statistics-subsections {
    margin-left: 1rem;
    padding-left: 0.75rem;
    border-left: 2px solid #3a3a3a;
  }

  .toggle-label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .toggles {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }



  .table {
    margin-top: 1.5rem;
  }
</style>
