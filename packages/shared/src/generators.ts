import {
  ContextHandoffSchema,
  type ContextHandoff
} from "./schema.js";
import { redactSensitiveText } from "./normalization.js";

export interface HandoffArtifacts {
  json: string;
  markdown: string;
  evidenceIndex: string;
}

export interface EvidenceIndexEntry {
  id: string;
  kind: string;
  description: string;
  source: string;
  capturedAt: string;
  verified: boolean;
  uri?: string;
}

/**
 * Render untrusted values as literal Markdown text.  Handoffs can contain
 * browser captures and model output, so none of their text should be able to
 * create links, images, HTML, headings, or other Markdown structure.
 */
function formatText(value: string): string {
  return redactSensitiveText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/:/g, "&#58;")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\\`*_{}\[\]()#+\-.!|]/g, "\\$&");
}

function formatCode(value: string): string {
  const text = redactSensitiveText(value).replace(/\r\n|\r|\n/g, "\\n");
  const fence = text.includes("``") ? "```" : text.includes("`") ? "``" : "`";
  return `${fence}${text}${fence}`;
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "- None recorded";
  }

  return items.map((item) => `- ${formatText(item)}`).join("\n");
}

function formatEvidenceLinks(
  links: Array<{
    evidenceId: string;
    relation: string;
  }>
): string {
  if (links.length === 0) {
    return "No evidence linked.";
  }

  return links
    .map((link) => `${formatCode(link.evidenceId)} (${link.relation})`)
    .join(", ");
}

function formatOptional(value?: string): string {
  return value?.trim() ? formatText(value) : "Not recorded";
}

function sanitizeHandoff(input: ContextHandoff): ContextHandoff {
  const evidenceIds = new Map<string, string>();
  const usedEvidenceIds = new Set<string>();
  for (const evidence of input.evidence) {
    const base = redactSensitiveText(evidence.id);
    let redacted = base;
    let suffix = 2;
    while (usedEvidenceIds.has(redacted)) redacted = `${base}-${suffix++}`;
    usedEvidenceIds.add(redacted);
    evidenceIds.set(evidence.id, redacted);
  }
  const evidenceId = (id: string) => evidenceIds.get(id) ?? redactSensitiveText(id);
  const evidenceLinks = (links: ContextHandoff["decisions"][number]["evidence"]) => links.map((link) => ({ ...link, evidenceId: evidenceId(link.evidenceId) }));

  return ContextHandoffSchema.parse({
    ...input,
    handoffId: redactSensitiveText(input.handoffId),
    project: {
      ...input.project,
      name: redactSensitiveText(input.project.name),
      ...(input.project.repository === undefined ? {} : { repository: redactSensitiveText(input.project.repository) }),
      ...(input.project.branch === undefined ? {} : { branch: redactSensitiveText(input.project.branch) }),
      ...(input.project.commit === undefined ? {} : { commit: redactSensitiveText(input.project.commit) })
    },
    source: {
      ...input.source,
      tool: redactSensitiveText(input.source.tool),
      ...(input.source.sessionId === undefined ? {} : { sessionId: redactSensitiveText(input.source.sessionId) }),
      ...(input.source.sessionUri === undefined ? {} : { sessionUri: redactSensitiveText(input.source.sessionUri) })
    },
    task: {
      ...input.task,
      objective: redactSensitiveText(input.task.objective),
      constraints: input.task.constraints.map(redactSensitiveText),
      environment: input.task.environment.map(redactSensitiveText)
    },
    summary: redactSensitiveText(input.summary),
    workDone: input.workDone.map(redactSensitiveText),
    warnings: input.warnings.map(redactSensitiveText),
    decisions: input.decisions.map((decision) => ({
      ...decision,
      id: redactSensitiveText(decision.id),
      decision: redactSensitiveText(decision.decision),
      ...(decision.rationale === undefined ? {} : { rationale: redactSensitiveText(decision.rationale) }),
      evidence: evidenceLinks(decision.evidence)
    })),
    debuggingHistory: input.debuggingHistory.map((attempt) => ({
      ...attempt,
      id: redactSensitiveText(attempt.id),
      problem: redactSensitiveText(attempt.problem),
      action: redactSensitiveText(attempt.action),
      ...(attempt.result === undefined ? {} : { result: redactSensitiveText(attempt.result) }),
      evidence: evidenceLinks(attempt.evidence)
    })),
    changedFiles: input.changedFiles.map((file) => ({
      ...file,
      path: redactSensitiveText(file.path),
      ...(file.summary === undefined ? {} : { summary: redactSensitiveText(file.summary) }),
      evidence: evidenceLinks(file.evidence)
    })),
    commands: input.commands.map((command) => ({
      ...command,
      command: redactSensitiveText(command.command),
      ...(command.purpose === undefined ? {} : { purpose: redactSensitiveText(command.purpose) }),
      outputEvidenceIds: command.outputEvidenceIds.map(evidenceId)
    })),
    tests: input.tests.map((test) => ({
      ...test,
      name: redactSensitiveText(test.name),
      ...(test.details === undefined ? {} : { details: redactSensitiveText(test.details) }),
      evidence: evidenceLinks(test.evidence)
    })),
    currentState: {
      ...input.currentState,
      description: redactSensitiveText(input.currentState.description),
      blockers: input.currentState.blockers.map(redactSensitiveText),
      nextSteps: input.currentState.nextSteps.map(redactSensitiveText)
    },
    evidence: input.evidence.map((item) => ({
      ...item,
      id: evidenceId(item.id),
      description: redactSensitiveText(item.description),
      source: redactSensitiveText(item.source),
      ...(item.content === undefined ? {} : { content: redactSensitiveText(item.content) }),
      ...(item.uri === undefined ? {} : { uri: redactSensitiveText(item.uri) })
    }))
  });
}

export function generateEvidenceIndex(input: ContextHandoff): string {
  const handoff = sanitizeHandoff(ContextHandoffSchema.parse(input));
  const index: EvidenceIndexEntry[] = handoff.evidence.map((item) => ({
    id: item.id,
    kind: item.kind,
    description: item.description,
    source: item.source,
    capturedAt: item.capturedAt,
    verified: item.verified,
    ...(item.uri === undefined ? {} : { uri: item.uri })
  }));
  return JSON.stringify(index, null, 2) + "\n";
}

export function generateHandoffMarkdown(
  input: ContextHandoff
): string {
  const handoff = sanitizeHandoff(ContextHandoffSchema.parse(input));

  const decisions = handoff.decisions.length === 0
    ? "- None recorded"
    : handoff.decisions.map((item) =>
        [
          `### ${formatText(item.id)}`,
          formatText(item.decision),
          `Rationale: ${formatOptional(item.rationale)}`,
          `Evidence: ${formatEvidenceLinks(item.evidence)}`
        ].join("\n\n")
      ).join("\n\n");

  const attempts = handoff.debuggingHistory.length === 0
    ? "- None recorded"
    : handoff.debuggingHistory.map((item) =>
        [
          `### ${formatText(item.id)} — ${item.outcome}`,
          `**Problem:** ${formatText(item.problem)}`,
          `**Action:** ${formatText(item.action)}`,
          `**Result:** ${formatOptional(item.result)}`,
          `**Evidence:** ${formatEvidenceLinks(item.evidence)}`
        ].join("\n\n")
      ).join("\n\n");

  const changedFiles = handoff.changedFiles.length === 0
    ? "- None recorded"
    : handoff.changedFiles.map((file) =>
        [
          `- ${formatCode(file.path)} — ${file.changeType}`,
          `  - Summary: ${formatOptional(file.summary)}`,
          `  - Evidence: ${formatEvidenceLinks(file.evidence)}`
        ].join("\n")
      ).join("\n");

  const commands = handoff.commands.length === 0
    ? "- None recorded"
    : handoff.commands.map((command) =>
        [
          `- ${formatCode(command.command)}`,
          `  - Outcome: ${command.outcome}`,
          `  - Exit code: ${command.exitCode ?? "Not recorded"}`,
          `  - Evidence: ${
            command.outputEvidenceIds.length
              ? command.outputEvidenceIds.map(formatCode).join(", ")
              : "None linked"
          }`
        ].join("\n")
      ).join("\n");

  const tests = handoff.tests.length === 0
    ? "- None recorded"
    : handoff.tests.map((test) =>
        [
          `- **${formatText(test.name)}** — ${test.status}`,
          `  - Details: ${formatOptional(test.details)}`,
          `  - Evidence: ${formatEvidenceLinks(test.evidence)}`
        ].join("\n")
      ).join("\n");

  const evidence = handoff.evidence.length === 0
    ? "- No evidence records"
    : handoff.evidence.map((item) =>
        [
          `### ${formatText(item.id)} — ${item.kind}`,
          `- Description: ${item.description}`,
          `- Source: ${item.source}`,
          `- Captured at: ${item.capturedAt}`,
          `- Verified: ${item.verified ? "Yes" : "No"}`,
          `- URI: ${formatOptional(item.uri)}`,
          `- Content preview: ${formatOptional(item.content?.slice(0, 1_000))}`
        ].join("\n")
      ).join("\n\n");

  return [
    "# Context Bridge Handoff",
    "",
    "> Review this handoff and its evidence before changing code or running commands.",
    "",
    "## Handoff metadata",
    `- Handoff ID: ${formatCode(handoff.handoffId)}`,
    `- Schema version: ${handoff.schemaVersion}`,
    `- Created at: ${handoff.createdAt}`,
    `- Source tool: ${formatText(handoff.source.tool)}`,
    `- Source session: ${formatOptional(handoff.source.sessionId)}`,
    `- Session URI: ${formatOptional(handoff.source.sessionUri)}`,
    "",
    "## Project",
    `- Name: ${formatText(handoff.project.name)}`,
    `- Repository: ${formatOptional(handoff.project.repository)}`,
    `- Branch: ${formatOptional(handoff.project.branch)}`,
    `- Commit: ${formatOptional(handoff.project.commit)}`,
    "",
    "## Task",
    formatText(handoff.task.objective),
    "",
    "### Constraints",
    formatList(handoff.task.constraints),
    "",
    "### Environment",
    formatList(handoff.task.environment),
    "",
    "## Summary",
    formatText(handoff.summary),
    "",
    "## Work completed",
    formatList(handoff.workDone),
    "",
    "## Decisions",
    decisions,
    "",
    "## Debugging history",
    attempts,
    "",
    "## Changed files",
    changedFiles,
    "",
    "## Commands",
    commands,
    "",
    "## Tests",
    tests,
    "",
    "## Current state",
    `- Status: **${handoff.currentState.status}**`,
    "",
    formatText(handoff.currentState.description),
    "",
    "### Blockers",
    formatList(handoff.currentState.blockers),
    "",
    "### Next steps",
    formatList(handoff.currentState.nextSteps),
    "",
    "## Warnings",
    formatList(handoff.warnings),
    "",
    "## Evidence index",
    evidence,
    "",
    "## Handoff instructions",
    "- Inspect the current repository before editing.",
    "- Verify evidence against the actual files and command outputs when possible.",
    "- Preserve unsuccessful attempts so they are not repeated blindly.",
    "- Do not assume unverified changes or tests succeeded.",
    "- Ask for clarification when required information is missing.",
    ""
  ].join("\n");
}

export function generateHandoffJson(
  input: ContextHandoff
): string {
  const handoff = sanitizeHandoff(ContextHandoffSchema.parse(input));

  return JSON.stringify(handoff, null, 2) + "\n";
}

export function generateHandoffArtifacts(
  input: ContextHandoff
): HandoffArtifacts {
  const handoff = ContextHandoffSchema.parse(input);

  return {
    json: generateHandoffJson(handoff),
    markdown: generateHandoffMarkdown(handoff),
    evidenceIndex: generateEvidenceIndex(handoff)
  };
}
