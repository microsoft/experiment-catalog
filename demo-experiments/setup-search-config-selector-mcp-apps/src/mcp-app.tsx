import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";

// ── Types ───────────────────────────────────────────────────────────────────

type QueryType = "simple" | "full" | "semantic";

type SearchConfig = {
  queryType: QueryType;
  topK: number;
  semanticConfig: string | null;
};

type ConfigOptions = {
  searchService: string;
  indexes: string[];
  targetIndex: string;
  semanticConfigs: string[];
  currentDefaults: {
    indexName: string;
    indexVersion: string;
    queryType: string;
    topK: number;
    semanticConfig: string | null;
  };
  queryTypes: QueryType[];
  topKRange: { min: number; max: number; default: number };
  error?: string;
};

// ── App ─────────────────────────────────────────────────────────────────────

const AppView = () => {
  // Data from server
  const [configOptions, setConfigOptions] = useState<ConfigOptions | null>(
    null
  );
  const [semanticConfigs, setSemanticConfigs] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<string>("");

  // Current config being edited
  const [queryType, setQueryType] = useState<QueryType>("simple");
  const [topK, setTopK] = useState<number>(5);
  const [semanticConfig, setSemanticConfig] = useState<string>("");

  // List of added configurations
  const [configs, setConfigs] = useState<SearchConfig[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingSemantic, setLoadingSemantic] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { app, isConnected, error } = useApp({
    appInfo: { name: "search-config-selector", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = (_params) => {
        setConfigs([]);
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

  // Load config options on connect
  useEffect(() => {
    if (!app || !isConnected) return;

    const fetchOptions = async () => {
      try {
        const result = await app.callServerTool({
          name: "get-search-config-options",
          arguments: {}
        });
        const sc = result.structuredContent as ConfigOptions;
        if (sc?.error) {
          setErrorMessage(sc.error);
        } else {
          setConfigOptions(sc);
          if (sc.semanticConfigs) {
            setSemanticConfigs(sc.semanticConfigs);
          }
          if (sc.targetIndex) {
            setSelectedIndex(sc.targetIndex);
          }
          if (sc.currentDefaults) {
            setQueryType(
              (sc.currentDefaults.queryType as QueryType) || "simple"
            );
            setTopK(sc.currentDefaults.topK || 5);
            if (sc.currentDefaults.semanticConfig) {
              setSemanticConfig(sc.currentDefaults.semanticConfig);
            }
          }
        }
      } catch {
        setErrorMessage("Failed to load search configuration options.");
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, [app, isConnected]);

  // Fetch semantic configs when index changes
  const handleIndexChange = useCallback(
    async (indexName: string) => {
      setSelectedIndex(indexName);
      if (!app || !indexName) return;

      setLoadingSemantic(true);
      setSemanticConfigs([]);
      setSemanticConfig("");

      try {
        const result = await app.callServerTool({
          name: "get-semantic-configs",
          arguments: { indexName }
        });
        const sc = result.structuredContent as {
          semanticConfigs: string[];
          error?: string;
        };
        if (sc?.semanticConfigs) {
          setSemanticConfigs(sc.semanticConfigs);
          if (sc.semanticConfigs.length === 1) {
            setSemanticConfig(sc.semanticConfigs[0]);
          }
        }
      } catch {
        setSemanticConfigs([]);
      } finally {
        setLoadingSemantic(false);
      }
    },
    [app]
  );

  // Validation for the current config
  const currentConfigValid = useMemo(() => {
    if (queryType === "semantic" && !semanticConfig) return false;
    if (topK < 1 || topK > 100) return false;
    return true;
  }, [queryType, topK, semanticConfig]);

  // Check for duplicate
  const isDuplicate = useMemo(() => {
    return configs.some(
      (c) =>
        c.queryType === queryType &&
        c.topK === topK &&
        c.semanticConfig === (queryType === "semantic" ? semanticConfig : null)
    );
  }, [configs, queryType, topK, semanticConfig]);

  const handleAddConfig = useCallback(() => {
    if (!currentConfigValid || isDuplicate) return;

    const newConfig: SearchConfig = {
      queryType,
      topK,
      semanticConfig: queryType === "semantic" ? semanticConfig : null
    };

    setConfigs((prev) => [...prev, newConfig]);
  }, [queryType, topK, semanticConfig, currentConfigValid, isDuplicate]);

  const handleRemoveConfig = useCallback((index: number) => {
    setConfigs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFinish = async () => {
    if (!app || configs.length === 0) return;

    setErrorMessage(null);
    setFinishing(true);

    try {
      await app.callServerTool({
        name: "submit-search-configs",
        arguments: { configs }
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
    return <div className="status">Discovering search configuration options...</div>;
  }

  const formatConfig = (c: SearchConfig) => {
    const parts = [`queryType: ${c.queryType}`, `topK: ${c.topK}`];
    if (c.semanticConfig) parts.push(`semanticConfig: ${c.semanticConfig}`);
    return parts.join(", ");
  };

  return (
    <div className="page">
      <div className="panel">
        <div>
          <h1 className="title">Search Configuration</h1>
          <p className="subtitle">
            Define one or more search parameter permutations for the retrieval
            experiment. Each configuration becomes a separate agent permutation.
          </p>
          {configOptions?.searchService && (
            <p className="service-name">
              Search service: <code>{configOptions.searchService}</code>
              {selectedIndex && (
                <>
                  {" "}| Index: <code>{selectedIndex}</code>
                </>
              )}
            </p>
          )}
        </div>

        {errorMessage && <div className="error">{errorMessage}</div>}

        {finished ? (
          <div className="finished-panel">
            <div className="success-message">
              Done! {configs.length} search configuration(s) submitted.
            </div>
            <div className="config-summary">
              <h3>Configurations:</h3>
              <ol>
                {configs.map((c, i) => (
                  <li key={i}>{formatConfig(c)}</li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <>
            {/* Index selector (for fetching semantic configs) */}
            {configOptions?.indexes && configOptions.indexes.length > 1 && (
              <div className="field">
                <label>Target index (for semantic config discovery)</label>
                <select
                  value={selectedIndex}
                  onChange={(e) => handleIndexChange(e.target.value)}
                >
                  {configOptions.indexes.map((idx) => (
                    <option key={idx} value={idx}>
                      {idx}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Config builder */}
            <div className="config-builder">
              <h2 className="section-title">Add Configuration</h2>

              {/* Query Type */}
              <div className="field">
                <label>Query Type</label>
                <div className="radio-group">
                  {(["simple", "full", "semantic"] as QueryType[]).map((qt) => (
                    <label
                      key={qt}
                      className={`radio-option ${queryType === qt ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="queryType"
                        value={qt}
                        checked={queryType === qt}
                        onChange={() => setQueryType(qt)}
                      />
                      <span className="radio-label">{qt}</span>
                      <span className="radio-desc">
                        {qt === "simple" && "Keyword search (default)"}
                        {qt === "full" && "Full Lucene query syntax"}
                        {qt === "semantic" && "AI-powered semantic ranking"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Semantic Config (only shown when query type is semantic) */}
              {queryType === "semantic" && (
                <div className="field">
                  <label>Semantic Configuration</label>
                  {loadingSemantic ? (
                    <div className="loading-inline">
                      Loading semantic configurations...
                    </div>
                  ) : semanticConfigs.length === 0 ? (
                    <div className="warning">
                      No semantic configurations found for index "{selectedIndex}".
                      A semantic configuration must be defined on the index to use semantic search.
                    </div>
                  ) : (
                    <select
                      value={semanticConfig}
                      onChange={(e) => setSemanticConfig(e.target.value)}
                    >
                      <option value="">-- Select a semantic config --</option>
                      {semanticConfigs.map((sc) => (
                        <option key={sc} value={sc}>
                          {sc}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Top-K */}
              <div className="field">
                <label>
                  Top-K results{" "}
                  <span className="field-hint">(1–100)</span>
                </label>
                <div className="topk-row">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                    className="topk-slider"
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={topK}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setTopK(Math.min(100, Math.max(1, val)));
                    }}
                    className="topk-input"
                  />
                </div>
              </div>

              {/* Add button */}
              <div className="actions">
                <button
                  type="button"
                  className="button button-add"
                  onClick={handleAddConfig}
                  disabled={!currentConfigValid || isDuplicate}
                >
                  {isDuplicate
                    ? "Duplicate configuration"
                    : "Add Configuration"}
                </button>
              </div>
            </div>

            {/* Added configurations list */}
            {configs.length > 0 && (
              <div className="config-list-section">
                <h2 className="section-title">
                  Configurations ({configs.length})
                </h2>
                <div className="config-list">
                  {configs.map((c, i) => (
                    <div key={i} className="config-item">
                      <div className="config-item-details">
                        <span className="config-num">#{i + 1}</span>
                        <span className="config-detail">
                          <strong>{c.queryType}</strong> · top-{c.topK}
                          {c.semanticConfig && (
                            <> · <code>{c.semanticConfig}</code></>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="button-remove"
                        onClick={() => handleRemoveConfig(i)}
                        title="Remove this configuration"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Finish */}
            <div className="actions">
              <button
                type="button"
                className="button button-finish"
                onClick={handleFinish}
                disabled={finishing || configs.length === 0}
              >
                {finishing
                  ? "Submitting..."
                  : `Finish (${configs.length} configuration${configs.length !== 1 ? "s" : ""})`}
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
