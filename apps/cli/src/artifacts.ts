import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, resolve } from "node:path";
import {
  generateHandoffArtifacts,
  safeValidateHandoff,
  type ContextHandoff,
  type HandoffArtifacts
} from "@context-bridge/shared";

export function formatValidationErrors(input: unknown): string[] {
  const result = safeValidateHandoff(input);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
}

export async function readHandoff(file: string): Promise<ContextHandoff> {
  const parsed: unknown = JSON.parse(await readFile(resolve(file), "utf8"));
  const result = safeValidateHandoff(parsed);
  if (!result.success) throw new Error(formatValidationErrors(parsed).join("\n"));
  return result.data;
}

export async function writeHandoffArtifacts(outputDirectory: string, input: ContextHandoff, overwrite = false): Promise<{ directory: string; files: string[] }> {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  const artifacts: HandoffArtifacts = generateHandoffArtifacts(input);
  const output = new Map<string, string>([
    ["handoff.json", artifacts.json],
    ["HANDOFF.md", artifacts.markdown],
    ["evidence-index.json", artifacts.evidenceIndex]
  ]);
  for (const name of output.keys()) {
    if (basename(name) !== name) throw new Error("Invalid generated artifact name");
    if (!overwrite) {
      try { await access(resolve(directory, name), constants.F_OK); throw new Error(`Refusing to overwrite ${name}; use --overwrite.`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
  await Promise.all([...output].map(([name, content]) => writeFile(resolve(directory, name), content, { encoding: "utf8", flag: overwrite ? "w" : "wx" })));
  return { directory, files: [...output.keys()] };
}
