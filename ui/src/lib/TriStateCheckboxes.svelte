<script lang="ts">
  import TriStateCheckbox from "./TriStateCheckbox.svelte";

  interface Props {
    options?: string[];
    yes?: Set<string>;
    no?: Set<string>;
  }

  let {
    options = [],
    yes = $bindable(new Set()),
    no = $bindable(new Set()),
  }: Props = $props();

  function change(event: {
    label: string;
    state: "include" | "exclude" | "neither";
  }) {
    const { label, state } = event;
    // Create new Sets to trigger Svelte reactivity properly
    const newYes = new Set(yes);
    const newNo = new Set(no);
    switch (state) {
      case "include":
        newYes.add(label);
        newNo.delete(label);
        break;
      case "exclude":
        newNo.add(label);
        newYes.delete(label);
        break;
      case "neither":
        newYes.delete(label);
        newNo.delete(label);
        break;
    }
    // Assign new Set instances to trigger reactivity
    yes = newYes;
    no = newNo;
  }
</script>

{#each options as option}
  <TriStateCheckbox
    label={option}
    initialState={yes.has(option)
      ? "include"
      : no.has(option)
        ? "exclude"
        : "neither"}
    onchange={change}
  />
{/each}
