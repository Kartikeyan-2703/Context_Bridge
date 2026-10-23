import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { redactSensitiveText } from "@context-bridge/shared";

const execFileAsync = promisify(execFile);
const SENSITIVE_PATH_SEGMENTS = [".env", "credential", "secret", "private", "id_rsa", "node_modules", "dist", "coverage"];

export interface GitInspection {
  root: string;
  branch: string | undefined;
  commit: string | undefined;
  dirty: boolean;
  files: Array<{ path: string; changeType: "added" | "modified" | "deleted" | "renamed" | "unknown" }>;
  status: string;
}

export function isSensitivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return SENSITIVE_PATH_SEGMENTS.some((segment) => normalized.split("/").some((part) => part === segment || part.includes(segment)));
}

async function git(repo: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", repo, ...args], { windowsHide: true, maxBuffer: 1_000_000 });
  return result.stdout;
}

export async function inspectRepository(repositoryPath = process.cwd()): Promise<GitInspection> {
  const requested = resolve(repositoryPath);
  const root = (await git(requested, ["rev-parse", "--show-toplevel"])).trim();
  const [branchResult, commitResult, status] = await Promise.allSettled([
    git(root, ["branch", "--show-current"]),
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  ]);
  const branch = branchResult.status === "fulfilled" ? branchResult.value.trim() || undefined : undefined;
  const commit = commitResult.status === "fulfilled" ? commitResult.value.trim() || undefined : undefined;
  const rawStatus = status.status === "fulfilled" ? status.value : "";
  const statusEntries = rawStatus.split(/\r?\n/).filter(Boolean).map((line) => {
    const code = line.slice(0, 2);
    const rawPath = line.slice(3).split(" -> ").at(-1) ?? line.slice(3);
    const changeType: GitInspection["files"][number]["changeType"] = code.includes("?") || code.includes("A") ? "added"
      : code.includes("D") ? "deleted" : code.includes("R") ? "renamed"
      : code.trim() ? "modified" : "unknown";
    return { line, file: { path: rawPath, changeType }, sensitive: isSensitivePath(rawPath) || isSensitivePath(line.slice(3)) };
  });
  const safeEntries = statusEntries.filter(({ sensitive }) => !sensitive);
  return {
    root,
    branch,
    commit,
    dirty: statusEntries.length > 0,
    files: safeEntries.map(({ file }) => file),
    status: redactSensitiveText(safeEntries.map(({ line }) => line).join("\n"))
  };
}

export async function collectGitDiff(repositoryPath: string, maxBytes: number): Promise<string> {
  const inspection = await inspectRepository(repositoryPath);
  const eligible = inspection.files.map((file) => file.path).filter((path) => !isSensitivePath(path));
  if (eligible.length === 0) return "";
  const output = await git(inspection.root, ["diff", "--no-ext-diff", "HEAD", "--", ...eligible]);
  return truncateUtf8(redactSensitiveText(output), maxBytes);
}

/** Applies the CLI byte limit without splitting a UTF-8 character. */
export function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}
