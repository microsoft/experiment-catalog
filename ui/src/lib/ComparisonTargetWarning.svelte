<script lang="ts">
  interface Props {
    currentProject: string;
    targetProject: string;
  }

  let { currentProject, targetProject }: Props = $props();
</script>

{#if targetProject && targetProject !== currentProject}
  <p class="warning" role="alert">
    Cross-project comparison: ground truth, metrics, and metric definitions may differ.
    The selected set uses {currentProject}'s metric definitions; tag filters from
    {currentProject} do not apply to the selected set.
  </p>
{/if}

<style>
  .warning {
    color: #ffd27f;
    border: 1px solid #b78536;
    padding: 0.75rem;
  }
</style>
