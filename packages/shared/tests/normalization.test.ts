import { describe, expect, it } from "vitest";
import { normalizeManualTranscript, redactNormalizedEvent } from "../src/normalization.js";

describe("normalization redaction", () => {
  it("redacts metadata whose key identifies it as a credential", () => {
    const event = redactNormalizedEvent({
      id: "record-1",
      source: "manual",
      kind: "note",
      references: [],
      metadata: { apiKey: "plain-secret-value", label: "safe" }
    });

    expect(event.metadata).toEqual({ apiKey: "[REDACTED]", label: "safe" });
  });

  it("rejects empty manual transcripts and validates the generated event", () => {
    expect(() => normalizeManualTranscript("manual", "   ")).toThrow("non-whitespace");
    expect(normalizeManualTranscript("manual", "Useful context")[0]).toMatchObject({
      source: "manual",
      content: "Useful context"
    });
  });
});
