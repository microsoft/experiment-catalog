<script lang="ts">
  import { onMount } from "svelte";
  import EmojiPicker from "./EmojiPicker.svelte";

  interface Props {
    experiment: Experiment;
    onselect?: (experiment: Experiment) => void;
    onedit: (experiment: Experiment) => void;
    onemoji: (experiment: Experiment, emoji: string | null) => Promise<void>;
  }

  let { experiment, onselect, onedit, onemoji }: Props = $props();
  let savingEmoji = $state(false);
  let emojiError = $state("");

  let titleRef: HTMLElement;
  let cardRef: HTMLElement;

  const select = () => {
    onselect?.(experiment);
  };

  const saveEmoji = async (emoji: string | null) => {
    if (savingEmoji) return false;
    savingEmoji = true;
    emojiError = "";
    try {
      await onemoji(experiment, emoji);
      return true;
    } catch (error) {
      emojiError = error instanceof Error ? error.message : "Could not save experiment emoji";
      return false;
    } finally {
      savingEmoji = false;
    }
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

<div class="card-container" bind:this={cardRef}>
  <button class="card" onclick={select}>
    <div class="title">{experiment.name}</div>
    <div class="hypothesis"><b>Hypothesis:</b> {experiment.hypothesis}</div>
  </button>
  <div class="display-row">
    <EmojiPicker name={experiment.name} emoji={experiment.emoji} disabled={savingEmoji} onselect={saveEmoji} />
    {#if experiment.note}<span class="note" title={experiment.note}>{experiment.note}</span>{/if}
  </div>
  {#if emojiError}<div class="error" role="alert">{emojiError}</div>{/if}
  <button
    class="btn edit"
    type="button"
    aria-label={`Edit display for ${experiment.name}`}
    title="Edit experiment display"
    disabled={savingEmoji}
    onclick={() => onedit(experiment)}
  >edit</button>
</div>

<style>
  .card-container {
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    border: 1px solid #ccc;
    border-radius: 6px;
    margin: 1rem;
    min-width: 20rem;
    max-width: calc(100vw - 2rem);
    background: inherit;
    color: inherit;
  }

  .card-container:hover {
    background: #444;
    border-color: #666;
    color: #fff;
  }

  .card {
    display: block;
    flex: 1;
    box-sizing: border-box;
    width: 100%;
    border: 0;
    padding: 1rem;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .title {
    font-size: 1.5rem;
    font-weight: bold;
    color: #ccc;
  }

  .hypothesis {
    font-size: 1.2rem;
  }

  .display-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3rem;
    padding: 0 4rem 1rem 1rem;
  }

  .note {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  .error {
    padding: 0 4rem 1rem 1rem;
    color: #ffaaaa;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }

  .edit {
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    padding: 0.25rem 0.5rem;
  }
</style>
