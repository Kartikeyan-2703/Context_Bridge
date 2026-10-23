import { generateHandoffArtifacts, normalizeManualTranscript, validateHandoff, type ContextHandoff } from "@context-bridge/shared";

export function createBrowserDraft(content: string, objective: string, sourceUrl?: string): ContextHandoff {
  const createdAt = new Date().toISOString();
  const evidenceId = "captured-conversation";
  return validateHandoff({
    schemaVersion: "1.0.0", handoffId: `browser-${Date.now()}`, createdAt,
    project: { name: "Browser AI conversation" }, source: { tool: "Chrome extension", ...(sourceUrl ? { sessionUri: sourceUrl } : {}) },
    task: { objective, constraints: ["Captured page content may be partial; review against the live conversation."], environment: ["Chrome Manifest V3"] },
    summary: "User-selected browser conversation capture awaiting receiving-agent verification.", workDone: ["Captured user-reviewed visible conversation content locally."], decisions: [], debuggingHistory: [], changedFiles: [], commands: [], tests: [],
    currentState: { status: "unverified", description: "This handoff is derived from browser-visible content and may not include full history.", blockers: [], nextSteps: ["Review the live conversation and repository before acting on this handoff."] },
    warnings: ["No content was uploaded by the extension.", "Browser capture can be incomplete on dynamic pages."],
    evidence: [{ id: evidenceId, kind: "conversation", description: "User-triggered visible conversation capture.", capturedAt: createdAt, source: "browser DOM", content, ...(sourceUrl ? { uri: sourceUrl } : {}), verified: false }]
  });
}

export function generateBrowserArtifacts(content: string, objective: string, sourceUrl?: string) {
  const normalized = normalizeManualTranscript("browser DOM", content);
  if (normalized.length === 0) throw new Error("No visible content was captured.");
  return generateHandoffArtifacts(createBrowserDraft(content, objective, sourceUrl));
}
