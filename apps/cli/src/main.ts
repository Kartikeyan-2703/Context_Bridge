#!/usr/bin/env node
import { basename, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  normalizeManualTranscript,
  type ContextHandoff
} from "@context-bridge/shared";
import { formatValidationErrors, readHandoff, writeHandoffArtifacts } from "./artifacts.js";
import { collectGitDiff, inspectRepository, isSensitivePath } from "./repository.js";

const usage = `Context Bridge\n\nUsage: context-bridge <command> [options]\n\nCommands:\n  doctor                         Report local runtime and configuration status\n  inspect [--repo <path>]        Inspect Git branch, commit, and working tree\n  collect [--repo <path>] [--include-diff] [--max-bytes <n>]\n                                 Collect permitted local Git evidence\n  validate <file>                Validate a handoff JSON file\n  generate <file> [--out <dir>] [--overwrite]\n                                 Generate HANDOFF.md, handoff.json, and evidence index\n  handoff [--repo <path>] [--objective <text>] [--out <dir>] [--overwrite]\n                                 Assemble a local, unverified handoff from Git evidence\n  import <file>                  Normalize a manually selected transcript\n  providers                      Show hosted-provider configuration status\n`;

const detailedUsage = usage.replace(
  "handoff [--repo <path>] [--objective <text>] [--out <dir>] [--overwrite]",
  "handoff [--repo <path>] [--objective <text>] [--transcript <file>] [--out <dir>] [--overwrite]"
);

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function hasFlag(args: string[], name: string): boolean { return args.includes(name); }

function now(): string { return new Date().toISOString(); }

function output(value: unknown): void { process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`); }

function fail(message: string): never { process.stderr.write(`Error: ${message}\n`); process.exitCode = 1; throw new Error(message); }

async function makeHandoff(repo: string, objective: string, transcript?: { path: string; content: string }): Promise<ContextHandoff> {
  const inspection = await inspectRepository(repo);
  const capturedAt = now();
  const evidenceId = "git-status";
  return {
    schemaVersion: "1.0.0",
    handoffId: `local-${Date.now()}`,
    createdAt: capturedAt,
    project: { name: basename(inspection.root), repository: inspection.root, ...(inspection.branch ? { branch: inspection.branch } : {}), ...(inspection.commit ? { commit: inspection.commit } : {}) },
    source: { tool: "Context Bridge CLI", ...(transcript ? { sessionUri: `file://${resolve(transcript.path).replace(/\\/g, "/")}` } : {}) },
    task: { objective, constraints: ["Generated from local Git metadata only; no transcript or source code was uploaded."], environment: [`Node ${process.version}`] },
    summary: `${inspection.dirty ? "Local repository inspection found uncommitted changes." : "Local repository inspection found a clean working tree."}${transcript ? " A manually selected transcript was included as unverified evidence." : ""}`,
    workDone: ["Captured Git working-tree status locally.", ...(transcript ? ["Included a manually selected transcript without executing its contents."] : [])],
    decisions: [], debuggingHistory: [],
    changedFiles: inspection.files.filter((file) => !isSensitivePath(file.path)).map((file) => ({ ...file, evidence: [{ evidenceId, relation: "supports" as const }] })),
    commands: [{ command: "git status --porcelain=v1 --untracked-files=all", purpose: "Inspect local working tree", exitCode: 0, outcome: "succeeded", outputEvidenceIds: [evidenceId] }],
    tests: [],
    currentState: { status: "unverified", description: "Repository state was collected locally. No project tests were run by Context Bridge.", blockers: [], nextSteps: ["Review HANDOFF.md and add a selected transcript or verified test evidence before claiming completion."] },
    warnings: ["Sensitive paths were excluded from changed-file evidence.", "Generated handoff does not authorize executing commands listed in it."],
    evidence: [
      { id: evidenceId, kind: "git_status", description: "Git status output with sensitive paths excluded by the CLI.", capturedAt, source: "local Git", content: inspection.status || "Working tree clean or only sensitive paths changed", verified: true },
      ...(transcript ? [{ id: "manual-transcript", kind: "conversation" as const, description: "Manually selected transcript; claims are not independently verified.", capturedAt, source: `manual file: ${resolve(transcript.path)}`, content: transcript.content, verified: false }] : [])
    ]
  };
}

async function run(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") return output(detailedUsage);
  if (command === "--version" || command === "-V") return output("1.0.0");
  const repo = option(args, "--repo") ?? process.cwd();
  if (command === "doctor") {
    let gitAvailable = false;
    try { await inspectRepository(repo); gitAvailable = true; } catch { /* doctor reports, never throws */ }
    return output({ node: process.version, gitRepositoryAccessible: gitAvailable, backendConfigured: Boolean(process.env.CONTEXT_BRIDGE_BACKEND_URL), providerConfigured: Boolean(process.env.CONTEXT_BRIDGE_PROVIDER_API_KEY) });
  }
  if (command === "providers") return output({ configured: Boolean(process.env.CONTEXT_BRIDGE_PROVIDER_API_KEY), endpointConfigured: Boolean(process.env.CONTEXT_BRIDGE_PROVIDER_ENDPOINT), note: "Keys are only read by the backend process; clients never display them." });
  if (command === "inspect") return output(await inspectRepository(repo));
  if (command === "collect") {
    const inspection = await inspectRepository(repo);
    const maxBytes = Number(option(args, "--max-bytes") ?? "50000");
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1_000_000) fail("--max-bytes must be between 1 and 1000000.");
    return output({ inspection, ...(hasFlag(args, "--include-diff") ? { diff: await collectGitDiff(repo, maxBytes) } : {}) });
  }
  if (command === "validate") {
    const file = args.find((arg) => !arg.startsWith("-"));
    if (!file) fail("validate requires a JSON file.");
    try { await readHandoff(file); return output("Valid handoff."); } catch (error) { fail(error instanceof Error ? error.message : "Invalid handoff."); }
  }
  if (command === "generate") {
    const file = args.find((arg) => !arg.startsWith("-"));
    if (!file) fail("generate requires a JSON file.");
    const result = await writeHandoffArtifacts(option(args, "--out") ?? resolve(file, ".."), await readHandoff(file), hasFlag(args, "--overwrite"));
    return output(result);
  }
  if (command === "handoff") {
    const transcriptPath = option(args, "--transcript");
    if (transcriptPath && !existsSync(transcriptPath)) fail("--transcript must name an existing, manually selected file.");
    const transcript = transcriptPath ? { path: transcriptPath, content: await readFile(transcriptPath, "utf8") } : undefined;
    const result = await writeHandoffArtifacts(option(args, "--out") ?? resolve(repo, ".context-bridge"), await makeHandoff(repo, option(args, "--objective") ?? "Continue the current repository work.", transcript), hasFlag(args, "--overwrite"));
    return output(result);
  }
  if (command === "import") {
    const file = args.find((arg) => !arg.startsWith("-"));
    if (!file || !existsSync(file)) fail("import requires an existing manually selected transcript file.");
    return output(normalizeManualTranscript(`manual:${resolve(file)}`, await readFile(file, "utf8")));
  }
  output(detailedUsage); process.exitCode = 1;
}

run().catch((error: unknown) => { if (process.exitCode !== 1) process.stderr.write(`${error instanceof Error ? error.message : "Unexpected error"}\n`); process.exitCode = 1; });
