<script lang="ts">
  interface Props {
    entity?: ComparisonEntity | null;
  }

  let { entity }: Props = $props();
</script>

{#if entity && entity.result?.annotations}
  {#each entity.result?.annotations as annotation}
    <div class="annotation">
      {#if annotation.uri}
        <a class="link" href={annotation.uri} target="_blank"
          >{annotation.text}</a
        >
      {:else}
        {annotation.text}
      {/if}
    </div>
  {/each}
{/if}

<style>
  .annotation {
    font-size: 0.8rem;
    color: black;
    background-color: yellow;
    margin: 0.2rem;
    padding: 0.2rem;
  }
</style>
