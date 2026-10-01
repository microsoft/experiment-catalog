<script lang="ts">
  import EmojiPicker from "./EmojiPicker.svelte";

  interface Props {
    project: Project;
    onselect?: (project: Project) => void;
    onedit: (project: Project) => void;
    onemoji: (project: Project, emoji: string | null) => Promise<void>;
  }

  let { project, onselect, onedit, onemoji }: Props = $props();
  let savingEmoji = $state(false);
  let emojiError = $state("");

  const saveEmoji = async (emoji: string | null) => {
    if (savingEmoji) return false;
    savingEmoji = true;
    emojiError = "";
    try {
      await onemoji(project, emoji);
      return true;
    } catch (error) {
      emojiError = error instanceof Error ? error.message : "Could not save project emoji";
      return false;
    } finally {
      savingEmoji = false;
    }
  };
</script>

<div class="card-container">
  <button class="card" onclick={() => onselect?.(project)}>
    <div class="title">{project.name}</div>
  </button>
  <div class="ground-truth-row">
    <span class="ground-truth-label">GROUND TRUTH</span>
    {#if project.ground_truth}
      <span>{project.ground_truth}</span>
    {:else}
      <span class="unset">Unknown</span>
    {/if}
  </div>
  <div class="display-row">
    <EmojiPicker name={project.name} emoji={project.emoji} disabled={savingEmoji} onselect={saveEmoji} />
    {#if project.note}<span class="note" title={project.note}>{project.note}</span>{/if}
  </div>
  {#if emojiError}<div class="error" role="alert">{emojiError}</div>{/if}
  <button
    class="btn edit"
    type="button"
    aria-label={`Edit display for ${project.name}`}
    title="Edit project display"
    disabled={savingEmoji}
    onclick={() => onedit(project)}
  >edit</button>
</div>

<style>
  .card-container {
    position: relative;
    box-sizing: border-box;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 1rem;
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
    width: 100%;
    border: 0;
    padding: 0;
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

  .ground-truth-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-size: 0.9rem;
  }

  .ground-truth-label {
    flex: none;
    color: #aaa;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .unset {
    color: #aaa;
    font-style: italic;
  }

  .display-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.7rem;
    margin-top: 0.25rem;
    padding-right: 4rem;
  }

  .note {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  .error {
    padding-right: 4rem;
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
