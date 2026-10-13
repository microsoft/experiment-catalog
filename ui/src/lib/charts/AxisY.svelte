<script lang="ts">
  import { getLayerCakeContext } from "layercake";
  import { formatMetricValue } from "../metricFormatters";

  interface Props {
    metricDefinition?: MetricDefinition;
  }

  let { metricDefinition }: Props = $props();

  const chart = getLayerCakeContext();

  // Generate nice tick values
  function getTicks(domain: number[]): number[] {
    const [min, max] = domain;
    const range = max - min;
    const step = niceStep(range / 5);
    const ticks: number[] = [];
    let tick = Math.ceil(min / step) * step;
    while (tick <= max) {
      ticks.push(tick);
      tick += step;
    }
    return ticks;
  }

  function niceStep(rough: number): number {
    const exp = Math.floor(Math.log10(rough));
    const frac = rough / Math.pow(10, exp);
    let nice: number;
    if (frac <= 1.5) nice = 1;
    else if (frac <= 3) nice = 2;
    else if (frac <= 7) nice = 5;
    else nice = 10;
    return nice * Math.pow(10, exp);
  }

  function formatTick(value: number): string {
    return formatMetricValue(value, metricDefinition?.tags, (numericValue) => {
      if (Math.abs(numericValue) >= 1000000) {
        return `${(numericValue / 1000000).toFixed(1)}M`;
      }
      if (Math.abs(numericValue) >= 1000) {
        return `${(numericValue / 1000).toFixed(0)}k`;
      }
      if (Number.isInteger(numericValue)) return numericValue.toString();
      return numericValue.toFixed(4);
    });
  }
</script>

{#each getTicks(chart.yScale.domain()) as tick}
  <!-- Grid line spanning full width -->
  <line
    x1={0}
    x2={chart.width}
    y1={chart.yScale(tick)}
    y2={chart.yScale(tick)}
    stroke="#334155"
    stroke-width="1"
  />
  <!-- Tick label -->
  <text
    x={-12}
    y={chart.yScale(tick)}
    text-anchor="end"
    dominant-baseline="middle"
    fill="#94a3b8"
    font-size="13"
    font-weight="500"
  >
    {formatTick(tick)}
  </text>
{/each}
