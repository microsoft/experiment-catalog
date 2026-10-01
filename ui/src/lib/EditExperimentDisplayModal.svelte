<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { experimentEmojis } from "./experimentDisplay";

  interface Props {
    experiment: Experiment;
    error: string;
    saving: boolean;
    onsubmit: (display: { emoji: string | null; note: string | null }) => void;
    oncancel: () => void;
  }

  let { experiment, error, saving, onsubmit, oncancel }: Props = $props();
  let emoji = $state("");
  let note = $state("");
  let dialog: HTMLDialogElement;
  let trigger: HTMLElement | null = null;

  onMount(() => {
    emoji = experiment.emoji ?? "";
    note = experiment.note ?? "";
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
    onsubmit({ emoji: emoji || null, note: note.trim() || null });
  };

  const cancel = (event: Event) => {
    event.preventDefault();
    if (!saving) oncancel();
  };
</script>

<dialog bind:this={dialog} aria-labelledby="experiment-display-title" oncancel={cancel}>
  <form onsubmit={submit}>
    <h3 id="experiment-display-title">Edit display for {experiment.name}</h3>
    <label for="experiment-display-emoji">Emoji</label>
    <select id="experiment-display-emoji" bind:value={emoji} disabled={saving}>
      <option value="">No emoji</option>
      {#each experimentEmojis as option}
        <option value={option.id}>{option.symbol} {option.label}</option>
      {/each}
    </select>
    <label for="experiment-display-note">Note</label>
    <input id="experiment-display-note" bind:value={note} maxlength="40" disabled={saving} />
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
