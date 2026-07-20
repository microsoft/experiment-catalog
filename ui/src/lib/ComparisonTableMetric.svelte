<script lang="ts">
  interface Props {
    result?: Result;
    baseline?: Result;
    metric: string;
    definition?: MetricDefinition;
    showActualValue?: boolean;
    showCoefficientOfVariation?: boolean;
    showStdDev?: boolean;
    showRange?: boolean;
    showCount?: boolean;
    showStatistics?: boolean;
  }

  let {
    result,
    baseline = undefined,
    metric,
    definition = undefined,
    showActualValue = true,
    showCoefficientOfVariation = true,
    showStdDev = true,
    showRange = false,
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
  let coefficientOfVariation: number | undefined = $derived.by(() => {
    const resultMetric = result?.metrics?.[metric];
    if (!resultMetric) return undefined;
    if (resultMetric.coefficient_of_variation !== undefined) {
      return resultMetric.coefficient_of_variation;
    }
    if (resultMetric.std_dev === undefined || resultMetric.value === 0) {
      return undefined;
    }
    return resultMetric.std_dev / Math.abs(resultMetric.value);
  });
  type SummaryPart = {
    label: string;
    value: string;
  };

  const formatNumber = (value: number) => value.toFixed(3).toLocaleString();

  let summaryParts: SummaryPart[] = $derived.by(() => {
    const resultMetric = result?.metrics?.[metric];
    if (!isAvg || !resultMetric) return [];

    const parts: SummaryPart[] = [];
    if (showCoefficientOfVariation && coefficientOfVariation !== undefined) {
      parts.push({
        label: "cv",
        value: `${(coefficientOfVariation * 100).toFixed(1).toLocaleString()}%`,
      });
    }
    if (showStdDev && resultMetric.std_dev !== undefined) {
      parts.push({ label: "dev", value: formatNumber(resultMetric.std_dev) });
    }
    if (showRange) {
      if (
        resultMetric.range_min !== undefined &&
        resultMetric.range_max !== undefined
      ) {
        parts.push({
          label: "rng",
          value: `${formatNumber(resultMetric.range_min)}-${formatNumber(resultMetric.range_max)}`,
        });
      } else if (resultMetric.range !== undefined) {
        parts.push({ label: "rng", value: formatNumber(resultMetric.range) });
      }
    }
    return parts;
  });
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
    {#if summaryParts.length > 0}
      <span class="summary"
        >({#each summaryParts as part, index}<span class="summary-label"
            >{part.label}</span
          >
          {part.value}{#if index < summaryParts.length - 1},{" "}{/if}{/each})</span
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

  .summary {
    font-size: 0.9em;
  }

  .summary-label {
    color: #aaa;
    font-size: 0.72em;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
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
