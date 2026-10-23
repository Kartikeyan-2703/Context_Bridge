import { describe, expect, it } from "vitest";
import { missingSmokeConfiguration } from "../src/smoke.js";

describe("live Gemini smoke configuration", () => {
  it("reports every missing configuration variable instead of silently skipping the request", () => {
    expect(missingSmokeConfiguration({})).toEqual([
      "CONTEXT_BRIDGE_PROVIDER_API_KEY",
      "CONTEXT_BRIDGE_PROVIDER_ENDPOINT",
      "CONTEXT_BRIDGE_PROVIDER_MODEL",
      "CONTEXT_BRIDGE_API_TOKEN"
    ]);
  });

  it("accepts configured provider and local API values without exposing them", () => {
    expect(missingSmokeConfiguration({
      CONTEXT_BRIDGE_PROVIDER_API_KEY: "test-key",
      CONTEXT_BRIDGE_PROVIDER_ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/openai/",
      CONTEXT_BRIDGE_PROVIDER_MODEL: "gemini-3.8-flash",
      CONTEXT_BRIDGE_API_TOKEN: "test-local-api-token-with-at-least-32-characters"
    })).toEqual([]);
  });
});
