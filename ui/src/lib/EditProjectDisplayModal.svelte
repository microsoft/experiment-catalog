<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type { ProjectDisplayUpdate } from "./api";
  import { experimentEmojis } from "./experimentDisplay";

  interface Props {
    project: Project;
    error: string;
    saving: boolean;
    onsubmit: (display: ProjectDisplayUpdate) => void;
    oncancel: () => void;
  }

  let { project, error, saving, onsubmit, oncancel }: Props = $props();
  let emoji = $state("");
  let note = $state("");
  let groundTruth = $state("");
  let dialog: HTMLDialogElement;
  let trigger: HTMLElement | null = null;

  onMount(() => {
    emoji = project.emoji ?? "";
    note = project.note ?? "";
    groundTruth = project.ground_truth ?? "";
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
  });

  onDestroy(() => {
    void tick().then(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (saving) return;
    onsubmit({
      emoji: emoji || null,
      note: note.trim() || null,
      ground_truth: groundTruth.trim() || null,
    });
  };

  const cancel = (event: Event) => {
    event.preventDefault();
    if (!saving) oncancel();
  };
</script>

<dialog bind:this={dialog} aria-labelledby="project-display-title" oncancel={cancel}>
  <form onsubmit={submit}>
    <h3 id="project-display-title">Edit display for {project.name}</h3>
    <label for="project-display-emoji">Emoji</label>
    <select id="project-display-emoji" bind:value={emoji} disabled={saving}>
      <option value="">No emoji</option>
      {#each experimentEmojis as option}
        <option value={option.id}>{option.symbol} {option.label}</option>
      {/each}
    </select>
    <label for="project-display-ground-truth">Ground truth</label>
    <input id="project-display-ground-truth" bind:value={groundTruth} maxlength="40" disabled={saving} />
    <label for="project-display-note">Note</label>
    <input id="project-display-note" bind:value={note} maxlength="40" disabled={saving} />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button class="btn" type="button" onclick={oncancel} disabled={saving}>Cancel</button>
      <button class="btn" type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    background: #2a2a2a;
    color: inherit;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 1.5rem;
    width: min(28rem, 90vw);
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.7);
  }

  h3 { margin-top: 0; }
  label { display: block; margin-top: 1rem; }
  select, input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem;
    border: 1px solid #555;
    border-radius: 4px;
    background: #333;
    color: inherit;
    font: inherit;
  }

  .error { color: #ffaaaa; }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
  }
</style>
