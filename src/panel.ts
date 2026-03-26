import * as vscode from "vscode";
import * as path from "path";

type FileTab = { path: string; content: string };

const TS_GLOB = "**/*.{ts,tsx}";
const TS_EXCLUDE = "{**/node_modules/**,**/dist/**,**/.git/**,**/coverage/**,**/.turbo/**,**/build/**,**/out/**,**/*.d.ts}";

export class DiagramPanel {
  static readonly viewType = "actDiagram";
  private static instance: DiagramPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly disposables: vscode.Disposable[] = [];
  private files: Map<string, FileTab> = new Map();
  private root: string;

  static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.ViewColumn.Two;

    if (DiagramPanel.instance) {
      DiagramPanel.instance.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DiagramPanel.viewType,
      "Act Diagram",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist", "webview"),
        ],
      }
    );

    DiagramPanel.instance = new DiagramPanel(panel, context);
  }

  static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    DiagramPanel.instance = new DiagramPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;
    this.root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

    this.panel.webview.html = this.getHtml();
    this.panel.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "media",
      "icon.svg"
    );

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.onMessage(msg),
      null,
      this.disposables
    );

    // Clean up on close
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Watch file changes
    this.setupFileWatcher();

    // Watch diagnostics
    this.setupDiagnostics();

    // Scan is triggered when webview sends "ready"
  }

  private async scanWorkspace() {
    if (!this.root) return;

    const uris = await vscode.workspace.findFiles(TS_GLOB, TS_EXCLUDE);
    const files: FileTab[] = [];

    for (const uri of uris) {
      const rel = path.relative(this.root, uri.fsPath);
      if (rel.includes(".d.ts")) continue;
      try {
        const content = (await vscode.workspace.fs.readFile(uri)).toString();
        const tab: FileTab = { path: rel, content };
        this.files.set(rel, tab);
        files.push(tab);
      } catch {
        // skip unreadable files
      }
    }

    this.postMessage({ type: "files", files });
    this.sendDiagnostics();
  }

  private setupFileWatcher() {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.root, TS_GLOB)
    );

    watcher.onDidChange((uri) => this.onFileChange(uri));
    watcher.onDidCreate((uri) => this.onFileCreate(uri));
    watcher.onDidDelete((uri) => this.onFileDelete(uri));

    this.disposables.push(watcher);

    // Also watch for in-editor changes (unsaved)
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.languageId === "typescript" || e.document.languageId === "typescriptreact") {
          const rel = path.relative(this.root, e.document.uri.fsPath);
          if (rel.startsWith("..") || rel.includes("node_modules")) return;
          const content = e.document.getText();
          this.files.set(rel, { path: rel, content });
          this.postMessage({ type: "fileChanged", path: rel, content });
        }
      },
      null,
      this.disposables
    );
  }

  private async onFileChange(uri: vscode.Uri) {
    const rel = path.relative(this.root, uri.fsPath);
    if (rel.includes(".d.ts")) return;
    try {
      const content = (await vscode.workspace.fs.readFile(uri)).toString();
      this.files.set(rel, { path: rel, content });
      this.postMessage({ type: "fileChanged", path: rel, content });
    } catch {
      // skip
    }
  }

  private async onFileCreate(uri: vscode.Uri) {
    const rel = path.relative(this.root, uri.fsPath);
    if (rel.includes(".d.ts")) return;
    try {
      const content = (await vscode.workspace.fs.readFile(uri)).toString();
      this.files.set(rel, { path: rel, content });
      this.postMessage({ type: "fileAdded", path: rel, content });
    } catch {
      // skip
    }
  }

  private onFileDelete(uri: vscode.Uri) {
    const rel = path.relative(this.root, uri.fsPath);
    this.files.delete(rel);
    this.postMessage({ type: "fileDeleted", path: rel });
  }

  private setupDiagnostics() {
    vscode.languages.onDidChangeDiagnostics(
      () => this.sendDiagnostics(),
      null,
      this.disposables
    );
  }

  private sendDiagnostics() {
    const errors: Record<string, string> = {};

    for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
      const errs = diagnostics.filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Error
      );
      if (errs.length > 0) {
        const rel = path.relative(this.root, uri.fsPath);
        if (rel.startsWith("..") || rel.includes("node_modules")) continue;
        errors[rel] = errs.map((d) => d.message).join("; ");
      }
    }

    this.postMessage({ type: "diagnostics", errors });
  }

  private onMessage(msg: { type: string; file?: string; line?: number; col?: number }) {
    if (msg.type === "ready") {
      this.scanWorkspace();
      return;
    }
    if (msg.type === "navigate" && msg.file && msg.line !== undefined) {
      const absPath = path.join(this.root, msg.file);
      const uri = vscode.Uri.file(absPath);
      const line = Math.max(0, (msg.line ?? 1) - 1);
      const col = Math.max(0, (msg.col ?? 1) - 1);
      const position = new vscode.Position(line, col);
      const selection = new vscode.Selection(position, position);

      vscode.window.showTextDocument(uri, {
        viewColumn: vscode.ViewColumn.One,
        selection,
        preserveFocus: false,
      });
    }
  }

  private postMessage(msg: unknown) {
    this.panel.webview.postMessage(msg);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview");

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distUri, "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distUri, "main.css")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Act Diagram</title>
  <style>
    html, body, #root {
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #0a0a0a;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose() {
    DiagramPanel.instance = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
