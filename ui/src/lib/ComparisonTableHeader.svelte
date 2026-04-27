<script lang="ts">
  import Annotations from "./Annotations.svelte";
  import SetSelector from "./SetSelector.svelte";
  import CreateAnnotationModal from "./CreateAnnotationModal.svelte";

  interface Props {
    title: string;
    entity?: ComparisonEntity | null;
    entities?: ComparisonEntity[];
    clickable?: boolean;
    index?: number;
    ondrilldown?: (set: string) => void;
    onselect?: (data: { index: number; entity: ComparisonEntity | null }) => void;
    onaddAnnotation?: (data: {
      set: string;
      annotation: Annotation;
      project: string;
      experiment: string;
    }) => void;
  }

  let {
    title,
    entity,
    entities = [],
    clickable = true,
    index = -1,
    ondrilldown,
    onselect,
    onaddAnnotation,
  }: Props = $props();

  let showAnnotationModal = $state(false);

  const drilldown = () => {
    if (entity?.set) ondrilldown?.(entity.set);
  };

  const select = (selectedEntity: ComparisonEntity | null) => {
    onselect?.({ index, entity: selectedEntity });
  };

  const convertToFriendlyTime = (runtime: number | undefined): string => {
    if (!runtime) return "-";
    const hours = Math.floor(runtime / 3600);
    const minutes = Math.floor((runtime % 3600) / 60);
    const seconds = Math.round(runtime % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const openAnnotationModal = () => {
    showAnnotationModal = true;
  };

  const handleAnnotationSubmit = (annotation: Annotation) => {
    showAnnotationModal = false;
    onaddAnnotation?.({
      set: entity!.set!,
      annotation: annotation,
      project: entity!.project,
      experiment: entity!.experiment,
    });
  };

  const handleAnnotationCancel = () => {
    showAnnotationModal = false;
  };
</script>

<div class="title">{title}</div>
<div class="set">
  {#if clickable}
    <button class="link" onclick={drilldown}>set:</button>
  {:else}
    <span>set: {entity?.set ?? "-"}</span>
  {/if}
  {#if entities.length > 0}
    <SetSelector entity={entity ?? null} {entities} onselect={select} />
  {/if}
</div>
<Annotations entity={entity ?? null} />
<div class="runtime-row">
  <span class="runtime">{convertToFriendlyTime(entity?.result?.runtime)}</span>
  {#if entity?.set}
    <button class="link add-annotation-link" onclick={openAnnotationModal}
      >+ annotation</button
    >
  {/if}
</div>

<CreateAnnotationModal
  isOpen={showAnnotationModal}
  setName={entity?.set ?? ""}
  onsubmit={handleAnnotationSubmit}
  oncancel={handleAnnotationCancel}
/>

<style>
  .title {
    font-size: 1.2rem;
    font-weight: bold;
    color: #ccc;
  }

  .set {
    font-size: 1rem;
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.25rem;
  }

  .runtime-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .runtime {
    font-size: 0.6rem;
    color: #888;
  }

  .add-annotation-link {
    font-size: 0.6rem;
    color: #888;
  }

  .add-annotation-link:hover {
    color: #ccc;
  }
</style>
