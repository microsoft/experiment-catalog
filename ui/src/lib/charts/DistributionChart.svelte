<script lang="ts">
  import { LayerCake, Svg } from "layercake";
  import BeeswarmLayer from "./BeeswarmLayer.svelte";
  import BoxPlotLayer from "./BoxPlotLayer.svelte";
  import AxisX from "./AxisX.svelte";
  import AxisY from "./AxisY.svelte";
  import { computeBoxStats, deterministicJitter, type BoxStats } from "./distributionData";

  interface SetGroup {
    label: string;
    values: number[];
  }

  interface Props {
    groups: SetGroup[];
    metric: string;
    metricDefinition?: MetricDefinition;
  }

  let { groups, metric, metricDefinition }: Props = $props();

  const COLORS = [
    "#4ecdc4", // teal
    "#e8862a", // orange
    "#a78bfa", // purple
    "#f472b6", // pink
    "#34d399", // green
    "#60a5fa", // blue
    "#fbbf24", // yellow
    "#fb7185", // rose
  ];

  let labels: string[] = $derived(groups.map((g) => g.label));

  let boxStats: BoxStats[] = $derived(
    groups.map((g) => computeBoxStats(g.label, g.values)),
  );

  let yDomain: [number, number] = $derived.by(() => {
    // Use metric definition min/max if both are defined and valid
    if (
      metricDefinition != null &&
      metricDefinition.min != null &&
      metricDefinition.max != null &&
      metricDefinition.min < metricDefinition.max
    ) {
      return [metricDefinition.min, metricDefinition.max];
    }
    // Otherwise derive from data
    const allValues = groups.flatMap((g) => g.values);
    if (allValues.length === 0) return [0, 1];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.08 || 1;
    return [min - padding, max + padding];
  });

  function colorForGroup(index: number): string {
    return COLORS[index % COLORS.length];
  }
</script>

{#if groups.every((g) => g.values.length === 0)}
  <div class="no-data">No data available for metric "{metric}"</div>
{:else}
  {@const MIN_BAND_WIDTH = 250}
  {@const chartWidth = Math.max(groups.length * MIN_BAND_WIDTH, 600)}
  <div class="chart-wrapper">
    <div class="chart-scroll">
      <div class="chart-body" style="width: {chartWidth}px;">
        <div class="chart-container">
          <LayerCake
            padding={{ top: 30, right: 40, bottom: 85, left: 80 }}
            x="label"
            y="value"
            xScale={undefined}
            xDomain={labels}
            {yDomain}
            data={groups.flatMap((g, gi) =>
              g.values.map((v, i) => ({ label: g.label, value: v, index: i, groupIndex: gi }))
            )}
          >
            <Svg>
              <AxisY />
              <AxisX {labels} />
              <BoxPlotLayer {boxStats} {colorForGroup} {labels} />
              <BeeswarmLayer {groups} {colorForGroup} />
            </Svg>
          </LayerCake>
        </div>
      </div>
    </div>
    <span class="x-label">Permutations</span>
  </div>
{/if}

<style>
  .chart-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .chart-scroll {
    width: 100%;
    overflow-x: auto;
  }

  .chart-body {
    min-width: 100%;
  }

  .chart-container {
    width: 100%;
    height: 700px;
    background: #161b2e;
    border-radius: 8px;
  }

  .x-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #aaa;
    margin-top: 0.5rem;
  }

  .no-data {
    padding: 2rem;
    text-align: center;
    color: #999;
    font-style: italic;
  }
</style>


