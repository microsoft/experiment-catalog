import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";

type CustomModelEntry = {
  name: string;
  confirmed: boolean;
};

const AppView = () => {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedBuiltIn, setSelectedBuiltIn] = useState<Set<string>>(
    new Set()
  );
  const [customModels, setCustomModels] = useState<CustomModelEntry[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [showCustomWarning, setShowCustomWarning] = useState(false);
  const [pendingCustomName, setPendingCustomName] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { app, isConnected, error } = useApp({
    appInfo: { name: "model-selector", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = (_params) => {
        // Reset state when the tool is invoked
        setSelectedBuiltIn(new Set());
        setCustomModels([]);
        setCustomInput("");
        setShowCustomWarning(false);
        setPendingCustomName("");
        setFinished(false);
        setErrorMessage(null);
        setLoading(true);
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

  // Load available models from the server on connect
  useEffect(() => {
    if (!app || !isConnected) return;

    const fetchModels = async () => {
      try {
        const result = await app.callServerTool({
          name: "get-available-models",
          arguments: {}
        });
        const sc = result.structuredContent as any;
        if (sc?.models && Array.isArray(sc.models)) {
          setAvailableModels(sc.models);
        }
      } catch (err) {
        setErrorMessage("Failed to load available models.");
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [app, isConnected]);

  const allSelectedModels = useMemo(() => {
    const builtIn = Array.from(selectedBuiltIn);
    const custom = customModels.filter((c) => c.confirmed).map((c) => c.name);
    return [...builtIn, ...custom];
  }, [selectedBuiltIn, customModels]);

  const toggleBuiltIn = useCallback((model: string) => {
    setSelectedBuiltIn((prev) => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
      } else {
        next.add(model);
      }
      return next;
    });
  }, []);

  const handleAddCustom = useCallback(() => {
    const name = customInput.trim();
    if (!name) return;

    // Check for duplicates
    if (
      availableModels.includes(name) ||
      customModels.some((c) => c.name === name)
    ) {
      setErrorMessage(`"${name}" is already in the list.`);
      return;
    }

    setErrorMessage(null);
    setPendingCustomName(name);
    setShowCustomWarning(true);
  }, [customInput, availableModels, customModels]);

  const handleConfirmCustom = useCallback(() => {
    setCustomModels((prev) => [
      ...prev,
      { name: pendingCustomName, confirmed: true }
    ]);
    setCustomInput("");
    setShowCustomWarning(false);
    setPendingCustomName("");
  }, [pendingCustomName]);

  const handleCancelCustom = useCallback(() => {
    setShowCustomWarning(false);
    setPendingCustomName("");
  }, []);

  const handleRemoveCustom = useCallback((name: string) => {
    setCustomModels((prev) => prev.filter((c) => c.name !== name));
  }, []);

  const handleFinish = async () => {
    if (!app) return;

    if (allSelectedModels.length === 0) {
      setErrorMessage("Please select at least one model.");
      return;
    }

    setErrorMessage(null);
    setFinishing(true);

    try {
      await app.callServerTool({
        name: "submit-models",
        arguments: { models: allSelectedModels }
      });
      setFinished(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to submit."
      );
    } finally {
      setFinishing(false);
    }
  };

  if (error) {
    return <div className="status error">Error: {error.message}</div>;
  }

  if (!isConnected || loading) {
    return <div className="status">Loading models...</div>;
  }

  return (
    <div className="page">
      <div className="panel">
        <div>
          <h1 className="title">Model Selector</h1>
          <p className="subtitle">
            Select one or more deployment models for the experiment permutation.
          </p>
        </div>

        {errorMessage && <div className="error">{errorMessage}</div>}

        {finished ? (
          <div className="finished-panel">
            <div className="success-message">
              Done! {allSelectedModels.length} model(s) selected.
            </div>
            <div className="selection-summary">
              <h3>Selected models:</h3>
              <ul>
                {allSelectedModels.map((m) => (
                  <li key={m}>
                    {m}
                    {customModels.some((c) => c.name === m) && (
                      <span className="badge badge-custom">custom</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <>
            {/* Built-in model checkboxes */}
            <div className="field">
              <label>Available models</label>
              <div className="model-list">
                {availableModels.map((model) => (
                  <div
                    key={model}
                    className={`model-item ${selectedBuiltIn.has(model) ? "selected" : ""}`}
                    onClick={() => toggleBuiltIn(model)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBuiltIn.has(model)}
                      readOnly
                    />
                    <span className="model-name">{model}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom deployment name input */}
            <div className="custom-model-section">
              <label>Custom deployment name</label>
              <div className="custom-model-row">
                <input
                  type="text"
                  placeholder="Enter custom deployment name..."
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustom();
                    }
                  }}
                />
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleAddCustom}
                  disabled={!customInput.trim()}
                >
                  Add
                </button>
              </div>

              {/* Warning dialog for custom models */}
              {showCustomWarning && (
                <div className="warning-message">
                  <strong>Manual deployment required</strong>
                  The custom deployment &quot;{pendingCustomName}&quot; is not a
                  pre-configured model. You must manually deploy this model
                  yourself before running the experiment. Do you want to
                  continue?
                  <div className="warning-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={handleConfirmCustom}
                    >
                      Yes, continue
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={handleCancelCustom}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Show added custom models */}
              {customModels.length > 0 && (
                <div className="model-list">
                  {customModels.map((c) => (
                    <div key={c.name} className="model-item selected">
                      <input type="checkbox" checked readOnly />
                      <span className="model-name">{c.name}</span>
                      <span className="badge badge-custom">custom</span>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ marginLeft: "auto", padding: "4px 10px" }}
                        onClick={() => handleRemoveCustom(c.name)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selection summary */}
            {allSelectedModels.length > 0 && (
              <div className="selection-summary">
                <h3>Selected ({allSelectedModels.length}):</h3>
                <ul>
                  {allSelectedModels.map((m) => (
                    <li key={m}>
                      {m}
                      {customModels.some((c) => c.name === m) && (
                        <span className="badge badge-custom">custom</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="actions">
              <button
                type="button"
                className="button button-finish"
                onClick={handleFinish}
                disabled={finishing || allSelectedModels.length === 0}
              >
                {finishing
                  ? "Submitting..."
                  : `Finish (${allSelectedModels.length} selected)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <React.StrictMode>
    <AppView />
  </React.StrictMode>
);
