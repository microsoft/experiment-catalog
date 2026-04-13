<script lang="ts">
  import { onMount } from "svelte";
  import ExperimentCard from "./ExperimentCard.svelte";
  import CreateExperimentModal from "./CreateExperimentModal.svelte";
  import { listExperiments, createExperiment } from "./api";

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
</script>

<button class="link" onclick={unselectProject}>back</button>
<h1>Experiments in {project.name}</h1>
<div class="actions">
  <button class="link" onclick={openCreateModal}>+ create experiment</button>
</div>

{#if loadingState === "loading"}
  <div>Loading...</div>
  <div>
    <img class="loading" alt="loading" src="/spinner.gif" />
  </div>
{:else if loadingState === "error"}
  <div>Error loading experiments.</div>
{:else}
  <div class="flex-container">
    {#each experiments as experiment (experiment.name)}
      <ExperimentCard onselect={select} {experiment} />
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
