<script lang="ts">
  interface Props {
    result?: Result;
    baseline?: Result;
    metric: string;
    definition?: MetricDefinition;
    showActualValue?: boolean;
    showStdDev?: boolean;
    showCount?: boolean;
    showStatistics?: boolean;
  }

  let {
    result,
    baseline = undefined,
    metric,
    definition = undefined,
    showActualValue = true,
    showStdDev = true,
    showCount = true,
    showStatistics = true,
  }: Props = $props();

  let isCount: boolean = $derived(
    !!(definition && definition.aggregate_function === "Count")
  );
  let isCost: boolean = $derived(
    !!(definition && definition.aggregate_function === "Cost")
  );
  let isAvg: boolean = $derived(!(isCount || isCost));
  let lowerIsBetter: boolean = $derived(
    !!(definition && definition.tags && definition.tags.includes("lower-is-better"))
  );

  let diff: number = $derived.by(() => {
    const resultMetric = result?.metrics?.[metric];
    const baselineMetric = baseline?.metrics?.[metric];
    const hasValidMetrics = resultMetric && baselineMetric;
    return hasValidMetrics ? resultMetric.value - baselineMetric.value : 0;
  });

  let difp: number | undefined = $derived.by(() => {
    const resultMetric = result?.metrics?.[metric];
    const baselineMetric = baseline?.metrics?.[metric];
    const hasValidMetrics = resultMetric && baselineMetric;
    return hasValidMetrics &&
      resultMetric.normalized !== undefined &&
      baselineMetric.normalized !== undefined
      ? (resultMetric.normalized - baselineMetric.normalized) /
          baselineMetric.normalized
      : undefined;
  });

  let opacity: number = $derived(
    difp !== undefined ? 30 + Math.abs(difp) * (80 - 30) * 4 : 30
  );
  let p_value: number | undefined = $derived(result?.metrics?.[metric]?.p_value);
  let ci_lower: number | undefined = $derived(result?.metrics?.[metric]?.ci_lower);
  let ci_upper: number | undefined = $derived(result?.metrics?.[metric]?.ci_upper);
</script>

<nobr>
  {#if result && result.metrics && result.metrics[metric]}
    {#if isCount}
      <span>{result.metrics[metric].value.toLocaleString()}</span>
    {:else if isCost}
      <span
        >{result.metrics[metric].value.toFixed(2) === "0.00" &&
        result.metrics[metric].value > 0
          ? ">$0.00"
          : "$" +
            result.metrics[metric].value.toFixed(2).toLocaleString()}</span
      >
    {:else if result.metrics[metric].value == undefined}
      <span>-</span>
    {:else}
      <span
        >{result.metrics[metric].value.toFixed(3) === "0.000" &&
        result.metrics[metric].value > 0
          ? ">0.00"
          : result.metrics[metric].value.toFixed(3).toLocaleString()}</span
      >
      {#if isAvg && showActualValue}
        <span class="actual"
          >&nbsp;{difp != undefined && difp > 0 ? "+" : ""}{diff.toFixed(3)}&nbsp;</span
        >
      {/if}
    {/if}
    {#if showStdDev && isAvg && result.metrics[metric].std_dev !== undefined}
      <span>({result.metrics[metric].std_dev.toFixed(3).toLocaleString()})</span
      >
    {/if}
    {#if isAvg && diff === 0 && result.metrics[metric].value !== undefined}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
        <polygon
          points="10,15 35,15 35,35 10,35"
          style="fill:gray;stroke:black;stroke-width:1"
        />
      </svg>
    {/if}
    {#if isAvg && diff > 0}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 40 40"
        style="opacity: {opacity}%"
      >
        <polygon
          points="25,10 10,40 40,40"
          style="fill:{lowerIsBetter
            ? 'red'
            : 'green'};stroke:black;stroke-width:1"
        />
      </svg>
    {/if}
    {#if isAvg && diff < 0}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 40 40"
        style="opacity: {opacity}%"
      >
        <polygon
          points="10,10 40,10 25,40"
          style="fill:{lowerIsBetter
            ? 'green'
            : 'red'};stroke:black;stroke-width:1"
        />
      </svg>
    {/if}

    {#if difp != undefined && !Number.isNaN(difp) && Number.isFinite(difp) && !lowerIsBetter}
      <span class:difp-red={difp < 0} class:difp-green={difp > 0}
        >{difp > 0 ? "+" : ""}{(difp * 100).toFixed(0)}%</span
      >
    {/if}
    {#if difp != undefined && !Number.isNaN(difp) && Number.isFinite(difp) && lowerIsBetter}
      <span class:difp-red={difp > 0} class:difp-green={difp < 0}
        >{difp > 0 ? "+" : ""}{(difp * 100).toFixed(0)}%</span
      >
    {/if}
    {#if difp != undefined && !Number.isNaN(difp) && !Number.isFinite(difp)}
      <span class:difp-green={!lowerIsBetter} class:difp-red={lowerIsBetter}
        >&infin;%</span
      >
    {/if}
    {#if difp != undefined && Number.isNaN(difp) && diff === 0}
      <span>0%</span>
    {/if}
    {#if difp != undefined && Number.isNaN(difp) && diff < 0}
      <span class:difp-green={lowerIsBetter} class:difp-red={!lowerIsBetter}
        >&infin;%</span
      >
    {/if}

    {#if showCount && result.metrics[metric].count !== undefined}
      {#if !isAvg}
        <span>&nbsp;</span>
      {/if}
      <span>x{result.metrics[metric].count}</span>
    {/if}

    {#if showStatistics && p_value != undefined && !Number.isNaN(p_value) && Number.isFinite(p_value)}
      <span class="pvalue">p={p_value.toFixed(2)}</span>
      {#if ci_lower != undefined && ci_upper != undefined}
        <span class="pvalue"
          >({ci_lower.toFixed(3).toLocaleString()} to
          {ci_upper.toFixed(3).toLocaleString()})</span
        >
      {/if}
    {/if}
  {:else}
    <span>-</span>
  {/if}
</nobr>

<style>
  svg {
    width: 1.2rem;
    height: 1.2rem;
  }

  .difp-red {
    color: #f66;
  }

  .difp-green {
    color: #6a6;
  }

  .actual {
    font-weight: lighter;
  }

  .pvalue {
    font-size: 0.85em;
    font-style: italic;
    color: #888;
    background-color: rgba(255, 255, 255, 0.05);
    padding: 2px 4px;
    border-radius: 3px;
    margin-left: 4px;
  }
</style>
