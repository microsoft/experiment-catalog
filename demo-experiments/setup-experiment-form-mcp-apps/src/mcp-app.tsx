import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  McpUiToolResultNotification,
  useApp,
  useHostStyles
} from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

type PermutationType =
  | "prompt"
  | "model"
  | "search-index"
  | "search-configuration";

type ExperimentFormData = {
  experimentName: string;
  hypothesis: string;
  experimentType: "retrieval" | "generation";
  permutationType: PermutationType;
  isBaseline: boolean;
  catalogProject?: string;
  catalogAppUri?: string;
  catalogOidcClientId?: string;
};

type ExperimentFormErrors = Partial<
  Record<"experimentName" | "hypothesis" | "experimentType" | "permutationType", string>
>;

const defaultFormData: ExperimentFormData = {
  experimentName: "",
  hypothesis: "",
  experimentType: "generation",
  permutationType: "prompt",
  isBaseline: false,
  catalogProject: undefined,
  catalogAppUri: undefined,
  catalogOidcClientId: undefined
};

/**
 * Cleans an experiment name to a standardized slug format:
 * lowercase, dashes only, no special chars, max 30 chars.
 */
const cleanupExperimentName = (name: string): string => {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  const truncated = cleaned.length > 30 ? cleaned.slice(0, 30) : cleaned;
  return truncated.replace(/-$/, "");
};

const experimentFormSchema = z.object({
  experimentName: z
    .string()
    .trim()
    .min(1, "Experiment name is required.")
    .regex(/^[a-zA-Z0-9-]+$/, "Only letters, numbers, and dashes allowed (no spaces)."),
  hypothesis: z.string().trim().min(1, "Hypothesis is required."),
  experimentType: z.enum(["retrieval", "generation"], {
    message: "Experiment type is required."
  }),
  permutationType: z.enum(["prompt", "model", "search-index", "search-configuration"], {
    message: "Permutation type is required."
  })
});

const validateExperimentForm = (data: ExperimentFormData): ExperimentFormErrors => {
  const result = experimentFormSchema.safeParse({
    experimentName: data.experimentName,
    hypothesis: data.hypothesis,
    experimentType: data.experimentType,
    permutationType: data.permutationType
  });

  if (result.success) {
    return {};
  }

  const errors: ExperimentFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === "experimentName" || field === "hypothesis" || field === "experimentType" || field === "permutationType") {
      errors[field] = issue.message;
    }
  }
  return errors;
};

const normalizeFormData = (data: Partial<ExperimentFormData> | undefined): ExperimentFormData => {
  if (!data) {
    return { ...defaultFormData };
  }

  return {
    experimentName: data.experimentName ?? "",
    hypothesis: data.hypothesis ?? "",
    experimentType: data.experimentType ?? "generation",
    permutationType: data.permutationType ?? "prompt",
    isBaseline: data.isBaseline ?? false,
    catalogProject: data.catalogProject,
    catalogAppUri: data.catalogAppUri,
    catalogOidcClientId: data.catalogOidcClientId
  };
};

const extractStructuredArgs = (
  result: CallToolResult | McpUiToolResultNotification["params"] | undefined
): Partial<ExperimentFormData> | undefined => {
  if (!result) {
    return undefined;
  }
  if ("structuredContent" in result && result.structuredContent) {
    return result.structuredContent as Partial<ExperimentFormData>;
  }
  return undefined;
};

const AppView = () => {
  const [formData, setFormData] = useState<ExperimentFormData>({
    ...defaultFormData
  });
  const [summaryData, setSummaryData] = useState<ExperimentFormData | null>(null);
  const [view, setView] = useState<"form" | "summary">("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState({
    experimentName: false,
    hypothesis: false,
    experimentType: false,
    permutationType: false
  });
  const [catalogProjects, setCatalogProjects] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const { app, isConnected, error } = useApp({
    appInfo: { name: "experiment-runner", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      // Model called open-experiment-form → reset and show the form
      createdApp.ontoolinput = (params) => {
        const args = params.arguments ?? {};
        const raw = typeof args.experimentName === "string" ? args.experimentName : "";
        const experimentName = cleanupExperimentName(raw);
        setFormData({ ...defaultFormData, experimentName });
        setSummaryData(null);
        setView("form");
        setErrorMessage(null);
        setTouched({ experimentName: false, hypothesis: false, experimentType: false, permutationType: false });
        setCatalogProjects([]);
        setCatalogLoading(true);
      };

      createdApp.ontoolresult = () => {
        // Nothing to do — the form is already visible
      };

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

  // Load catalog projects from the server on connect
  useEffect(() => {
    if (!app || !isConnected || !catalogLoading) return;

    const fetchProjects = async () => {
      try {
        const result = await app.callServerTool({
          name: "get-catalog-projects",
          arguments: {}
        });
        const sc = result.structuredContent as any;
        if (sc?.projects && Array.isArray(sc.projects) && sc.projects.length > 0) {
          setCatalogProjects(sc.projects);
          // Store the catalog config values for submission
          const appUri = typeof sc.catalogAppUri === "string" ? sc.catalogAppUri : undefined;
          const clientId = typeof sc.catalogOidcClientId === "string" ? sc.catalogOidcClientId : undefined;
          // If only one project, auto-select it
          if (sc.projects.length === 1) {
            setFormData((prev) => ({
              ...prev,
              catalogProject: sc.projects[0],
              catalogAppUri: appUri,
              catalogOidcClientId: clientId
            }));
          } else {
            setFormData((prev) => ({
              ...prev,
              catalogAppUri: appUri,
              catalogOidcClientId: clientId
            }));
          }
        } else {
          setCatalogProjects([]);
        }
      } catch {
        setCatalogProjects([]);
      } finally {
        setCatalogLoading(false);
      }
    };

    fetchProjects();
  }, [app, isConnected, catalogLoading]);

  const formErrors = useMemo(
    () => validateExperimentForm(formData),
    [formData.experimentName, formData.hypothesis, formData.experimentType, formData.permutationType]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    setTouched({ experimentName: true, hypothesis: true, experimentType: true, permutationType: true });
    const errors = validateExperimentForm(formData);
    if (Object.keys(errors).length > 0) {
      return;
    }

    if (!app) {
      setErrorMessage("App connection is not ready.");
      return;
    }

    const payload: ExperimentFormData = {
      ...formData
    };

    try {
      const result = await app.callServerTool({
        name: "submit-experiment-details",
        arguments: payload
      });

      if (result.isError) {
        const detail = result.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(" ");
        setErrorMessage(detail || "Tool returned an error.");
        return;
      }

      const structured = extractStructuredArgs(result);
      const next = normalizeFormData({ ...payload, ...structured });
      setFormData(next);
      setSummaryData(next);
      setView("summary");
    } catch (toolError) {
      setErrorMessage(
        toolError instanceof Error ? toolError.message : "Tool call failed."
      );
    }
  };

  if (error) {
    return <div className="status">Error: {error.message}</div>;
  }

  if (!isConnected) {
    return <div className="status">Connecting...</div>;
  }

  return (
    <div className="page">
      <div className="panel">
        <div>
          <h1 className="title">Experiment Runner</h1>
          <p className="subtitle">Capture experiment details and review them.</p>
        </div>

        {errorMessage && <div className="error">{errorMessage}</div>}

        {view === "form" && (
          <form onSubmit={handleSubmit} className="field">
            <div className="field">
              <label htmlFor="experimentName">Experiment name</label>
              <input
                id="experimentName"
                type="text"
                placeholder="My-Experiment-Name"
                value={formData.experimentName}
                aria-invalid={touched.experimentName && Boolean(formErrors.experimentName)}
                aria-describedby={
                  touched.experimentName && formErrors.experimentName
                    ? "experimentName-error"
                    : undefined
                }
                className={
                  touched.experimentName && formErrors.experimentName
                    ? "input-error"
                    : undefined
                }
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    experimentName: event.target.value
                  }))
                }
                onBlur={() => {
                  setFormData((prev) => ({
                    ...prev,
                    experimentName: cleanupExperimentName(prev.experimentName)
                  }));
                  setTouched((prev) => ({
                    ...prev,
                    experimentName: true
                  }));
                }}
              />
              {touched.experimentName && formErrors.experimentName && (
                <div id="experimentName-error" className="field-error">
                  {formErrors.experimentName}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="hypothesis">Hypothesis</label>
              <textarea
                id="hypothesis"
                rows={3}
                value={formData.hypothesis}
                aria-invalid={touched.hypothesis && Boolean(formErrors.hypothesis)}
                aria-describedby={
                  touched.hypothesis && formErrors.hypothesis
                    ? "hypothesis-error"
                    : undefined
                }
                className={
                  touched.hypothesis && formErrors.hypothesis
                    ? "input-error"
                    : undefined
                }
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    hypothesis: event.target.value
                  }))
                }
                onBlur={() =>
                  setTouched((prev) => ({
                    ...prev,
                    hypothesis: true
                  }))
                }
              />
              {touched.hypothesis && formErrors.hypothesis && (
                <div id="hypothesis-error" className="field-error">
                  {formErrors.hypothesis}
                </div>
              )}
            </div>

            <div className="field">
              <label>Experiment type</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="experimentType"
                    value="generation"
                    checked={formData.experimentType === "generation"}
                    onChange={() =>
                      setFormData((prev) => ({
                        ...prev,
                        experimentType: "generation",
                        permutationType: "prompt"
                      }))
                    }
                  />
                  Generation
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="experimentType"
                    value="retrieval"
                    checked={formData.experimentType === "retrieval"}
                    onChange={() =>
                      setFormData((prev) => ({
                        ...prev,
                        experimentType: "retrieval",
                        permutationType: "search-index"
                      }))
                    }
                  />
                  Retrieval
                </label>
              </div>
              {touched.experimentType && formErrors.experimentType && (
                <div className="field-error">
                  {formErrors.experimentType}
                </div>
              )}
            </div>

            <div className="field">
              <label>Permutation type</label>
              <div className="radio-group">
                {formData.experimentType === "generation" ? (
                  <>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="permutationType"
                        value="prompt"
                        checked={formData.permutationType === "prompt"}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            permutationType: "prompt"
                          }))
                        }
                      />
                      Prompt
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="permutationType"
                        value="model"
                        checked={formData.permutationType === "model"}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            permutationType: "model"
                          }))
                        }
                      />
                      Model
                    </label>
                  </>
                ) : (
                  <>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="permutationType"
                        value="search-index"
                        checked={formData.permutationType === "search-index"}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            permutationType: "search-index"
                          }))
                        }
                      />
                      Search index
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="permutationType"
                        value="search-configuration"
                        checked={formData.permutationType === "search-configuration"}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            permutationType: "search-configuration"
                          }))
                        }
                      />
                      Search configuration
                    </label>
                  </>
                )}
              </div>
              {touched.permutationType && formErrors.permutationType && (
                <div className="field-error">
                  {formErrors.permutationType}
                </div>
              )}
            </div>

            <div className="checkbox">
              <input
                id="isBaseline"
                type="checkbox"
                checked={formData.isBaseline}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    isBaseline: event.target.checked
                  }))
                }
              />
              <label htmlFor="isBaseline">This is a baseline experiment</label>
            </div>

            {catalogProjects.length > 0 && (
              <div className="field">
                <label htmlFor="catalogProject">Catalog project</label>
                <select
                  id="catalogProject"
                  value={formData.catalogProject ?? ""}
                  disabled={catalogProjects.length === 1}
                  className={catalogProjects.length === 1 ? "select-disabled" : undefined}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      catalogProject: event.target.value || undefined
                    }))
                  }
                >
                  {catalogProjects.length > 1 && (
                    <option value="">Select a project...</option>
                  )}
                  {catalogProjects.map((project) => (
                    <option key={project} value={project}>
                      {project}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="actions">
              <button type="submit" className="button">
                Submit
              </button>
              {summaryData && (
                <button
                  type="button"
                  className="button"
                  onClick={() => setView("summary")}
                >
                  View summary
                </button>
              )}
            </div>
          </form>
        )}

        {view === "summary" && summaryData && (
          <div className="summary">
            <div className="summary-grid">
              <div className="summary-item">
                <div className="summary-label">Experiment</div>
                <div className="summary-value">{summaryData.experimentName}</div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Hypothesis</div>
                <div className="summary-value">{summaryData.hypothesis}</div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Experiment type</div>
                <div className="summary-value">
                  {summaryData.experimentType === "generation"
                    ? "Generation-based"
                    : "Retrieval-based"}
                </div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Permutation type</div>
                <div className="summary-value">
                  {{
                    prompt: "Prompt",
                    model: "Model",
                    "search-index": "Search index",
                    "search-configuration": "Search configuration"
                  }[summaryData.permutationType]}
                </div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Baseline experiment</div>
                <div className="summary-value">
                  {summaryData.isBaseline ? "Yes" : "No"}
                </div>
              </div>
              {summaryData.catalogProject && (
                <div className="summary-item">
                  <div className="summary-label">Catalog project</div>
                  <div className="summary-value">{summaryData.catalogProject}</div>
                </div>
              )}
            </div>
          </div>
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
