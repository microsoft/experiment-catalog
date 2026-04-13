import React, { useCallback, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";

const MAX_PROMPTS = 12;

type SavedPrompt = {
  promptNumber: number;
  fileName: string;
  filePath: string;
};

const AppView = () => {
  const [promptText, setPromptText] = useState("");
  const [baselinePrompt, setBaselinePrompt] = useState("");
  const [experimentDir, setExperimentDir] = useState("");
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { app, isConnected, error } = useApp({
    appInfo: { name: "prompt-editor", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = async () => {
        // The model-visible tool no longer passes the baseline prompt text.
        // Instead we fetch it from the server which reads prompt.txt directly
        // from disk, avoiding any LLM reformatting.
        try {
          const result = await createdApp.callServerTool({
            name: "get-baseline-prompt",
            arguments: {}
          });
          const sc = result.structuredContent as any;
          const baseline =
            typeof sc?.baselinePrompt === "string" ? sc.baselinePrompt : "";
          const expDir =
            typeof sc?.experimentDir === "string" ? sc.experimentDir : "";
          setBaselinePrompt(baseline);
          setPromptText(baseline);
          setExperimentDir(expDir);
        } catch {
          // Fallback: leave empty
        }
        setSavedPrompts([]);
        setFinished(false);
        setErrorMessage(null);
        setSuccessMessage(null);
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

  const wasEdited = useMemo(
    () => promptText !== baselinePrompt,
    [promptText, baselinePrompt]
  );

  const nextPromptNumber = useMemo(() => {
    if (savedPrompts.length === 0) return 1;
    const maxNum = Math.max(...savedPrompts.map((p) => p.promptNumber));
    return Math.min(maxNum + 1, MAX_PROMPTS);
  }, [savedPrompts]);

  const canSaveMore = savedPrompts.length < MAX_PROMPTS;

  const handleReset = useCallback(() => {
    setPromptText(baselinePrompt);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [baselinePrompt]);

  const handleSavePrompt = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!promptText.trim()) {
      setErrorMessage("Prompt text cannot be empty.");
      return;
    }

    if (!canSaveMore) {
      setErrorMessage(`Maximum of ${MAX_PROMPTS} prompts reached.`);
      return;
    }

    if (!app) {
      setErrorMessage("App connection is not ready.");
      return;
    }

    setSaving(true);

    try {
      const result = await app.callServerTool({
        name: "save-prompt",
        arguments: {
          promptText,
          promptNumber: nextPromptNumber,
          wasEdited
        }
      });

      if (result.isError) {
        const detail = result.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(" ");
        setErrorMessage(detail || "Failed to save prompt.");
        return;
      }

      const sc = result.structuredContent as any;
      const newSaved: SavedPrompt = {
        promptNumber: sc?.promptNumber ?? nextPromptNumber,
        fileName: sc?.fileName ?? `prompt_${String(nextPromptNumber).padStart(2, "0")}.md`,
        filePath: sc?.filePath ?? ""
      };

      setSavedPrompts((prev) => {
        const existing = prev.findIndex(
          (p) => p.promptNumber === newSaved.promptNumber
        );
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newSaved;
          return updated;
        }
        return [...prev, newSaved];
      });

      setSuccessMessage(
        `Saved as ${newSaved.fileName} (${savedPrompts.length + 1}/${MAX_PROMPTS})`
      );

      // Reset editor to baseline for next prompt variation
      setPromptText(baselinePrompt);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save prompt."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!app) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setFinishing(true);

    try {
      await app.callServerTool({
        name: "finish-prompts",
        arguments: { action: "finish" }
      });
      setFinished(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to finish."
      );
    } finally {
      setFinishing(false);
    }
  };

  if (error) {
    return <div className="status error">Error: {error.message}</div>;
  }

  if (!isConnected) {
    return <div className="status">Connecting...</div>;
  }

  return (
    <div className="page">
      <div className="panel">
        <div>
          <h1 className="title">Prompt Editor</h1>
          <p className="subtitle">
            Edit the prompt and save variations. You can save up to{" "}
            {MAX_PROMPTS} prompts.
          </p>
          {experimentDir && (
            <p className="subtitle experiment-dir">
              Saving to: <code>{experimentDir}</code>
            </p>
          )}
        </div>

        {errorMessage && <div className="error">{errorMessage}</div>}
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}

        {finished ? (
          <div className="finished-panel">
            <div className="success-message">
              Done! {savedPrompts.length} prompt(s) saved.
            </div>
            <div className="saved-prompts-list">
              <h3>Saved prompt files:</h3>
              <ol>
                {savedPrompts
                  .sort((a, b) => a.promptNumber - b.promptNumber)
                  .map((p) => (
                    <li key={p.promptNumber}>
                      <span className="file-name">{p.fileName}</span>
                      <span className="file-path">{p.filePath}</span>
                    </li>
                  ))}
              </ol>
            </div>
          </div>
        ) : (
          <>
            {/* Saved prompts sidebar */}
            {savedPrompts.length > 0 && (
              <div className="saved-prompts-list">
                <h3>
                  Saved prompts ({savedPrompts.length}/{MAX_PROMPTS})
                </h3>
                <ol>
                  {savedPrompts
                    .sort((a, b) => a.promptNumber - b.promptNumber)
                    .map((p) => (
                      <li key={p.promptNumber}>
                        <span className="file-name">{p.fileName}</span>
                      </li>
                    ))}
                </ol>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSavePrompt();
              }}
              className="field"
            >
              <div className="field">
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <label htmlFor="promptText">
                    Prompt #{nextPromptNumber}
                  </label>
                  {wasEdited ? (
                    <span className="badge badge-edited">edited</span>
                  ) : (
                    <span className="badge">baseline</span>
                  )}
                </div>
                <textarea
                  ref={textareaRef}
                  id="promptText"
                  className="prompt-editor"
                  rows={16}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  disabled={!canSaveMore}
                />
                <div className="char-count">
                  {promptText.length} characters
                </div>
              </div>

              <div className="actions">
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={saving || !canSaveMore}
                >
                  {saving
                    ? "Saving..."
                    : `Save as prompt_${String(nextPromptNumber).padStart(2, "0")}.md`}
                </button>
                {wasEdited && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleReset}
                  >
                    Reset to baseline
                  </button>
                )}
                {savedPrompts.length > 0 && (
                  <button
                    type="button"
                    className="button button-finish"
                    onClick={handleFinish}
                    disabled={finishing}
                  >
                    {finishing
                      ? "Finishing..."
                      : `Finish (${savedPrompts.length} saved)`}
                  </button>
                )}
              </div>

              {!canSaveMore && (
                <div className="limit-message">
                  Maximum of {MAX_PROMPTS} prompts reached. Click Finish to
                  complete.
                </div>
              )}
            </form>
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
