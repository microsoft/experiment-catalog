<script lang="ts">
  import { onMount } from "svelte";
  import ExperimentCard from "./ExperimentCard.svelte";
  import CreateExperimentModal from "./CreateExperimentModal.svelte";
  import EditExperimentDisplayModal from "./EditExperimentDisplayModal.svelte";
  import { listExperiments, createExperiment, updateExperimentDisplay } from "./api";

  interface Props {
    project: Project;
    onselect?: (experiment: Experiment) => void;
    onunselectProject?: () => void;
  }

  let { project, onselect, onunselectProject }: Props = $props();

  let experiments: Experiment[] = $state([]);
  let loadingState: "loading" | "loaded" | "error" = $state("loading");
  let showCreateModal = $state(false);
  let createError = $state("");
  let editingExperiment: Experiment | undefined = $state();
  let displayError = $state("");
  let savingDisplay = $state(false);

  const fetchExperiments = async () => {
    try {
      loadingState = "loading";
      experiments = await listExperiments(project.name);
      loadingState = "loaded";
    } catch (error) {
      console.error(error);
      loadingState = "error";
    }
  };

  onMount(() => {
    fetchExperiments();
  });

  const select = (experiment: Experiment) => {
    onselect?.(experiment);
  };

  const unselectProject = () => {
    onunselectProject?.();
  };

  const openCreateModal = () => {
    createError = "";
    showCreateModal = true;
  };

  const handleCreateSubmit = async (event: {
    name: string;
    hypothesis: string;
  }) => {
    const { name, hypothesis } = event;
    createError = "";
    try {
      const response = await createExperiment(project.name, name, hypothesis);
      if (response.ok) {
        showCreateModal = false;
        fetchExperiments();
      } else {
        const errorText = await response.text();
        createError =
          errorText || `Error: ${response.status} ${response.statusText}`;
      }
    } catch (error) {
      createError =
        error instanceof Error ? error.message : "An unexpected error occurred";
    }
  };

  const handleCreateCancel = () => {
    showCreateModal = false;
  };

  const updateDisplay = async (experiment: Experiment, display: { emoji: string | null; note: string | null }) => {
    const response = await updateExperimentDisplay(
      project.name, experiment.name, display.emoji, display.note,
    );
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`HTTP ${response.status}: ${message || response.statusText}`);
    }
    const updated: Experiment = await response.json();
    experiments = experiments.map((item) => item.name === experiment.name ? updated : item);
  };

  const saveEmoji = (experiment: Experiment, emoji: string | null) =>
    updateDisplay(experiment, { emoji, note: experiment.note ?? null });

  const editExperiment = (experiment: Experiment) => {
    displayError = "";
    editingExperiment = experiment;
  };

  const saveDisplay = async (display: { emoji: string | null; note: string | null }) => {
    if (!editingExperiment || savingDisplay) return;
    const experiment = editingExperiment;
    savingDisplay = true;
    displayError = "";
    try {
      await updateDisplay(experiment, display);
      editingExperiment = undefined;
    } catch (error) {
      displayError = error instanceof Error ? error.message : "Could not save experiment display";
    } finally {
      savingDisplay = false;
    }
  };
</script>

<button class="btn" onclick={unselectProject}>&larr; back</button>
<h1>Experiments in {project.name}</h1>
<div class="actions">
  <button class="btn" onclick={openCreateModal}>+ create experiment</button>
</div>

{#if loadingState === "loading"}
  <div>Loading...</div>
  <div>
    <img class="loading" alt="loading" src="./spinner.gif" />
  </div>
{:else if loadingState === "error"}
  <div>Error loading experiments.</div>
{:else}
  <div class="flex-container">
    {#each experiments as experiment (experiment.name)}
      <ExperimentCard onselect={select} onedit={editExperiment} onemoji={saveEmoji} {experiment} />
    {/each}
  </div>
{/if}

<CreateExperimentModal
  isOpen={showCreateModal}
  projectName={project.name}
  error={createError}
  onsubmit={handleCreateSubmit}
  oncancel={handleCreateCancel}
/>
{#if editingExperiment}
  <EditExperimentDisplayModal
    experiment={editingExperiment}
    error={displayError}
    saving={savingDisplay}
    onsubmit={saveDisplay}
    oncancel={() => { editingExperiment = undefined; }}
  />
{/if}

<style>
  .actions {
    margin-bottom: 1rem;
  }

  .flex-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-around;
  }
</style>
