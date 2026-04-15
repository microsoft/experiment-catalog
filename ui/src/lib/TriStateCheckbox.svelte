<script lang="ts">
  interface Props {
    label: string;
    initialState?: "include" | "exclude" | "neither";
    onchange?: (detail: {
      label: string;
      state: "include" | "exclude" | "neither";
    }) => void;
  }

  let { label, initialState = "neither", onchange }: Props = $props();

  let state: "include" | "exclude" | "neither" = $state("neither");
  // Generate stable ID once per component instance
  const buttonId = crypto.randomUUID();

  // Sync state when initialState prop changes
  $effect(() => {
    state = initialState;
  });

  function toggle() {
    switch (state) {
      case "neither":
        state = "include";
        break;
      case "include":
        state = "exclude";
        break;
      case "exclude":
        state = "neither";
        break;
    }
    onchange?.({ label, state });
  }
</script>

<nobr>
  <button
    id={buttonId}
    class="checkbox-wrapper {state}"
    onclick={toggle}
    aria-labelledby="label-{buttonId}"
  ></button>
  <label id="label-{buttonId}" for={buttonId}>{label}</label> ;
</nobr>

<style>
  .checkbox-wrapper {
    display: inline-block;
    width: 1.7em;
    height: 1.7em;
    background-color: var(--color-neither);
    border: solid 0.05em white;
    margin-left: 1.2em;
    margin-right: 0.5em;
  }
  .include::before {
    color: white;
    content: "✓";
  }
  .exclude::before {
    color: white;
    content: "✕";
  }
  .neither {
    background-color: transparent;
  }
  button {
    cursor: pointer;
  }
</style>
