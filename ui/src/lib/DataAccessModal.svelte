<script lang="ts">
  import {
    getArtifactManifestUrl,
    getExperimentDownloadUrl,
    getMetricsExportUrl,
  } from "./api";

  interface Props {
    isOpen: boolean;
    projectName: string;
    experimentName: string;
    onclose?: () => void;
  }

  let { isOpen, projectName, experimentName, onclose }: Props = $props();
  let includeInference = $state(true);
  let includeEvaluation = $state(true);
  let modalElement: HTMLDivElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();

  let artifactTypes = $derived(
    [
      includeInference ? "inference" : "",
      includeEvaluation ? "evaluation" : "",
    ]
      .filter(Boolean)
      .join(","),
  );
  let artifactManifestUrl = $derived(
    getArtifactManifestUrl(projectName, experimentName, artifactTypes),
  );
  let artifactManifestFilename = $derived(
    `${experimentName}-${artifactTypes.replace(",", "-")}-artifacts.jsonl`,
  );

  let metricsPython = $derived(`import pandas as pd

metrics = pd.read_csv("${experimentName}-metrics.csv")
print(metrics.head())`);

  let artifactsPython = $derived(`# Selected artifact types: ${artifactTypes}
import json
from pathlib import Path
from urllib.parse import urlparse

from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobClient

credential = DefaultAzureCredential()
seen = set()

with open("${artifactManifestFilename}") as manifest:
    for line in manifest:
        artifact = json.loads(line)
        uri = artifact["uri"]
        if uri in seen:
            continue
        seen.add(uri)

        filename = Path(urlparse(uri).path).name
        destination = (
            Path("artifacts")
            / artifact["type"]
            / artifact["set"]
            / artifact["ref"]
            / filename
        )
        destination.parent.mkdir(parents=True, exist_ok=True)

        blob = BlobClient.from_blob_url(uri, credential=credential)
        with destination.open("wb") as output:
            blob.download_blob(max_concurrency=8).readinto(output)`);

  const close = () => onclose?.();

  const handleKeydown = (event: KeyboardEvent) => {
    if (isOpen && event.key === "Escape") close();
  };

  const handleModalKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !modalElement) return;

    const focusable = Array.from(
      modalElement.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  $effect(() => {
    if (!isOpen) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    queueMicrotask(() => closeButton?.focus());
    return () => previousFocus?.focus();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" onclick={close} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
    <div
      class="modal"
      bind:this={modalElement}
      onclick={(event) => event.stopPropagation()}
      onkeydown={handleModalKeydown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-access-title"
      tabindex="-1"
    >
      <div class="modal-header">
        <div>
          <h3 id="data-access-title">Data and files</h3>
          <p>{projectName} / {experimentName}</p>
        </div>
        <button class="btn" bind:this={closeButton} onclick={close}>close</button>
      </div>

      <div class="data-options">
        <section class="data-option">
          <h4>Complete experiment</h4>
          <p>
            Download the stored experiment JSONL, including metadata, raw
            results, annotations, and references to associated files.
          </p>
          <a
            class="btn"
            href={getExperimentDownloadUrl(projectName, experimentName)}
            download="{experimentName}.jsonl"
          >
            download
          </a>
        </section>

        <section class="data-option">
          <h4>Metrics for analysis</h4>
          <p>
            Export raw per-iteration metrics as CSV. Aggregate statistics and
            annotations are excluded.
          </p>
          <a
            class="btn"
            href={getMetricsExportUrl(projectName, experimentName)}
            download="{experimentName}-metrics.csv"
          >
            export
          </a>
          <details>
            <summary>Python example</summary>
            <pre><code>{metricsPython}</code></pre>
          </details>
        </section>

        <section class="data-option">
          <h4>Inference and evaluation files</h4>
          <p>
            Download a manifest of exact Azure Blob locations, then retrieve
            the files directly with your Azure identity.
          </p>
          <div class="artifact-types">
            <label>
              <input
                id="include-inference-files"
                type="checkbox"
                checked={includeInference}
                onchange={(event) =>
                  (includeInference = event.currentTarget.checked)}
                disabled={includeInference && !includeEvaluation}
              />
              inference files
            </label>
            <label>
              <input
                id="include-evaluation-files"
                type="checkbox"
                checked={includeEvaluation}
                onchange={(event) =>
                  (includeEvaluation = event.currentTarget.checked)}
                disabled={includeEvaluation && !includeInference}
              />
              evaluation files
            </label>
          </div>
          <a
            class="btn"
            href={artifactManifestUrl}
            download={artifactManifestFilename}
          >
            manifest
          </a>
          <details>
            <summary>Python example</summary>
            <pre><code>{artifactsPython}</code></pre>
          </details>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.7);
    z-index: 2000;
  }

  .modal {
    width: min(900px, 96vw);
    max-height: 90vh;
    overflow: auto;
    padding: 1.25rem;
    border: 1px solid #3a3a3a;
    border-radius: 10px;
    background: #262626;
    color: #eee;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .modal-header h3,
  .modal-header p {
    margin: 0;
  }

  .modal-header p {
    margin-top: 0.25rem;
    color: #aaa;
  }

  .data-options {
    display: grid;
    gap: 1rem;
  }

  .data-option {
    padding: 1rem;
    border: 1px solid #444;
    border-radius: 8px;
    background: #202020;
  }

  .data-option h4 {
    margin: 0 0 0.4rem;
  }

  .data-option p {
    margin: 0 0 0.8rem;
    color: #ccc;
    line-height: 1.45;
  }

  .artifact-types {
    display: flex;
    gap: 1.25rem;
    margin-bottom: 0.8rem;
  }

  .artifact-types label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  details {
    margin-top: 0.8rem;
  }

  summary {
    cursor: pointer;
    color: #9ecbff;
  }

  pre {
    overflow-x: auto;
    margin: 0.6rem 0 0;
    padding: 0.8rem;
    border-radius: 6px;
    background: #111;
    color: #ddd;
    font-size: 0.8rem;
    line-height: 1.4;
  }
</style>
