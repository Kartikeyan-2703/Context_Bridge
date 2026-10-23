import { describe, expect, it } from "vitest";
import { OpenAiCompatibleProvider, ProviderConnectionError, ProviderHttpError, normalizeChatCompletionsEndpoint } from "../src/provider.js";

const apiKey = "test-gemini-key";
const model = "gemini-3.8-flash";
const signal = new AbortController().signal;

function provider(fetchImplementation: typeof fetch, endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/", maxResponseBytes?: number) {
  return new OpenAiCompatibleProvider({ apiKey, model, endpoint, fetchImplementation, ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }) });
}

describe("OpenAI-compatible Gemini provider (mocked)", () => {
  it("normalizes Gemini base and full chat-completions endpoints without duplication", () => {
    expect(normalizeChatCompletionsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai/")).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(normalizeChatCompletionsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(normalizeChatCompletionsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions/")).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  });

  it("sends bearer authorization, model selection, and JSON-object mode", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const client = provider(async (input, request) => {
      url = String(input); init = request;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ handoffId: "mock" }) } }] }), { status: 200 });
    });

    await expect(client.extract({ prompt: "synthetic prompt", signal })).resolves.toEqual({ handoffId: "mock" });
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${apiKey}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({ model, temperature: 0, response_format: { type: "json_object" } });
  });

  it("accepts a slow successful provider response while its supplied signal remains active", async () => {
    const progress: string[] = [];
    const client = provider(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ handoffId: "slow-mock" }) } }] }));
    });
    await expect(client.extract({ prompt: "synthetic prompt", signal, onProgress: (stage) => progress.push(stage) })).resolves.toEqual({ handoffId: "slow-mock" });
    expect(progress).toEqual(["provider_fetch_started", "provider_response_headers", "provider_response_body"]);
  });

  it("rejects empty, malformed, refused, oversized, and HTTP-error provider responses", async () => {
    await expect(provider(async () => new Response(JSON.stringify({ choices: [] }))).extract({ prompt: "x", signal })).rejects.toThrow("structured output");
    await expect(provider(async () => new Response("not-json")).extract({ prompt: "x", signal })).rejects.toThrow("malformed JSON");
    await expect(provider(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "content_filter", message: { content: "{}" } }] }))).extract({ prompt: "x", signal })).rejects.toThrow("declined");
    await expect(provider(async () => new Response("x".repeat(100), { headers: { "content-length": "100" } }), "https://example.invalid/v1", 50).extract({ prompt: "x", signal })).rejects.toThrow("size limit");
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      await expect(provider(async () => new Response("{}", { status })).extract({ prompt: "x", signal })).rejects.toMatchObject({ status });
    }
  });

  it("keeps bounded, useful HTTP diagnostics while redacting the configured key", async () => {
    const client = provider(async () => new Response(JSON.stringify({ error: { message: `models/gemini-2.5-flash is unavailable; Authorization: Bearer ${apiKey}` } }), { status: 404 }));
    await expect(client.extract({ prompt: "x", signal })).rejects.toMatchObject<Partial<ProviderHttpError>>({
      status: 404,
      diagnostic: "models/gemini-2.5-flash is unavailable; Authorization: Bearer [REDACTED]"
    });
    const plainTextError = provider(async () => new Response("gateway unavailable", { status: 503 }));
    await expect(plainTextError.extract({ prompt: "x", signal })).rejects.toMatchObject({ diagnostic: "gateway unavailable" });
    const emptyError = provider(async () => new Response(null, { status: 500 }));
    await expect(emptyError.extract({ prompt: "x", signal })).rejects.toMatchObject({ diagnostic: "Provider returned no diagnostic." });
    const malformedJsonError = provider(async () => new Response("{not-json", { status: 429 }));
    await expect(malformedJsonError.extract({ prompt: "x", signal })).rejects.toMatchObject({ diagnostic: "{not-json" });
    const connectionFailure = provider(async () => { throw new TypeError("socket closed"); });
    await expect(connectionFailure.extract({ prompt: "x", signal })).rejects.toBeInstanceOf(ProviderConnectionError);
  });

  it("propagates an aborted request through the supplied AbortSignal", async () => {
    const controller = new AbortController();
    const client = provider((_input, request) => new Promise((_resolve, reject) => request?.signal?.addEventListener("abort", () => reject(new Error("aborted")))) as Promise<Response>);
    const extraction = client.extract({ prompt: "x", signal: controller.signal });
    controller.abort();
    await expect(extraction).rejects.toThrow("aborted");
  });
});
