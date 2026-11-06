<script lang="ts">
  import { expandLink, type LinkContext } from "./customLinks";

  interface Props {
    links?: CustomLink[];
    scope: CustomLink["scope"];
    context: LinkContext;
    plain?: boolean;
  }

  let { links = [], scope, context, plain = false }: Props = $props();
  let resolved = $derived(
    links.filter((link) => link.scope === scope)
      .map((link) => ({ name: link.name, url: expandLink(link.url, context) }))
      .filter((link) => link.url !== undefined),
  );
</script>

{#each resolved as link, index}
  {#if plain && index > 0}{", "}{/if}<a class="custom-link" class:plain href={link.url} target="_blank" rel="noopener noreferrer"
    >{plain ? link.name : `(${link.name})`}</a
  >
{/each}

<style>
  .custom-link:not(.plain) {
    color: inherit;
    font-size: 0.85em;
    font-weight: normal;
    margin-left: 0.4rem;
  }

  .custom-link.plain {
    color: inherit;
    text-decoration: underline;
  }
</style>
