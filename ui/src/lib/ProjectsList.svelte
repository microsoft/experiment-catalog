<script lang="ts">
  import { onMount } from "svelte";
  import ProjectCard from "./ProjectCard.svelte";
  import CreateProjectModal from "./CreateProjectModal.svelte";
  import EditProjectDisplayModal from "./EditProjectDisplayModal.svelte";
  import { listProjects, createProject, updateProjectDisplay, type ProjectDisplayUpdate } from "./api";

  interface Props {
    onselect?: (project: Project) => void;
  }

  let { onselect }: Props = $props();

  let projects: Project[] = $state([]);
  let loadingState: "loading" | "loaded" | "error" = $state("loading");
  let showCreateModal = $state(false);
  let createError = $state("");
  let editingProject: Project | undefined = $state();
  let displayError = $state("");
  let savingDisplay = $state(false);

  const fetchProjects = async () => {
    try {
      loadingState = "loading";
      projects = await listProjects();
      loadingState = "loaded";
    } catch (error) {
      console.error(error);
      loadingState = "error";
    }
  };

  onMount(() => {
    fetchProjects();
  });

  const select = (project: Project) => {
    onselect?.(project);
  };

  const openCreateModal = () => {
    createError = "";
    showCreateModal = true;
  };

  const handleCreateSubmit = async (event: { name: string }) => {
    const { name } = event;
    createError = "";
    try {
      const response = await createProject(name);
      if (response.ok) {
        showCreateModal = false;
        fetchProjects();
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

  const editProject = (project: Project) => {
    displayError = "";
    editingProject = project;
  };

  const updateDisplay = async (projectName: string, display: ProjectDisplayUpdate) => {
    const response = await updateProjectDisplay(projectName, display);
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`HTTP ${response.status}: ${message || response.statusText}`);
    }
    const updated: Project = await response.json();
    projects = projects.map((item) => item.name === projectName ? updated : item);
  };

  const saveEmoji = (project: Project, emoji: string | null) =>
    updateDisplay(project.name, {
      emoji,
      note: project.note ?? null,
      ground_truth: project.ground_truth ?? null,
    });

  const saveDisplay = async (display: ProjectDisplayUpdate) => {
    if (!editingProject || savingDisplay) return;
    const projectName = editingProject.name;
    savingDisplay = true;
    displayError = "";
    try {
      await updateDisplay(projectName, display);
      editingProject = undefined;
    } catch (error) {
      displayError = error instanceof Error ? error.message : "Could not save project display";
    } finally {
      savingDisplay = false;
    }
  };
</script>

<h1>Projects</h1>
<div class="actions">
  <button class="btn" onclick={openCreateModal}>+ create project</button>
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
    {#each projects as project (project.name)}
      <ProjectCard onselect={select} onedit={editProject} onemoji={saveEmoji} {project} />
    {/each}
  </div>
{/if}

<CreateProjectModal
  isOpen={showCreateModal}
  error={createError}
  onsubmit={handleCreateSubmit}
  oncancel={handleCreateCancel}
/>
{#if editingProject}
  <EditProjectDisplayModal
    project={editingProject}
    error={displayError}
    saving={savingDisplay}
    onsubmit={saveDisplay}
    oncancel={() => { editingProject = undefined; }}
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
