<script lang="ts">
  import { experimentEmojis } from "./experimentDisplay";

  interface Props {
    name: string;
    emoji?: string | null;
    disabled?: boolean;
    onselect: (emoji: string | null) => Promise<boolean>;
  }

  let { name, emoji, disabled = false, onselect }: Props = $props();
  let symbol = $derived(experimentEmojis.find((option) => option.id === emoji)?.symbol);
</script>

<div class="emoji-picker">
  <span aria-hidden="true" class:empty={!symbol}>{symbol ?? "✦"}</span>
  <select
    aria-label={`Emoji for ${name}`}
    title="Choose emoji"
    value={emoji ?? ""}
    {disabled}
    onchange={async (event) => {
      const select = event.currentTarget;
      if (!await onselect(select.value || null)) select.value = emoji ?? "";
    }}
  >
    <option value="">No emoji</option>
    {#each experimentEmojis as option}
      <option value={option.id}>{option.symbol} {option.label}</option>
    {/each}
  </select>
</div>

<style>
  .emoji-picker {
    position: relative;
    flex: none;
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 1.3rem;
  }

  .emoji-picker:hover, .emoji-picker:focus-within {
    border-color: #aaa;
    background: #333;
  }

  .emoji-picker:focus-within {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .emoji-picker .empty {
    opacity: 0.35;
  }

  .emoji-picker::after {
    content: "⌄";
    position: absolute;
    right: 0;
    bottom: -0.15rem;
    font-size: 0.7rem;
    opacity: 0;
    pointer-events: none;
  }

  .emoji-picker:hover::after, .emoji-picker:focus-within::after {
    opacity: 1;
  }

  .emoji-picker select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
</style>
