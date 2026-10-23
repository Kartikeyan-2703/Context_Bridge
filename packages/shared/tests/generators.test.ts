import { describe, expect, it } from "vitest";
import {
  generateHandoffArtifacts,
  generateEvidenceIndex,
  generateHandoffJson,
  generateHandoffMarkdown
} from "../src/generators.js";
import { sampleHandoff } from "./fixtures.js";

describe("Handoff generators", () => {
  it("generates valid JSON", () => {
    const json = generateHandoffJson(sampleHandoff);
    const parsed = JSON.parse(json);

    expect(parsed.handoffId).toBe("handoff-demo-001");
    expect(parsed.project.name).toBe("Demo API");
    expect(parsed.tests[0].status).toBe("not_run");
  });

  it("includes task and current state in Markdown", () => {
    const markdown = generateHandoffMarkdown(sampleHandoff);

    expect(markdown).toContain("# Context Bridge Handoff");
    expect(markdown).toContain("Fix the API startup error");
    expect(markdown).toContain("## Debugging history");
    expect(markdown).toContain("## Current state");
    expect(markdown).toContain("**in_progress**");
  });

  it("preserves failed or unverified work in Markdown", () => {
    const markdown = generateHandoffMarkdown(sampleHandoff);

    expect(markdown).toContain("partially_succeeded");
    expect(markdown).toContain("Tests have not been run yet");
    expect(markdown).toContain("Verified: No");
  });

  it("generates both artifacts from the same handoff", () => {
    const artifacts = generateHandoffArtifacts(sampleHandoff);

    expect(artifacts.json).toContain('"handoffId": "handoff-demo-001"');
    expect(artifacts.markdown).toContain("handoff-demo-001");
    expect(artifacts.evidenceIndex).toContain("ev-git-status");
  });

  it("redacts credential-like values in generated artifacts", () => {
    const input = structuredClone(sampleHandoff);
    input.evidence[0]!.content = "api_key=super-secret-value";
    expect(generateHandoffJson(input)).toContain("[REDACTED]");
    expect(generateEvidenceIndex(input)).toContain("ev-source-review");
  });

  it("redacts sensitive values in all exported text fields while retaining valid evidence links", () => {
    const input = structuredClone(sampleHandoff);
    input.task.objective = "Use token=super-secret-value";
    input.commands[0]!.command = "deploy --password=super-secret-value";
    input.evidence[2]!.id = "token=super-secret-value";
    input.commands[0]!.outputEvidenceIds = ["token=super-secret-value"];
    input.changedFiles[0]!.evidence = [{ evidenceId: "token=super-secret-value", relation: "supports" }];
    const json = generateHandoffJson(input);

    expect(json).not.toContain("super-secret-value");
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).commands[0].outputEvidenceIds[0]).toBe("token=[REDACTED]");
  });

  it("renders untrusted Markdown as literal text", () => {
    const input = structuredClone(sampleHandoff);
    input.summary = "<img src=x onerror=alert(1)>\n# injected heading";
    input.task.objective = "[Click me](https://example.invalid)";
    const markdown = generateHandoffMarkdown(input);

    expect(markdown).not.toContain("<img");
    expect(markdown).not.toContain("[Click me](https://example.invalid)");
    expect(markdown).toContain("&lt;img");
    expect(markdown).toContain("\\[Click me\\]");
  });

  it("refuses to generate artifacts from invalid input", () => {
    const invalidInput = {
      ...sampleHandoff,
      handoffId: ""
    };

    expect(() =>
      generateHandoffArtifacts(invalidInput as never)
    ).toThrow();
  });
});
