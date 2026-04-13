import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";

const AppView = () => {
  const [availableIndexes, setAvailableIndexes] = useState<string[]>([]);
  const [searchService, setSearchService] = useState<string>("");
  const [selectedIndexes, setSelectedIndexes] = useState<Set<string>>(
    new Set()
  );
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { app, isConnected, error } = useApp({
    appInfo: { name: "search-index-selector", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = (_params) => {
        // Reset state when the tool is invoked
        setSelectedIndexes(new Set());
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

  // Load available indexes from the server on connect
  useEffect(() => {
    if (!app || !isConnected) return;

    const fetchIndexes = async () => {
      try {
        const result = await app.callServerTool({
          name: "get-available-indexes",
          arguments: {}
        });
        const sc = result.structuredContent as any;
        if (sc?.error) {
          setErrorMessage(sc.error);
        } else if (sc?.indexes && Array.isArray(sc.indexes)) {
          setAvailableIndexes(sc.indexes);
          if (sc.searchService) {
            setSearchService(sc.searchService);
          }
        }
      } catch (err) {
        setErrorMessage("Failed to load available search indexes.");
      } finally {
        setLoading(false);
      }
    };

    fetchIndexes();
  }, [app, isConnected]);

  const allSelectedIndexes = useMemo(
    () => Array.from(selectedIndexes),
    [selectedIndexes]
  );

  const toggleIndex = useCallback((index: string) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIndexes(new Set(availableIndexes));
  }, [availableIndexes]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIndexes(new Set());
  }, []);

  const handleFinish = async () => {
    if (!app) return;

    if (allSelectedIndexes.length === 0) {
      setErrorMessage("Please select at least one search index.");
      return;
    }

    setErrorMessage(null);
    setFinishing(true);

    try {
      await app.callServerTool({
        name: "submit-indexes",
        arguments: { indexes: allSelectedIndexes }
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
    return <div className="status">Discovering search indexes...</div>;
  }

  return (
    <div className="page">
      <div className="panel">
        <div>
          <h1 className="title">Search Index Selector</h1>
          <p className="subtitle">
            Select one or more Azure AI Search indexes for the retrieval
            experiment permutation.
          </p>
          {searchService && (
            <p className="service-name">
              Search service: <code>{searchService}</code>
            </p>
          )}
        </div>

        {errorMessage && <div className="error">{errorMessage}</div>}

        {finished ? (
          <div className="finished-panel">
            <div className="success-message">
              Done! {allSelectedIndexes.length} index(es) selected.
            </div>
            <div className="selection-summary">
              <h3>Selected indexes:</h3>
              <ul>
                {allSelectedIndexes.map((idx) => (
                  <li key={idx}>{idx}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <>
            {/* Index checkboxes */}
            <div className="field">
              <div className="label-row">
                <label>Available indexes ({availableIndexes.length})</label>
                <div className="bulk-actions">
                  <button
                    type="button"
                    className="button-link"
                    onClick={handleSelectAll}
                  >
                    Select all
                  </button>
                  <span className="separator">|</span>
                  <button
                    type="button"
                    className="button-link"
                    onClick={handleDeselectAll}
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              {availableIndexes.length === 0 ? (
                <div className="empty-state">
                  No search indexes found. Check that your Azure AI Search
                  service is configured correctly.
                </div>
              ) : (
                <div className="index-list">
                  {availableIndexes.map((index) => (
                    <div
                      key={index}
                      className={`index-item ${selectedIndexes.has(index) ? "selected" : ""}`}
                      onClick={() => toggleIndex(index)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIndexes.has(index)}
                        readOnly
                      />
                      <span className="index-name">{index}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selection summary */}
            {allSelectedIndexes.length > 0 && (
              <div className="selection-summary">
                <h3>Selected ({allSelectedIndexes.length}):</h3>
                <ul>
                  {allSelectedIndexes.map((idx) => (
                    <li key={idx}>{idx}</li>
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
                disabled={finishing || allSelectedIndexes.length === 0}
              >
                {finishing
                  ? "Submitting..."
                  : `Finish (${allSelectedIndexes.length} selected)`}
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
