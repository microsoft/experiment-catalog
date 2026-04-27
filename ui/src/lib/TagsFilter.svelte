<script lang="ts">
  import { onMount } from "svelte";
  import TriStateCheckboxes from "./TriStateCheckboxes.svelte";
  import { listTags } from "./api";

  interface Props {
    project: Project;
    querystring?: string;
    onapply?: (querystring: string) => void;
  }

  let { project, querystring = $bindable(), onapply }: Props = $props();

  let tags: string[] = $state([]);
  let yes: Set<string> = $state(new Set());
  let no: Set<string> = $state(new Set());
  let isCollapsed = $state(true);

  // Parse querystring to initialize yes/no sets
  function parseQuerystring() {
    yes = new Set();
    no = new Set();
    if (!querystring) return;

    const params = new URLSearchParams(querystring);
    const includeTags = params.get("include-tags");
    const excludeTags = params.get("exclude-tags");

    if (includeTags) {
      for (const tag of includeTags.split(",")) {
        if (tag) yes.add(tag);
      }
    }
    if (excludeTags) {
      for (const tag of excludeTags.split(",")) {
        if (tag) no.add(tag);
      }
    }
  }

  // Parse on initial load
  parseQuerystring();

  const fetchTags = async () => {
    try {
      tags = await listTags(project.name);
    } catch (error) {
      console.error(error);
    }
  };

  function apply() {
    querystring = [
      yes.size > 0 ? `include-tags=${[...yes].join(",")}` : "",
      no.size > 0 ? `exclude-tags=${[...no].join(",")}` : "",
    ]
      .filter((s) => s)
      .join("&");
    onapply?.(querystring);
  }

  let selectedCount = $derived((yes?.size || 0) + (no?.size || 0));

  onMount(() => {
    fetchTags();
  });
</script>

<div class="checkbox-container">
  {#if tags.length > 10}
    <button class="link" onclick={() => (isCollapsed = !isCollapsed)}>
      tags ({selectedCount}/{tags.length})
    </button>
  {:else}
    <span>tags ({selectedCount}/{tags.length})</span>
  {/if}
  {#if tags.length <= 10 || !isCollapsed}
    <TriStateCheckboxes bind:yes bind:no options={tags} />
    <button class="apply" onclick={apply}>apply</button>
  {/if}
</div>

<style>
  .checkbox-container {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  button.apply {
    margin-left: 0.5rem;
    cursor: pointer;
  }
</style>
