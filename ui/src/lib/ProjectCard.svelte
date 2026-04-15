<script lang="ts">
  interface Props {
    project: Project;
    onselect?: (project: Project) => void;
  }

  let { project, onselect }: Props = $props();

  const select = () => {
    onselect?.(project);
  };
</script>

<div class="card">
  <div class="title">
    <button class="link" onclick={select}>{project.name}</button>
  </div>
</div>

<style>
  .card {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 1rem;
    margin: 1rem;
    max-width: 20rem;
  }

  .title {
    font-size: 1.5rem;
    font-weight: bold;
    color: #ccc;
  }
</style>
