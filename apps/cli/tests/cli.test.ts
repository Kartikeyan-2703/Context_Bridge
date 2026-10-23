import { describe, expect, it } from "vitest";
import { formatValidationErrors, writeHandoffArtifacts } from "../src/artifacts.js";
import { collectGitDiff, isSensitivePath, truncateUtf8 } from "../src/repository.js";
import { sampleHandoff } from "../../../packages/shared/tests/fixtures.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(directory: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", directory, ...args]);
}

describe("CLI safety helpers", () => {
  it("formats validation failures", () => expect(formatValidationErrors({}).length).toBeGreaterThan(0));
  it("filters sensitive paths", () => {
    expect(isSensitivePath(".env")).toBe(true);
    expect(isSensitivePath("secrets/production.json")).toBe(true);
    expect(isSensitivePath("src/index.ts")).toBe(false);
  });
  it("does not overwrite generated artifacts by default", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-bridge-"));
    try { await writeHandoffArtifacts(directory, sampleHandoff); await expect(writeHandoffArtifacts(directory, sampleHandoff)).rejects.toThrow("Refusing to overwrite"); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("includes staged changes when collecting a diff", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-bridge-git-"));
    try {
      await git(directory, "init", "--quiet");
      await git(directory, "config", "user.email", "test@example.invalid");
      await git(directory, "config", "user.name", "Context Bridge test");
      await writeFile(join(directory, "tracked.txt"), "first version\n", "utf8");
      await git(directory, "add", "tracked.txt");
      await git(directory, "commit", "--quiet", "-m", "initial");
      await writeFile(join(directory, "tracked.txt"), "staged version\n", "utf8");
      await git(directory, "add", "tracked.txt");

      await expect(collectGitDiff(directory, 10_000)).resolves.toContain("staged version");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("enforces diff limits in UTF-8 bytes without splitting characters", () => {
    expect(truncateUtf8("aé", 2)).toBe("a");
    expect(truncateUtf8("aé", 3)).toBe("aé");
  });
});
