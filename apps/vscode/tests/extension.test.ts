import { describe, expect, it } from "vitest";
import { validationMessage } from "../src/validation.js";

describe("VS Code validation helper", () => {
  it("reports malformed handoffs", () => expect(validationMessage({}).length).toBeGreaterThan(0));
});
