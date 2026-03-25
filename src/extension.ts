import * as vscode from "vscode";
import { DiagramPanel } from "./panel";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("act.openDiagram", () => {
      DiagramPanel.createOrShow(context);
    })
  );

  // Restore panel if it was open in a previous session
  if (vscode.window.registerWebviewPanelSerializer) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(DiagramPanel.viewType, {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
          DiagramPanel.revive(panel, context);
        },
      })
    );
  }
}

export function deactivate() {}
