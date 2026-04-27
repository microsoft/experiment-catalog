<script lang="ts">
  import { onMount } from "svelte";
  import ComparisonTableHeader from "./ComparisonTableHeader.svelte";
  import ComparisonTableMetric from "./ComparisonTableMetric.svelte";
  import TagsFilter from "./TagsFilter.svelte";
  import { getComparison, addAnnotation as apiAddAnnotation } from "./api";
  import {
    extractSortedMetrics,
    buildSelectedEntities,
  } from "./comparisonData";

  interface Props {
    project: Project;
    experiment: Experiment;
    setList?: string;
    checked: string;
    initialTags?: string;
    showActualValue?: boolean;
    showStdDev?: boolean;
    showCount?: boolean;
    showStatistics?: boolean;
    ondrilldown?: (set: string) => void;
    onchangeSetList?: (setList: string) => void;
    onchangeChecked?: (checked: string) => void;
    onchangeTags?: (tags: string) => void;
  }

  let {
    project,
    experiment,
    setList = $bindable(),
    checked,
    initialTags = "",
    showActualValue = true,
    showStdDev = true,
    showCount = true,
    showStatistics = true,
    ondrilldown,
    onchangeSetList,
    onchangeChecked,
    onchangeTags,
  }: Props = $props();

  let loadingState: "loading" | "loaded" | "error" = $state("loading");
  let compareCount = $state(3);
  let controls: ComparisonTableMetric[] = $state([]);
  let selected: (ComparisonEntity | null)[] = $state([]);
  let metricsHighlighted: Set<string> = $state(new Set());

  const drilldown = (set: string) => {
    ondrilldown?.(set);
  };

  const updateSetList = () => {
    if (!selected) return;
    setList = selected.map((result) => result?.set).join(",");
    onchangeSetList?.(setList);
  };

  const toggleRowCheck = (metric: string) => {
    if (!metricsHighlighted) {
      metricsHighlighted = new Set<string>([metric]);
    } else if (metricsHighlighted.has(metric)) {
      const newSet = new Set(metricsHighlighted);
      newSet.delete(metric);
      metricsHighlighted = newSet;
    } else {
      metricsHighlighted = new Set([...metricsHighlighted, metric]);
    }
    const newChecked = Array.from(metricsHighlighted).join(",");
    onchangeChecked?.(newChecked);
  };

  const applySetList = () => {
    if (!comparison) return;
    const result = buildSelectedEntities(comparison, setList, compareCount);
    selected = result.selected;
    setList = result.reconciledSetList;
    onchangeSetList?.(setList);
  };

  const select = (event: { index: number; entity: ComparisonEntity | null }) => {
    selected[event.index] = event.entity;
    updateSetList();
  };

  const addAnnotation = async (event: {
    set: string;
    annotation: Annotation;
    project: string;
    experiment: string;
  }) => {
    const { set, annotation, project: proj, experiment: exp } = event;
    try {
      const response = await apiAddAnnotation(proj, exp, set, annotation);
      if (response.ok) {
        fetchComparison();
      } else {
        console.error("Failed to add annotation:", response.statusText);
      }
    } catch (error) {
      console.error("Failed to add annotation:", error);
    }
  };

  const selectLastSets = () => {
    if (!comparison?.sets) return;
    selected = comparison.sets.slice(-compareCount);
    updateSetList();
  };

  let comparison: Comparison | undefined = $state();
  let metrics: string[] = $state([]);
  let tagFilters: string = $state("");
  let initialized = $state(false);

  // Emit tag changes only when user changes tags (not on initialization)
  const emitTagChange = (newTags: string) => {
    if (initialized) {
      onchangeTags?.(newTags);
    }
  };

  const fetchComparison = async () => {
    try {
      loadingState = "loading";

      // fetch comparison
      comparison = await getComparison(
        project.name,
        experiment.name,
        tagFilters || undefined,
      );

      // get a list of metrics
      metrics = extractSortedMetrics(comparison);

      // apply the set list
      applySetList();

      // apply the checked metrics
      if (checked) {
        metricsHighlighted = new Set(checked.split(","));
      }

      initialized = true;
      loadingState = "loaded";
    } catch (error) {
      console.error(error);
      loadingState = "error";
    }
  };

  export function reload() {
    fetchComparison();
  }

  // Called when tag filters change (via apply button in TagsFilter)
  const onTagFiltersApply = (newTagFilters: string) => {
    tagFilters = newTagFilters;
    emitTagChange(newTagFilters);
    fetchComparison();
  };

  // Initialize and fetch on mount
  onMount(() => {
    tagFilters = initialTags;
    fetchComparison();
  });
</script>

{#if comparison}
  <div class="selection">
    <TagsFilter
      {project}
      bind:querystring={tagFilters}
      onapply={onTagFiltersApply}
    />
    <span>show at least</span>
    <select bind:value={compareCount} onchange={applySetList}>
      <option value={1}>1</option>
      <option value={2}>2</option>
      <option value={3}>3</option>
      <option value={4}>4</option>
      <option value={5}>5</option>
      <option value={6}>6</option>
      <option value={7}>7</option>
      <option value={8}>8</option>
      <option value={9}>9</option>
      <option value={10}>10</option>
      <option value={20}>20</option>
      <option value={30}>30</option>
      <option value={100}>100</option>
    </select>
    <span>of {comparison.sets?.length} permutations</span>
    <button class="link" onclick={selectLastSets}>(show last)</button>
  </div>
{/if}

{#if loadingState === "loading"}
  <div>Loading...</div>
  <div>
    <img class="loading" alt="loading" src="/spinner.gif" />
  </div>
{:else if loadingState === "error"}
  <div>Error loading comparison.</div>
{:else if comparison}
  <table>
    <thead>
      <tr>
        <th class="checkbox-column"></th>
        <th></th>
        <th>
          <ComparisonTableHeader
            title="Project Baseline"
            entity={comparison.project_baseline}
            clickable={false}
            onaddAnnotation={addAnnotation}
          />
        </th>
        <th>
          <ComparisonTableHeader
            title="Experiment Baseline"
            entity={comparison.experiment_baseline}
            clickable={false}
            onaddAnnotation={addAnnotation}
          />
        </th>
        {#each selected as entity, index}
          <th>
            <ComparisonTableHeader
              {index}
              title=""
              {entity}
              entities={comparison.sets}
              ondrilldown={drilldown}
              onselect={select}
              onaddAnnotation={addAnnotation}
            />
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each metrics as metric}
        <tr class:highlighted={metricsHighlighted?.has(metric)}>
          <td class="checkbox-column">
            <input
              type="checkbox"
              checked={metricsHighlighted?.has(metric)}
              onchange={() => toggleRowCheck(metric)}
            />
          </td>
          <td class="label">{metric}</td>
          <td
            ><ComparisonTableMetric
              result={comparison.project_baseline?.result}
              baseline={comparison.experiment_baseline?.result}
              {metric}
              definition={comparison.metric_definitions[metric]}
              {showActualValue}
              {showStdDev}
              {showCount}
              {showStatistics}
            /></td
          >
          <td
            ><ComparisonTableMetric
              result={comparison.experiment_baseline?.result}
              {metric}
              definition={comparison.metric_definitions[metric]}
              {showActualValue}
              {showStdDev}
              {showCount}
              {showStatistics}
            /></td
          >
          {#each selected as entity, index}
            <td
              ><ComparisonTableMetric
                bind:this={controls[index]}
                result={entity?.result}
                baseline={comparison.experiment_baseline?.result}
                {metric}
                definition={comparison.metric_definitions[metric]}
                {showActualValue}
                {showStdDev}
                {showCount}
                {showStatistics}
              /></td
            >
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
    text-align: left;
    vertical-align: bottom;
    border-bottom: 1px solid #ddd;
  }

  td {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
    text-align: left;
  }

  td.label {
    text-align: left;
    font-weight: bold;
  }

  .checkbox-column {
    text-align: center;
  }

  .highlighted {
    background-color: #333333;
  }

  input[type="checkbox"] {
    cursor: pointer;
  }

  .selection {
    width: 80rem;
    text-align: right;
  }
</style>
