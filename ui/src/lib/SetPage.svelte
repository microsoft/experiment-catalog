<script lang="ts">
  import { onMount, tick } from "svelte";
  import ComparisonTableMetric from "./ComparisonTableMetric.svelte";
  import Annotations from "./Annotations.svelte";
  import MetricsFilter from "./MetricsFilter.svelte";
  import TagsFilter from "./TagsFilter.svelte";
  import FreeFilter from "./FreeFilter.svelte";
  import { sanitizeProjectTagQuerystring, type ViewConfig } from "./Tools";
  import {
    getComparisonByRef,
    getSetResults,
    listTags,
    setAsExperimentBaseline as apiSetAsExperimentBaseline,
    hideSet as apiHideSet,
  } from "./api";
  import {
    buildRefMap,
    extractByRefMetrics,
    filterRefs,
    extractMetricDefinitions,
    resolveSelectedMetrics,
  } from "./setPageData";

  interface Props {
    project: Project;
    experiment: Experiment;
    setName: string;
    config?: ViewConfig;
    onunselectSet?: () => void;
    onchangeConfig?: (config: ViewConfig) => void;
  }

  let {
    project,
    experiment,
    setName,
    config = {},
    onunselectSet,
    onchangeConfig,
  }: Props = $props();

  let loadingState: "loading" | "loaded" | "error" = $state("loading");
  let hiding = $state(false);
  let hideError = $state("");

  const unselectSet = () => {
    onunselectSet?.();
  };

  let results: Result[] | undefined = $state();
  let showResults = $state(false);
  let baselineResults: Result[] | undefined = $state();
  let showBaselineResults = $state(false);
  let comparison: ComparisonByRef | undefined = $state();
  let comparisonTarget = $derived(comparison?.comparison_target ?? comparison?.experiment_baseline);
  let isBaselineSet = $derived(
    [comparison?.project_baseline, comparison?.experiment_baseline].some((entity) =>
      entity?.project === project.name &&
      entity.experiment === experiment.name &&
      entity.set === setName,
    ),
  );
  let masterRefs: string[] = $state([]);
  let filteredRefs: string[] = $state([]);
  let metrics: string[] = $state([]);
  let selectedMetrics: string[] = $state([]);
  let metricDefinitions: MetricDefinition[] = $state([]);
  let tagFilters: string = $state("");
  let filterFunc: Function | undefined = $state();

  // Pre-computed maps for O(1) lookup instead of O(n) filter in template
  let resultsByRef: Map<string, Result[]> = $state(new Map());
  let baselineResultsByRef: Map<string, Result[]> = $state(new Map());

  const emitConfigChange = () => {
    const newConfig: ViewConfig = { ...config };
    if (
      selectedMetrics.length > 0 &&
      selectedMetrics.length !== metrics.length
    ) {
      newConfig.metrics = selectedMetrics;
    } else {
      delete newConfig.metrics;
    }
    if (tagFilters) {
      newConfig.tags = tagFilters;
    } else {
      delete newConfig.tags;
    }
    onchangeConfig?.(newConfig);
  };

  const emitTagConfigChange = (newTagFilters: string) => {
    const newConfig: ViewConfig = { ...config };
    if (newTagFilters) {
      newConfig.tags = newTagFilters;
    } else {
      delete newConfig.tags;
    }
    onchangeConfig?.(newConfig);
  };

  const reconcileTagFilters = async () => {
    if (!tagFilters) return;
    try {
      const sanitizedTagFilters = await sanitizeProjectTagQuerystring(
        project.name,
        tagFilters,
        listTags,
      );
      if (sanitizedTagFilters !== tagFilters) {
        tagFilters = sanitizedTagFilters;
        emitTagConfigChange(sanitizedTagFilters);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchComparison = async () => {
    try {
      loadingState = "loading";
      await reconcileTagFilters();
      // get the comparison
      comparison = await getComparisonByRef(
        project.name,
        experiment.name,
        setName,
        tagFilters || undefined,
        config.comparison_target,
      );

      // get a list of all refs in the chosen results
      masterRefs = Object.keys(comparison.experiment_set?.results ?? {});
      applyFilter();

      // get a list of all metrics
      metrics = extractByRefMetrics(comparison);

      // populate metric definitions for the filter
      metricDefinitions = extractMetricDefinitions(comparison, metrics);

      // reset selectedMetrics when metric definitions change
      selectedMetrics = resolveSelectedMetrics(
        config.metrics,
        metrics,
        metricDefinitions.length,
      );

      // Mark as initialized after first load
      await tick();
      initialized = true;

      loadingState = "loaded";
    } catch (error) {
      console.error(error);
      loadingState = "error";
    }
  };

  const fetchDetails = async () => {
    try {
      loadingState = "loading";
      showResults = !showResults;
      if (!results) {
        results = await getSetResults(project.name, experiment.name, setName);
        resultsByRef = buildRefMap(results);
      }
      loadingState = "loaded";
    } catch (error) {
      console.error(error);
      loadingState = "error";
    }
  };

  const fetchBaselineDetails = async () => {
    if (!comparison) return;
    try {
      loadingState = "loading";
      showBaselineResults = !showBaselineResults;
      if (!baselineResults && comparisonTarget?.set) {
        baselineResults = await getSetResults(
          comparisonTarget.project,
          comparisonTarget.experiment,
          comparisonTarget.set,
          comparisonTarget.project === project.name ? undefined : project.name,
        );
        baselineResultsByRef = buildRefMap(baselineResults);
      }
      loadingState = "loaded";
    } catch (error) {
      console.error(error);
      loadingState = "error";
    }
  };

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const applyFilter = async () => {
    if (!comparison) return;
    filteredRefs = filterRefs(masterRefs, comparison, filterFunc);
  };

  const filter = async (func: Function | undefined) => {
    loadingState = "loading";
    await delay(0);

    filterFunc = func;
    applyFilter();
    loadingState = "loaded";
  };

  const setAsExperimentBaseline = async () => {
    const response = await apiSetAsExperimentBaseline(
      project.name,
      experiment.name,
      setName,
    );
    if (response.ok) {
      fetchComparison();
    }
  };

  const hideSet = async () => {
    if (!window.confirm(`Permanently hide "${setName}" from set lists? Its results will remain available through direct links.`)) {
      return;
    }
    hiding = true;
    hideError = "";
    try {
      const response = await apiHideSet(project.name, experiment.name, setName);
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`HTTP ${response.status}: ${message || response.statusText}`);
      }
      unselectSet();
    } catch (error) {
      hideError = error instanceof Error ? error.message : "Could not hide set";
    } finally {
      hiding = false;
    }
  };

  let initialized = $state(false);

  // Called when metrics filter changes
  const onMetricsChange = () => {
    if (initialized) {
      emitConfigChange();
    }
  };

  // Called when tag filters change (via apply button in TagsFilter)
  const onTagFiltersChange = (newTagFilters: string) => {
    tagFilters = newTagFilters;
    emitConfigChange();
    fetchComparison();
  };

  // Initial fetch on mount
  onMount(() => {
    tagFilters = config.tags ?? "";
    fetchComparison();
  });
</script>

<button class="btn" onclick={unselectSet}>&larr; back</button>
<h1>PROJECT: {project.name}</h1>
<h2>EXPERIMENT: {experiment.name}</h2>
<div class="btn-group">
  <button class="btn" onclick={setAsExperimentBaseline}>
    set this permutation as the experiment baseline
  </button>
  <button
    class="btn"
    onclick={hideSet}
    disabled={hiding || isBaselineSet}
    title={isBaselineSet ? "Choose another baseline before hiding this set." : undefined}
  >hide this set</button>
</div>
{#if hideError}<p role="alert" class="hide-error">{hideError}</p>{/if}
<div class="meta-row">
  <span class="meta-label">Hypothesis</span>
  <span>{experiment.hypothesis}</span>
</div>
<div class="meta-row">
  <span class="meta-label">GRND TRUTH</span>
  <span>{project.ground_truth || "Unknown"}</span>
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
<h3>
  <span>SET: {setName}</span>
  <button
    class="btn"
    onclick={fetchDetails}
    disabled={loadingState === "loading"}>toggle set iterations</button
  >
  <button
    class="btn"
    onclick={fetchBaselineDetails}
    disabled={loadingState === "loading"}>toggle {config.comparison_target ? "comparison target" : "baseline"} iterations</button
  >
</h3>

{#if comparison}
  <div class="selection">
    <MetricsFilter
      {metricDefinitions}
      bind:selectedMetrics
      onchange={onMetricsChange}
    />
    <br />
    <TagsFilter
      {project}
      bind:querystring={tagFilters}
      onapply={onTagFiltersChange}
    />
    <br />
    <FreeFilter
      onfilter={filter}
      {metrics}
      filteredCount={filteredRefs.length}
      totalCount={masterRefs.length}
    />
  </div>
{/if}

{#if loadingState === "loading"}
  <div>Loading...</div>
  <div>
    <img class="loading" alt="loading" src="./spinner.gif" />
  </div>
{:else if loadingState === "error"}
  <div>Error loading data.</div>
{:else if comparison}
  {#if config.comparison_target}
    <div class="comparison-override" role="status">
      <strong>Comparison override active</strong>
      <span>Comparing against: {config.comparison_target.project} / {config.comparison_target.experiment} / {config.comparison_target.set}</span>
    </div>
  {/if}
  <table>
    <thead>
      <tr>
        <th>Source</th>
        <th>Ref</th>
        {#each selectedMetrics as metric}
          <th>{metric}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each filteredRefs as ref}
        <tr class="experiment-baseline">
          <td
            ><nobr
              >Project Baseline / {comparison.project_baseline?.set ??
                "-"}</nobr
            ></td
          >
          <td class="label"><nobr>{ref}</nobr></td>
          {#each selectedMetrics as metric}
            <td>
              <ComparisonTableMetric
                result={comparison.project_baseline?.results?.[ref]}
                {metric}
                baseline={comparisonTarget?.results?.[ref]}
                requireBaselineForDiff={!!comparison.comparison_target}
                definition={comparison.metric_definitions[metric]}
                showRange={true}
                showUniqueRefs={false}
                showWin={false}
                showTie={false}
              ></ComparisonTableMetric>
            </td>
          {/each}
        </tr>
        <tr class="project-baseline">
          <td
            ><nobr
              >{comparison.comparison_target ? "Comparison Target" : "Experiment Baseline"} / {comparisonTarget?.set ??
                "-"}</nobr
            ></td
          >
          <td class="label"><nobr>{ref}</nobr></td>
          {#each selectedMetrics as metric}
            <td>
              <ComparisonTableMetric
                result={comparisonTarget?.results?.[ref]}
                {metric}
                definition={comparison.metric_definitions[metric]}
                showRange={true}
                showUniqueRefs={false}
                showDiff={!comparison.comparison_target}
                showWin={false}
                showTie={false}
                showStatistics={!comparison.comparison_target}
              />
            </td>
          {/each}
        </tr>
        {#if showBaselineResults && baselineResults}
          {#each baselineResultsByRef.get(ref) ?? [] as result}
            <tr>
              <td>
                <nobr>{config.comparison_target ? "Comparison Target" : "Baseline"} / {result.set}</nobr>
                {#if result.ground_truth_uri}
                  <button
                    class="link"
                    onclick={() =>
                      window.open(result.ground_truth_uri, "_blank")}
                    >(gt)</button
                  >
                {/if}
                {#if result.inference_uri}
                  <button
                    class="link"
                    onclick={() => window.open(result.inference_uri, "_blank")}
                    >(inf)</button
                  >
                {/if}
                {#if result.evaluation_uri}
                  <button
                    class="link"
                    onclick={() => window.open(result.evaluation_uri, "_blank")}
                    >(eval)</button
                  >
                {/if}
              </td>
              <td class="label"><nobr>{result.ref}</nobr></td>
              {#each selectedMetrics as metric}
                <td>
                  <ComparisonTableMetric
                    {result}
                    {metric}
                    baseline={comparisonTarget?.results?.[ref]}
                    requireBaselineForDiff={!!comparison.comparison_target}
                    showCoefficientOfVariation={false}
                    showStdDev={false}
                    showRange={false}
                    showCount={false}
                    definition={comparison.metric_definitions[metric]}
                  ></ComparisonTableMetric>
                </td>
              {/each}
            </tr>
          {/each}
        {/if}
        <tr class="set-aggregate">
          <td
            ><nobr
              >Set Aggregate / {comparison.experiment_set?.set ??
                "MISSING"}</nobr
            ></td
          >
          <td class="label"><nobr>{ref}</nobr></td>
          {#each selectedMetrics as metric}
            <td>
              <ComparisonTableMetric
                result={comparison.experiment_set?.results?.[ref]}
                {metric}
                baseline={comparisonTarget?.results?.[ref]}
                requireBaselineForDiff={!!comparison.comparison_target}
                definition={comparison.metric_definitions[metric]}
                showRange={true}
                showUniqueRefs={false}
                showWin={false}
                showTie={false}
              ></ComparisonTableMetric>
            </td>
          {/each}
        </tr>
        <tr>
          <td colspan={2 + selectedMetrics.length}>
            <Annotations
              entity={{
                project: comparison.experiment_set?.project,
                experiment: comparison.experiment_set?.experiment,
                set: comparison.experiment_set?.set,
                result: comparison.experiment_set?.results?.[ref],
              }}
            />
          </td>
        </tr>
        {#if showResults && results}
          {#each resultsByRef.get(ref) ?? [] as result}
            <tr>
              <td>
                <nobr>Set / {result.set}</nobr>
                {#if result.ground_truth_uri}
                  <button
                    class="link"
                    onclick={() =>
                      window.open(result.ground_truth_uri, "_blank")}
                    >(gt)</button
                  >
                {/if}
                {#if result.inference_uri}
                  <button
                    class="link"
                    onclick={() => window.open(result.inference_uri, "_blank")}
                    >(inf)</button
                  >
                {/if}
                {#if result.evaluation_uri}
                  <button
                    class="link"
                    onclick={() => window.open(result.evaluation_uri, "_blank")}
                    >(eval)</button
                  >
                {/if}
              </td>
              <td class="label"><nobr>{result.ref}</nobr></td>
              {#each selectedMetrics as metric}
                <td>
                  <ComparisonTableMetric
                    {result}
                    {metric}
                    baseline={comparisonTarget?.results?.[ref]}
                    requireBaselineForDiff={!!comparison.comparison_target}
                    showCoefficientOfVariation={false}
                    showStdDev={false}
                    showRange={false}
                    showCount={false}
                    definition={comparison.metric_definitions[metric]}
                  ></ComparisonTableMetric>
                </td>
              {/each}
            </tr>
          {/each}
        {/if}
        <tr><td>&nbsp;</td></tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .hide-error {
    color: #ffaaaa;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.4rem;
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

  table {
    width: 100%;
    border-collapse: collapse;
  }

  table thead {
    position: sticky;
    top: 0;
    background-color: #373;
    z-index: 1;
    border-bottom: 1px solid #ddd;
  }

  th {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
    text-align: left;
    vertical-align: bottom;
  }

  tr.experiment-baseline {
    background-color: #444;
  }

  tr.project-baseline {
    background-color: #454;
  }

  tr.set-aggregate {
    background-color: #444;
  }

  td {
    padding-left: 1.5em;
    padding-right: 1.5em;
    text-align: left;
  }

  td.label {
    text-align: left;
    font-weight: bold;
    padding-right: 3rem;
  }

  .selection {
    width: 100em;
    margin-bottom: 1em;
  }

  .comparison-override {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 1rem 0 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid #b78536;
    border-left: 4px solid #b78536;
    border-radius: 4px;
    background-color: #302b1f;
    overflow-wrap: anywhere;
  }

  .comparison-override strong {
    color: #ffd27f;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
</style>
