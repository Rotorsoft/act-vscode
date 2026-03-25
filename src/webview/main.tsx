import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Diagram,
  extractModel,
  navigateToCode,
  validate,
  type FileTab,
} from "@rotorsoft/act-diagram";
import "@rotorsoft/act-diagram/styles.css";
import "./styles.css";

// VS Code webview API
const vscode = acquireVsCodeApi();

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Error boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#f87171" }}>
          <h3>Render Error</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: undefined })}
            style={{
              marginTop: 12,
              padding: "6px 12px",
              background: "#374151",
              color: "#e5e7eb",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [files, setFiles] = useState<FileTab[]>([]);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  // Signal readiness and listen for messages from the extension
  useEffect(() => {
    vscode.postMessage({ type: "ready" });

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case "files":
          setFiles(msg.files);
          break;
        case "fileAdded":
          setFiles((prev) => [
            ...prev.filter((f) => f.path !== msg.path),
            { path: msg.path, content: msg.content },
          ]);
          break;
        case "fileChanged":
          setFiles((prev) =>
            prev.some((f) => f.path === msg.path)
              ? prev.map((f) =>
                  f.path === msg.path ? { ...f, content: msg.content } : f
                )
              : [...prev, { path: msg.path, content: msg.content }]
          );
          break;
        case "fileDeleted":
          setFiles((prev) => prev.filter((f) => f.path !== msg.path));
          break;
        case "diagnostics":
          setFileErrors(msg.errors ?? {});
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Extract model from files
  const { model, warnings, extractionError } = useMemo(() => {
    if (files.length === 0) {
      return { model: undefined, warnings: [], extractionError: undefined };
    }

    const result = extractModel(files);
    const m = result.model;

    // Overlay LSP diagnostics on slices
    if (m && Object.keys(fileErrors).length > 0) {
      for (const s of m.slices) {
        if (s.error) continue;
        if (s.file && fileErrors[s.file]) {
          s.error = `LSP: ${fileErrors[s.file]}`;
          continue;
        }
        for (const stateName of s.states) {
          const st = m.states.find((x) => x.name === stateName);
          if (st?.file && fileErrors[st.file]) {
            s.error = `LSP: ${fileErrors[st.file]}`;
            break;
          }
        }
      }
    }

    const w = m ? validate(m) : [];
    return { model: m, warnings: w, extractionError: result.error };
  }, [files, fileErrors]);

  // Handle diagram element clicks
  const onClickElement = useCallback(
    (name: string, type?: string, file?: string) => {
      const result = navigateToCode(files, name, type, file);
      if (result) {
        vscode.postMessage({
          type: "navigate",
          file: result.file,
          line: result.line,
          col: result.col,
        });
      }
    },
    [files]
  );

  if (files.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#6b7280",
          fontSize: 14,
        }}
      >
        Scanning workspace for Act definitions...
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {extractionError && (
        <div
          style={{
            padding: "8px 16px",
            background: "#7f1d1d",
            color: "#fca5a5",
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          Extraction error: {extractionError}
        </div>
      )}
      {model ? (
        <ErrorBoundary>
          <Diagram
            model={model}
            warnings={warnings}
            onClickElement={onClickElement}
          />
        </ErrorBoundary>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          No Act definitions found in workspace
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
