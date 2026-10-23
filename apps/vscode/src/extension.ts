import * as vscode from "vscode";
import { generateHandoffArtifacts, normalizeManualTranscript, safeValidateHandoff } from "@context-bridge/shared";
import { validationMessage } from "./validation.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

async function selectJson(): Promise<vscode.Uri | undefined> {
  return (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Handoff JSON": ["json"] } }))?.[0];
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand("contextBridge.inspectWorkspace", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return void vscode.window.showWarningMessage("Open a workspace folder before inspecting it.");
    void vscode.window.showInformationMessage(`Context Bridge workspace: ${folder.uri.fsPath}. Inspection is local and does not upload content.`);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("contextBridge.validateHandoff", async () => {
    const uri = await selectJson(); if (!uri) return;
    try { const input: unknown = JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(uri))); const message = validationMessage(input); return void (message.startsWith("Valid") ? vscode.window.showInformationMessage(message) : vscode.window.showErrorMessage(message)); } catch { return void vscode.window.showErrorMessage("Could not read a valid JSON handoff file."); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand("contextBridge.generateHandoff", async () => {
    const uri = await selectJson(); const folder = vscode.workspace.workspaceFolders?.[0]; if (!uri || !folder) return;
    try {
      const input: unknown = JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(uri))); const valid = safeValidateHandoff(input);
      if (!valid.success) return void vscode.window.showErrorMessage(validationMessage(input));
      const artifacts = generateHandoffArtifacts(valid.data); const destination = vscode.Uri.joinPath(folder.uri, ".context-bridge"); await vscode.workspace.fs.createDirectory(destination);
      const files: Array<[string, string]> = [["handoff.json", artifacts.json], ["HANDOFF.md", artifacts.markdown], ["evidence-index.json", artifacts.evidenceIndex]];
      await Promise.all(files.map(([name, text]) => vscode.workspace.fs.writeFile(vscode.Uri.joinPath(destination, name), encoder.encode(text))));
      return void vscode.window.showInformationMessage("Generated local Context Bridge artifacts in .context-bridge.");
    } catch { return void vscode.window.showErrorMessage("Could not generate handoff artifacts."); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand("contextBridge.importSession", async () => {
    const uri = (await vscode.window.showOpenDialog({ canSelectMany: false }))?.[0]; if (!uri) return;
    const events = normalizeManualTranscript(`manual:${uri.fsPath}`, decoder.decode(await vscode.workspace.fs.readFile(uri)));
    void vscode.window.showInformationMessage(`Imported ${events.length} manually selected transcript event. Review it before creating a handoff.`);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("contextBridge.openHandoff", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0]; if (!folder) return;
    return vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, ".context-bridge", "HANDOFF.md"));
  }));
}

export function deactivate(): void {}
