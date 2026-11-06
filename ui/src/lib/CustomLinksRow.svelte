<script lang="ts">
  import CustomLinks from "./CustomLinks.svelte";
  import { resolveCustomLinks, type LinkContext } from "./customLinks";

  interface Props {
    links?: CustomLink[];
    scope: "experiment" | "set";
    context: LinkContext;
  }

  let { links = [], scope, context }: Props = $props();
  let resolved = $derived(resolveCustomLinks(links, scope, context));
</script>

{#if resolved.length}
  <div class="meta-row">
    <span class="meta-label">Links</span>
    <span><CustomLinks {links} {scope} {context} plain /></span>
  </div>
{/if}

<style>
  .meta-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .meta-label {
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #999;
    min-width: 90px;
    flex-shrink: 0;
  }
</style>
