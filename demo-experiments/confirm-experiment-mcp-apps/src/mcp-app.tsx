import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PermutationType =
  | "prompt"
  | "model"
  | "search-index"
  | "search-configuration";

type Baseline = {
  promptText?: string;
  model?: string;
  searchIndex?: string;
  queryType?: string;
  topK?: number;
  semanticConfig?: string;
};

type Permutation = {
  agentName: string;
  promptFile?: string;
  promptText?: string;
  model?: string;
  searchIndex?: string;
  queryType?: string;
  topK?: number;
  semanticConfig?: string;
};

type SummaryData = {
  experimentName: string;
  hypothesis: string;
  experimentType: "generation" | "retrieval";
  permutationType: PermutationType;
  baseline: Baseline;
  permutations: Permutation[];
};

/* ------------------------------------------------------------------ */
/*  Diff helpers                                                       */
/* ------------------------------------------------------------------ */

type DiffLine = { type: "added" | "removed" | "unchanged"; text: string };

/**
 * Produce a simple line-level diff between two strings.
 * Uses a basic LCS approach for accuracy on small to medium texts.
 */
function computeDiff(baseText: string, newText: string): DiffLine[] {
  // Normalize line endings so \r\n vs \n differences don't cause false diffs
  const baseLines = baseText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const newLines = newText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Build LCS table
  const m = baseLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        baseLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Back-track to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && baseLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "unchanged", text: baseLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", text: baseLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const DiffView: React.FC<{ baseText: string; newText: string }> = ({
  baseText,
  newText
}) => {
  const lines = computeDiff(baseText, newText);

  // If nothing changed, show a note
  const hasChanges = lines.some((l) => l.type !== "unchanged");
  if (!hasChanges) {
    return (
      <div className="diff-block">
        <span className="diff-line diff-unchanged">
          (identical to baseline)
        </span>
      </div>
    );
  }

  return (
    <div className="diff-block">
      {lines.map((line, idx) => {
        const prefix =
          line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  ";
        const cls =
          line.type === "added"
            ? "diff-added"
            : line.type === "removed"
              ? "diff-removed"
              : "diff-unchanged";
        return (
          <span key={idx} className={`diff-line ${cls}`}>
            {prefix}
            {line.text}
            {"\n"}
          </span>
        );
      })}
    </div>
  );
};

const ChangeTable: React.FC<{
  rows: { label: string; baseline: string; value: string }[];
}> = ({ rows }) => (
  <table className="change-table">
    <thead>
      <tr>
        <th>Parameter</th>
        <th>Baseline</th>
        <th>Value</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <tr key={r.label}>
          <td>{r.label}</td>
          <td>{r.baseline}</td>
          <td className={r.baseline !== r.value ? "changed" : ""}>
            {r.value}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/* ------------------------------------------------------------------ */
/*  Permutation card                                                   */
/* ------------------------------------------------------------------ */

const PermutationCard: React.FC<{
  index: number;
  permutation: Permutation;
  permutationType: PermutationType;
  baseline: Baseline;
  defaultOpen: boolean;
}> = ({ index, permutation, permutationType, baseline, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);

  const badge = (() => {
    switch (permutationType) {
      case "prompt":
        return permutation.promptFile ?? "";
      case "model":
        return permutation.model ?? "";
      case "search-index":
        return permutation.searchIndex ?? "";
      case "search-configuration": {
        const parts: string[] = [];
        if (permutation.queryType) parts.push(permutation.queryType);
        if (permutation.topK != null) parts.push(`topK=${permutation.topK}`);
        return parts.join(", ");
      }
    }
  })();

  return (
    <div className="permutation-card">
      <div
        className="permutation-header"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
      >
        <span className={`collapse-icon ${open ? "open" : ""}`}>▶</span>
        <span>
          {index + 1}. {permutation.agentName}
        </span>
        {badge && <span className="permutation-badge">{badge}</span>}
      </div>

      {open && (
        <div className="permutation-body">
          {permutationType === "prompt" && (
            <DiffView
              baseText={baseline.promptText ?? ""}
              newText={permutation.promptText ?? ""}
            />
          )}

          {permutationType === "model" && (
            <ChangeTable
              rows={[
                {
                  label: "Model deployment",
                  baseline: baseline.model ?? "(none)",
                  value: permutation.model ?? "(none)"
                }
              ]}
            />
          )}

          {permutationType === "search-index" && (
            <ChangeTable
              rows={[
                {
                  label: "Search index",
                  baseline: baseline.searchIndex ?? "(none)",
                  value: permutation.searchIndex ?? "(none)"
                }
              ]}
            />
          )}

          {permutationType === "search-configuration" && (
            <ChangeTable
              rows={[
                {
                  label: "Query type",
                  baseline: baseline.queryType ?? "(none)",
                  value: permutation.queryType ?? "(none)"
                },
                {
                  label: "Top K",
                  baseline:
                    baseline.topK != null ? String(baseline.topK) : "(none)",
                  value:
                    permutation.topK != null
                      ? String(permutation.topK)
                      : "(none)"
                },
                {
                  label: "Semantic config",
                  baseline: baseline.semanticConfig || "(none)",
                  value: permutation.semanticConfig || "(none)"
                }
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main app                                                           */
/* ------------------------------------------------------------------ */

const AppView = () => {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { app, isConnected, error } = useApp({
    appInfo: { name: "confirm-experiment", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = async () => {
        setSubmitted(false);
        setSummary(null);
        try {
          const result: any = await createdApp.callServerTool({
            name: "get-prepared-data",
            arguments: {}
          });
          const text = result?.content?.[0]?.text;
          if (text) {
            setSummary(JSON.parse(text) as SummaryData);
          }
        } catch (err) {
          console.error("Failed to get prepared data:", err);
        }
      };

      createdApp.ontoolresult = () => {};

      createdApp.onhostcontextchanged = (context) => {
        if (context.safeAreaInsets) {
          const { top, right, bottom, left } = context.safeAreaInsets;
          document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
        }
      };

      createdApp.onteardown = async () => {
        return {};
      };
    }
  });

  useHostStyles(app, app?.getHostContext());

  const handleConfirm = async (confirmed: boolean) => {
    if (!app || submitted) return;
    setSubmitted(true);
    try {
      await app.callServerTool({
        name: "submit-confirmation",
        arguments: { confirmed }
      });
    } catch {
      setSubmitted(false);
    }
  };

  if (error) {
    return <div className="status">Error: {error.message}</div>;
  }
  if (!isConnected) {
    return <div className="status">Connecting...</div>;
  }
  if (!summary) {
    return (
      <div className="status">Waiting for experiment summary data...</div>
    );
  }

  const permTypeLabel: Record<PermutationType, string> = {
    prompt: "Prompt",
    model: "Model",
    "search-index": "Search index",
    "search-configuration": "Search configuration"
  };

  const baselineLabel = (() => {
    switch (summary.permutationType) {
      case "prompt":
        return undefined; // shown inline in diff
      case "model":
        return summary.baseline.model;
      case "search-index":
        return summary.baseline.searchIndex;
      case "search-configuration": {
        const parts: string[] = [];
        if (summary.baseline.queryType)
          parts.push(`queryType=${summary.baseline.queryType}`);
        if (summary.baseline.topK != null)
          parts.push(`topK=${summary.baseline.topK}`);
        if (summary.baseline.semanticConfig)
          parts.push(`semanticConfig=${summary.baseline.semanticConfig}`);
        return parts.join(", ") || undefined;
      }
    }
  })();

  return (
    <div className="page">
      <div className="panel">
        <div>
          <h1 className="title">Confirm Experiment</h1>
          <p className="subtitle">
            Review the permutations below and confirm to run the experiment.
          </p>
        </div>

        {/* ---- Metadata ---- */}
        <div className="meta-grid">
          <div className="meta-item">
            <div className="meta-label">Experiment</div>
            <div className="meta-value">{summary.experimentName}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Type</div>
            <div className="meta-value">
              {summary.experimentType === "generation"
                ? "Generation"
                : "Retrieval"}{" "}
              / {permTypeLabel[summary.permutationType]}
            </div>
          </div>
          <div className="meta-item" style={{ gridColumn: "1 / -1" }}>
            <div className="meta-label">Hypothesis</div>
            <div className="meta-value">{summary.hypothesis}</div>
          </div>
        </div>

        {/* ---- Baseline ---- */}
        {baselineLabel && (
          <div className="baseline-section">
            <div className="baseline-label">Baseline</div>
            <div className="baseline-value">{baselineLabel}</div>
          </div>
        )}

        {/* ---- Permutations ---- */}
        <div className="permutation-list">
          {summary.permutations.map((p, i) => (
            <PermutationCard
              key={p.agentName}
              index={i}
              permutation={p}
              permutationType={summary.permutationType}
              baseline={summary.baseline}
              defaultOpen={summary.permutations.length <= 4}
            />
          ))}
        </div>

        {/* ---- Actions ---- */}
        {!submitted && (
          <div className="actions">
            <button
              className="button button-primary"
              onClick={() => handleConfirm(true)}
            >
              Confirm & Run
            </button>
            <button
              className="button button-danger"
              onClick={() => handleConfirm(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                          */
/* ------------------------------------------------------------------ */

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <React.StrictMode>
    <AppView />
  </React.StrictMode>
);
