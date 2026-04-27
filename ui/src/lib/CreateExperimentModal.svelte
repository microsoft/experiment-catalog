<script lang="ts">
  interface Props {
    isOpen?: boolean;
    projectName?: string;
    error?: string;
    onsubmit?: (data: { name: string; hypothesis: string }) => void;
    oncancel?: () => void;
  }

  let {
    isOpen = false,
    projectName = "",
    error = "",
    onsubmit,
    oncancel,
  }: Props = $props();

  let experimentName = $state("");
  let hypothesis = $state("");

  const handleSubmit = () => {
    if (!experimentName.trim() || !hypothesis.trim()) return;

    onsubmit?.({
      name: experimentName.trim(),
      hypothesis: hypothesis.trim(),
    });
    resetForm();
  };

  const handleCancel = () => {
    oncancel?.();
    resetForm();
  };

  const resetForm = () => {
    experimentName = "";
    hypothesis = "";
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      handleCancel();
    }
  };
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" onclick={handleCancel} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
    >
      <h3 id="modal-title">Create Experiment in {projectName}</h3>

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      <div class="form-group">
        <label for="experiment-name">Experiment Name *</label>
        <input
          id="experiment-name"
          type="text"
          bind:value={experimentName}
          placeholder="Enter experiment name..."
        />
      </div>

      <div class="form-group">
        <label for="hypothesis">Hypothesis *</label>
        <textarea
          id="hypothesis"
          bind:value={hypothesis}
          placeholder="We believe that..."
          rows="4"
        ></textarea>
      </div>

      <div class="button-group">
        <button class="cancel-btn" onclick={handleCancel}>Cancel</button>
        <button
          class="submit-btn"
          onclick={handleSubmit}
          disabled={!experimentName.trim() || !hypothesis.trim()}
        >
          Create Experiment
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background-color: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 1.5rem;
    min-width: 450px;
    max-width: 90%;
  }

  h3 {
    margin: 0 0 1rem 0;
    color: #fff;
    font-size: 1.1rem;
  }

  .error-message {
    background-color: #5c2020;
    border: 1px solid #8b3030;
    color: #ffaaaa;
    padding: 0.5rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.25rem;
    color: #ccc;
    font-size: 0.9rem;
  }

  input,
  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #555;
    border-radius: 4px;
    background-color: #333;
    color: #fff;
    font-size: 0.9rem;
    box-sizing: border-box;
    font-family: inherit;
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: #0078d4;
  }

  input::placeholder,
  textarea::placeholder {
    color: #777;
  }

  textarea {
    resize: vertical;
  }

  .button-group {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
  }

  .cancel-btn {
    background-color: #444;
    color: #fff;
  }

  .cancel-btn:hover {
    background-color: #555;
  }

  .submit-btn {
    background-color: #0078d4;
    color: #fff;
  }

  .submit-btn:hover:not(:disabled) {
    background-color: #1084d8;
  }

  .submit-btn:disabled {
    background-color: #555;
    color: #888;
    cursor: not-allowed;
  }
</style>
