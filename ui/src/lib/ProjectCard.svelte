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

<button class="card" onclick={select}>
  <div class="title">
    {project.name}
  </div>
</button>

<style>
  .card {
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 1rem;
    margin: 1rem;
    min-width: 12rem;
    background: inherit;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .card:hover {
    background: #444;
    border-color: #666;
    color: #fff;
  }

  .title {
    font-size: 1.5rem;
    font-weight: bold;
    color: #ccc;
  }
</style>
