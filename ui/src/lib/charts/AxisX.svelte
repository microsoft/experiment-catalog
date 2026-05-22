<script lang="ts">
  import { getContext } from "svelte";

  interface Props {
    labels: string[];
    annotations?: Annotation[][];
  }

  let { labels, annotations = [] }: Props = $props();

  const { width, height } = getContext("LayerCake") as any;

  function bandWidth(): number {
    return $width / (labels.length || 1);
  }
</script>

<!-- Baseline -->
<line
  x1={0}
  x2={$width}
  y1={$height}
  y2={$height}
  stroke="#334155"
  stroke-width="1"
/>

{#each labels as label, i}
  {@const bw = bandWidth()}
  {@const x = i * bw + bw / 2}
  {@const parts = String(label).includes(": ") ? String(label).split(": ") : [String(label)]}
  {@const groupAnnotations = annotations[i] ?? []}
  <text
    {x}
    y={$height + 22}
    text-anchor="middle"
    fill="#c8d0dc"
    font-size="13"
    font-weight="500"
  >
    {#if parts.length === 2}
      <tspan {x} dy="0">{parts[0]}:</tspan>
      <tspan {x} dy="1.3em">{parts[1].length > 20 ? parts[1].slice(0, 18) + "…" : parts[1]}</tspan>
    {:else}
      <tspan {x} dy="0">{label.length > 20 ? label.slice(0, 18) + "…" : label}</tspan>
    {/if}
    {#each groupAnnotations as annotation}
      <tspan {x} dy="1.3em" fill="#8899aa" font-size="11" font-weight="400">{annotation.text}</tspan>
    {/each}
  </text>
{/each}

