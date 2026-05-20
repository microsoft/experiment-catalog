<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    experiment: Experiment;
    onselect?: (experiment: Experiment) => void;
  }

  let { experiment, onselect }: Props = $props();

  let titleRef: HTMLElement;
  let cardRef: HTMLElement;

  const select = () => {
    onselect?.(experiment);
  };

  onMount(() => {
    if (titleRef && cardRef) {
      const titleWidth = titleRef.offsetWidth;
      cardRef.style.maxWidth = `${titleWidth}px`;
      titleRef.style.display = "none";
    }
  });
</script>

<div class="title" bind:this={titleRef}>
  {experiment.name}
</div>

<button class="card" bind:this={cardRef} onclick={select}>
  <div class="title">
    {experiment.name}
  </div>
  <div class="hypothesis"><b>Hypothesis:</b> {experiment.hypothesis}</div>
</button>

<style>
  .card {
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 1rem;
    margin: 1rem;
    min-width: 20rem;
    background: inherit;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .card:hover {
    background: #444;
    border-color: #666;
    color: #fff;
  }

  .title {
    font-size: 1.5rem;
    font-weight: bold;
    color: #ccc;
  }

  .hypothesis {
    font-size: 1.2rem;
  }
</style>
