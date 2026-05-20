<script lang="ts">
  import { getContext } from "svelte";

  const { yScale, width } = getContext("LayerCake") as any;

  // Generate nice tick values
  function getTicks(scale: any): number[] {
    const [min, max] = scale.domain();
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
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(4);
  }
</script>

{#each getTicks($yScale) as tick}
  <!-- Grid line spanning full width -->
  <line
    x1={0}
    x2={$width}
    y1={$yScale(tick)}
    y2={$yScale(tick)}
    stroke="#334155"
    stroke-width="1"
  />
  <!-- Tick label -->
  <text
    x={-12}
    y={$yScale(tick)}
    text-anchor="end"
    dominant-baseline="middle"
    fill="#94a3b8"
    font-size="13"
    font-weight="500"
  >
    {formatTick(tick)}
  </text>
{/each}

