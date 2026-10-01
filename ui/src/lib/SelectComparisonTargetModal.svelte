<script lang="ts">
  import { onMount } from "svelte";
  import { getSets, listExperiments, listProjects } from "./api";
  import ComparisonTargetWarning from "./ComparisonTargetWarning.svelte";
  import type { ComparisonTarget } from "./Tools";

  interface Props {
    currentProject: string;
    currentExperiment: string;
    target?: ComparisonTarget;
    onselect: (target: ComparisonTarget) => void;
    onclose: () => void;
  }

  let { currentProject, currentExperiment, target, onselect, onclose }: Props = $props();
  let projects: Project[] = $state([]);
  let experiments: Experiment[] = $state([]);
  let sets: string[] = $state([]);
  let selectedProject = $state("");
  let selectedExperiment = $state("");
  let selectedSet = $state("");
  let loading = $state(true);
  let error = $state("");
  let requestId = 0;
  let dialog: HTMLDivElement;

  const loadSets = async (id: number) => {
    sets = [];
    if (!selectedExperiment) {
      loading = false;
      return;
    }
    try {
      const available = await getSets(selectedProject, selectedExperiment);
      if (id !== requestId) return;
      sets = available;
      if (!sets.includes(selectedSet)) selectedSet = sets[0] ?? "";
    } catch (e) {
      if (id !== requestId) return;
      error = `Could not load sets: ${String(e)}`;
    } finally {
      if (id === requestId) loading = false;
    }
  };

  const loadExperiments = async () => {
    const id = ++requestId;
    loading = true;
    error = "";
    experiments = [];
    sets = [];
    try {
      const available = await listExperiments(selectedProject);
      if (id !== requestId) return;
      experiments = available;
      if (!experiments.some((item) => item.name === selectedExperiment)) {
        selectedExperiment = experiments[0]?.name ?? "";
        selectedSet = "";
      }
      await loadSets(id);
    } catch (e) {
      if (id !== requestId) return;
      error = `Could not load experiments: ${String(e)}`;
      loading = false;
    }
  };

  const changeExperiment = () => {
    const id = ++requestId;
    loading = true;
    error = "";
    selectedSet = "";
    loadSets(id);
  };

  onMount(async () => {
    selectedProject = target?.project ?? currentProject;
    selectedExperiment = target?.experiment ?? currentExperiment;
    selectedSet = target?.set ?? "";
    dialog.focus();
    try {
      projects = await listProjects();
      if (!projects.some((item) => item.name === selectedProject)) {
        error = "The selected project is no longer available.";
        loading = false;
        return;
      }
      await loadExperiments();
    } catch (e) {
      error = `Could not load projects: ${String(e)}`;
      loading = false;
    }
  });
</script>

<svelte:window onkeydown={(event) => { if (event.key === "Escape") onclose(); }} />

<div class="backdrop" role="presentation" onclick={onclose}>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label="Choose comparison target"
    tabindex="-1"
    bind:this={dialog}
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => event.stopPropagation()}
  >
    <h3>Compare against</h3>
    <label for="target-project">Project</label>
    <select id="target-project" bind:value={selectedProject} onchange={loadExperiments}>
      {#each projects as item}
        <option value={item.name}>{item.name}</option>
      {/each}
    </select>
    <ComparisonTargetWarning {currentProject} targetProject={selectedProject} />
    <label for="target-experiment">Experiment</label>
    <select
      id="target-experiment"
      bind:value={selectedExperiment}
      onchange={changeExperiment}
      disabled={loading || experiments.length === 0}
    >
      {#each experiments as item}
        <option value={item.name}>{item.name}</option>
      {/each}
    </select>
    <label for="target-set">Set</label>
    <select id="target-set" bind:value={selectedSet} disabled={loading || sets.length === 0}>
      {#each sets as item}
        <option value={item}>{item}</option>
      {/each}
    </select>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {:else if !loading && sets.length === 0}
      <p>No sets are available for this experiment.</p>
    {/if}
    <div class="actions">
      <button class="btn" onclick={onclose}>Cancel</button>
      <button
        class="btn"
        disabled={loading || !!error || !selectedSet}
        onclick={() => onselect({ project: selectedProject, experiment: selectedExperiment, set: selectedSet })}
      >
        Compare
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  .modal {
    background: #2a2a2a;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 1.5rem;
    width: min(28rem, 90vw);
  }
  h3 { margin-top: 0; }
  label { display: block; margin-top: 1rem; }
  select { width: 100%; padding: 0.4rem; }
  .error { color: #ffaaaa; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; }
</style>
