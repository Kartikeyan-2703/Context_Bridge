import { describe, expect, it } from "vitest";
import {
  safeValidateHandoff,
  validateHandoff
} from "../src/schema.js";
import { sampleHandoff } from "./fixtures.js";

describe("Context handoff schema", () => {
  it("accepts a valid handoff", () => {
    const result = safeValidateHandoff(sampleHandoff);

    expect(result.success).toBe(true);
  });

  it("rejects a missing objective", () => {
    const input = structuredClone(sampleHandoff);
    input.task.objective = "";

    const result = safeValidateHandoff(input);

    expect(result.success).toBe(false);
  });

  it("rejects a reference to missing evidence", () => {
    const input = structuredClone(sampleHandoff);

    input.decisions[0]!.evidence = [
      {
        evidenceId: "evidence-that-does-not-exist",
        relation: "supports"
      }
    ];

    const result = safeValidateHandoff(input);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("does not exist")
        )
      ).toBe(true);
    }
  });

  it("rejects duplicate evidence IDs", () => {
    const input = structuredClone(sampleHandoff);

    input.evidence.push({
      ...input.evidence[0]!
    });

    const result = safeValidateHandoff(input);

    expect(result.success).toBe(false);
  });

  it("rejects a passed test without verified supporting evidence", () => {
    const input = structuredClone(sampleHandoff);

    input.tests[0]!.status = "passed";
    input.tests[0]!.evidence = [
      {
        evidenceId: "ev-source-review",
        relation: "supports"
      }
    ];

    const result = safeValidateHandoff(input);

    expect(result.success).toBe(false);
  });

  it("rejects a successful command without verified output", () => {
    const input = structuredClone(sampleHandoff);

    input.commands[0]!.outputEvidenceIds = ["ev-source-review"];

    const result = safeValidateHandoff(input);

    expect(result.success).toBe(false);
  });

  it("requires test-result evidence for a passed test", () => {
    const input = structuredClone(sampleHandoff);
    input.tests[0]!.status = "passed";
    input.tests[0]!.evidence = [{ evidenceId: "ev-git-status", relation: "supports" }];
    expect(safeValidateHandoff(input).success).toBe(false);
  });

  it("rejects a blocked handoff without blockers", () => {
    const input = structuredClone(sampleHandoff);
    input.currentState.status = "blocked";
    input.currentState.blockers = [];
    expect(safeValidateHandoff(input).success).toBe(false);
  });

  it("returns the parsed handoff from validateHandoff", () => {
    const result = validateHandoff(sampleHandoff);

    expect(result.handoffId).toBe("handoff-demo-001");
    expect(result.schemaVersion).toBe("1.0.0");
  });

  it("rejects unknown top-level fields", () => {
    const input = {
      ...sampleHandoff,
      unexpectedField: "not allowed"
    };

    const result = safeValidateHandoff(input);

    expect(result.success).toBe(false);
  });
});
