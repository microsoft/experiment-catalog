<script lang="ts">
  import { getContext } from "svelte";
  import type { BoxStats } from "./distributionData";

  interface Props {
    boxStats: BoxStats[];
    colorForGroup: (index: number) => string;
    labels: string[];
  }

  let { boxStats, colorForGroup, labels }: Props = $props();

  const { yScale, width } = getContext("LayerCake") as any;

  function bandWidth(): number {
    return $width / labels.length;
  }

  // Box plot sits on the RIGHT portion of each band
  function boxCenterX(index: number): number {
    const bw = bandWidth();
    return index * bw + bw * 0.68;
  }
</script>

{#each boxStats as stats, i}
  {#if stats.values.length >= 2}
    {@const bw = bandWidth()}
    {@const cx = boxCenterX(i)}
    {@const boxW = bw * 0.35}
    {@const color = colorForGroup(i)}
    {@const halfW = boxW / 2}
    {@const capW = boxW * 0.4}

    <!-- Whisker line (vertical) -->
    <line
      x1={cx}
      x2={cx}
      y1={$yScale(stats.whiskerHigh)}
      y2={$yScale(stats.whiskerLow)}
      stroke={color}
      stroke-width="2"
    />

    <!-- Whisker cap - top -->
    <line
      x1={cx - capW}
      x2={cx + capW}
      y1={$yScale(stats.whiskerHigh)}
      y2={$yScale(stats.whiskerHigh)}
      stroke={color}
      stroke-width="2"
    />

    <!-- Whisker cap - bottom -->
    <line
      x1={cx - capW}
      x2={cx + capW}
      y1={$yScale(stats.whiskerLow)}
      y2={$yScale(stats.whiskerLow)}
      stroke={color}
      stroke-width="2"
    />

    <!-- Box (Q1 to Q3) -->
    <rect
      x={cx - halfW}
      y={$yScale(stats.q3)}
      width={boxW}
      height={$yScale(stats.q1) - $yScale(stats.q3)}
      fill={color}
      fill-opacity="0.3"
      stroke={color}
      stroke-width="2"
    />

    <!-- Median line -->
    <line
      x1={cx - halfW}
      x2={cx + halfW}
      y1={$yScale(stats.median)}
      y2={$yScale(stats.median)}
      stroke={color}
      stroke-width="3"
    />
  {:else if stats.values.length === 1}
    {@const cx = boxCenterX(i)}
    <circle
      cx={cx}
      cy={$yScale(stats.values[0])}
      r="6"
      fill={colorForGroup(i)}
      opacity="0.8"
    />
  {/if}
{/each}

