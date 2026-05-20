<script lang="ts">
  import { tick } from "svelte";

  interface Props {
    entity: ComparisonEntity | null;
    entities?: ComparisonEntity[];
    onselect?: (entity: ComparisonEntity | null) => void;
  }

  let { entity = $bindable(), entities = [], onselect }: Props = $props();

  let isOpen = $state(false);
  let dropdownMenu: HTMLElement | undefined = $state();

  const toggleDropdown = async () => {
    isOpen = !isOpen;
    if (isOpen) {
      await tick();
      const selectedElement = dropdownMenu?.querySelector(".selected");
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  };

  const select = (selected: ComparisonEntity | null) => {
    entity = selected;
    isOpen = false;
    onselect?.(selected);
  };

  function clickOutside(node: HTMLElement) {
    const handleClick = (event: MouseEvent) => {
      if (!node.contains(event.target as Node)) {
        isOpen = false;
      }
    };

    document.addEventListener("click", handleClick, true);

    return {
      destroy() {
        document.removeEventListener("click", handleClick, true);
      },
    };
  }
</script>

<div class="dropdown-container" use:clickOutside>
  <button class="dropdown-header" onclick={toggleDropdown}
    >{entity ? entity.set : "None"}</button
  >
  {#if isOpen}
    <div class="dropdown-menu" bind:this={dropdownMenu}>
      <button
        class="dropdown-button"
        class:selected={!entity}
        onclick={() => select(null)}
      >
        <div class="dropdown-item">
          <div class="title">None</div>
        </div>
      </button>
      {#each entities as e}
        <button
          class="dropdown-button"
          class:selected={entity === e}
          onclick={() => select(e)}
        >
          <div class="dropdown-item">
            <div class="title">{e.set}</div>
            {#if e.result?.annotations}
              {#each e.result?.annotations as annotation}
                <div>
                  {annotation.text}
                </div>
              {/each}
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dropdown-container {
    position: relative;
    display: inline-block;
    width: 14rem;
  }

  .dropdown-header {
    width: 100%;
    text-align: left;
    border: 1px solid #555;
    border-radius: 0.25rem;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.25rem 1.75rem 0.25rem 0.4rem;
    background-color: white;
    color: black;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' stroke='black' stroke-width='1.5'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1000;
    max-height: 14rem;
    overflow-y: auto;
    background-color: white;
    border: 1px solid #555;
    border-radius: 0.25rem;
  }

  .dropdown-button {
    width: 100%;
    text-align: left;
    background-color: white;
    color: black;
    border: none;
    padding: 0.3rem 0.5rem;
  }

  .dropdown-button:hover {
    background-color: #e0e0e0;
  }

  .dropdown-button.selected {
    background-color: #a0c4e8;
  }

  .dropdown-item {
    text-align: left;
    color: inherit;
    cursor: pointer;
  }

  .title {
    font-size: 1.1rem;
    font-weight: bold;
  }
</style>
