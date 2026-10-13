<script lang="ts">
  import { getLayerCakeContext } from "layercake";
  import { deterministicJitter } from "./distributionData";

  interface SetGroup {
    label: string;
    values: number[];
  }

  interface Props {
    groups: SetGroup[];
    colorForGroup: (index: number) => string;
  }

  let { groups, colorForGroup }: Props = $props();

  const chart = getLayerCakeContext();

  // Beeswarm dots sit on the LEFT portion of each band
  function getX(groupIndex: number, pointIndex: number, total: number): number {
    const bandWidth = chart.width / groups.length;
    const beeswarmCenter = groupIndex * bandWidth + bandWidth * 0.3;
    const jitter = deterministicJitter(pointIndex, total) * bandWidth * 0.22;
    return beeswarmCenter + jitter;
  }
</script>

{#each groups as group, gi}
  {#each group.values as value, pi}
    <circle
      cx={getX(gi, pi, group.values.length)}
      cy={chart.yScale(value)}
      r="4"
      fill={colorForGroup(gi)}
      opacity="0.75"
    />
  {/each}
{/each}

