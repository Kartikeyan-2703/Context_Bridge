import { describe, expect, it } from "vitest";
import { generateBrowserArtifacts } from "../src/draft.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("browser handoff draft", () => {
  it("generates validated local artifacts", () => {
    const artifacts = generateBrowserArtifacts("Tried a fix; tests are not run.", "Continue debugging");
    expect(artifacts.markdown).toContain("Continue debugging");
    expect(artifacts.json).toContain("browser DOM");
  });
  it("rejects empty captures and includes the current ChatGPT domain in the manifest", async () => {
    expect(() => generateBrowserArtifacts("   ", "Continue debugging")).toThrow("non-whitespace");
    const manifest = JSON.parse(await readFile(resolve(import.meta.dirname, "../public/manifest.json"), "utf8")) as { host_permissions: string[]; content_scripts: Array<{ matches: string[] }> };
    expect(manifest.host_permissions).toContain("https://chatgpt.com/*");
    expect(manifest.content_scripts[0]?.matches).toContain("https://chatgpt.com/*");
  });
});
