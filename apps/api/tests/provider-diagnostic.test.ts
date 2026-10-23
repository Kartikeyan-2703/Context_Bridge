import { describe, expect, it } from "vitest";
import { OpenAiCompatibleProvider } from "../src/provider.js";
import { runProviderDiagnostic } from "../src/provider-diagnostic.js";

const apiKey = "test-provider-secret";
const config = {
  apiKey,
  endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/",
  model: "gemini-3.8-flash"
};

describe("standalone provider diagnostic", () => {
  it("reports an immediate provider HTTP 503 with headers and a redacted diagnostic", async () => {
    const provider = new OpenAiCompatibleProvider({
      ...config,
      fetchImplementation: async () => new Response(JSON.stringify({ error: { message: `high demand; Authorization: Bearer ${apiKey}` } }), { status: 503 })
    });
    await expect(runProviderDiagnostic(provider, 100)).resolves.toEqual(expect.objectContaining({
      outcome: "provider_http",
      responseHeadersArrived: true,
      httpStatus: 503,
      progress: ["provider_fetch_started", "provider_response_headers"],
      providerDiagnostic: "high demand; Authorization: Bearer [REDACTED]"
    }));
  });

  it("cancels a stalled provider request at the diagnostic deadline", async () => {
    let aborted = false;
    const provider = new OpenAiCompatibleProvider({
      ...config,
      fetchImplementation: (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
      }) as Promise<Response>
    });
    const report = await runProviderDiagnostic(provider, 20);
    expect(report).toMatchObject({ outcome: "timeout", responseHeadersArrived: false, progress: ["provider_fetch_started"] });
    expect(aborted).toBe(true);
  });

  it("reports a successful minimal synthetic completion without exposing its content", async () => {
    const provider = new OpenAiCompatibleProvider({
      ...config,
      fetchImplementation: async () => new Response(JSON.stringify({ choices: [{ message: { content: "{\"contextBridgeProviderProbe\":true}" } }] }), { status: 200 })
    });
    await expect(runProviderDiagnostic(provider, 100)).resolves.toEqual(expect.objectContaining({
      outcome: "success",
      responseHeadersArrived: true,
      httpStatus: 200,
      progress: ["provider_fetch_started", "provider_response_headers", "provider_response_body"]
    }));
  });
});
