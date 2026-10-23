import { redactSensitiveText, type ContextHandoff } from "@context-bridge/shared";

export type ProviderProgressStage = "provider_fetch_started" | "provider_response_headers" | "provider_response_body";
export interface ProviderRequest {
  prompt: string;
  signal: AbortSignal;
  onProgress?: ((stage: ProviderProgressStage) => void) | undefined;
  onResponse?: ((status: number) => void) | undefined;
}
export interface HostedProvider { extract(request: ProviderRequest): Promise<unknown>; }

export interface OpenAiCompatibleConfig {
  apiKey?: string | undefined;
  endpoint?: string | undefined;
  model?: string | undefined;
  maxResponseBytes?: number | undefined;
  fetchImplementation?: typeof fetch | undefined;
}

export class ProviderSetupError extends Error {}
export class ProviderHttpError extends Error {
  public constructor(public readonly status: number, public readonly diagnostic: string) {
    super(`Provider request failed with HTTP ${status}`);
  }
}
export class ProviderConnectionError extends Error {}
export class ProviderOutputError extends Error {}

const MAX_ERROR_DIAGNOSTIC_BYTES = 8_192;
const MAX_ERROR_DIAGNOSTIC_CHARACTERS = 512;

/** Accept either an OpenAI-compatible base URL or the complete chat-completions URL. */
export function normalizeChatCompletionsEndpoint(endpoint: string): string {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new ProviderSetupError("Provider endpoint must be an absolute HTTP(S) URL."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ProviderSetupError("Provider endpoint must use HTTP(S).");
  if (url.search || url.hash) throw new ProviderSetupError("Provider endpoint must not include query parameters or fragments.");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path;
  if (path.endsWith("/chat/completions")) return url.toString();
  url.pathname = `${path}/chat/completions`.replace(/\/\/{2,}/g, "/");
  return url.toString();
}

function findProviderMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = findProviderMessage(item);
      if (message !== undefined) return message;
    }
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const payload = value as { error?: unknown; message?: unknown };
  if (typeof payload.message === "string") return payload.message;
  return findProviderMessage(payload.error);
}

export function sanitizeProviderDiagnostic(value: string, apiKey?: string): string {
  let diagnostic = value;
  try {
    const message = findProviderMessage(JSON.parse(value) as unknown);
    if (typeof message === "string") diagnostic = message;
  } catch {
    // Some providers return plain-text error bodies; keep a bounded sanitized excerpt.
  }
  const withoutConfiguredKey = apiKey === undefined ? diagnostic : diagnostic.replaceAll(apiKey, "[REDACTED]");
  return redactSensitiveText(withoutConfiguredKey)
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_ERROR_DIAGNOSTIC_CHARACTERS) || "Provider returned no diagnostic.";
}

async function readResponseText(response: Response, maxBytes: number, errorMessage: string): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) throw new ProviderOutputError(errorMessage);
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new ProviderOutputError(errorMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readErrorDiagnostic(response: Response, apiKey: string): Promise<string> {
  try {
    return sanitizeProviderDiagnostic(
      await readResponseText(response, MAX_ERROR_DIAGNOSTIC_BYTES, "Provider error response exceeded diagnostic limit."),
      apiKey
    );
  } catch {
    return "Provider returned an unreadable error response.";
  }
}

/** Configurable OpenAI-compatible chat-completions adapter; credentials stay server-side. */
export class OpenAiCompatibleProvider implements HostedProvider {
  public constructor(private readonly config: OpenAiCompatibleConfig) {}

  async extract(request: ProviderRequest): Promise<unknown> {
    if (!this.config.apiKey || !this.config.endpoint || !this.config.model) {
      throw new ProviderSetupError("Hosted provider is not configured. Set backend provider endpoint, model, and API key.");
    }
    let response: Response;
    try {
      request.onProgress?.("provider_fetch_started");
      response = await (this.config.fetchImplementation ?? fetch)(normalizeChatCompletionsEndpoint(this.config.endpoint), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ model: this.config.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: request.prompt }] }),
        signal: request.signal
      });
    } catch (error) {
      if (request.signal.aborted) throw error;
      throw new ProviderConnectionError("Provider connection failed.");
    }
    request.onProgress?.("provider_response_headers");
    request.onResponse?.(response.status);
    if (!response.ok) throw new ProviderHttpError(response.status, await readErrorDiagnostic(response, this.config.apiKey));
    const responseText = await readResponseText(response, this.config.maxResponseBytes ?? 1_000_000, "Provider response exceeded configured size limit.");
    request.onProgress?.("provider_response_body");
    let payload: unknown;
    try { payload = JSON.parse(responseText) as unknown; } catch { throw new ProviderOutputError("Provider returned malformed JSON."); }
    const choice = (payload as { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> }).choices?.[0];
    if (choice?.finish_reason === "content_filter") throw new ProviderOutputError("Provider declined the requested output.");
    const content = choice?.message?.content;
    if (typeof content !== "string") throw new ProviderOutputError("Provider response did not contain structured output.");
    try { return JSON.parse(content) as ContextHandoff; } catch { throw new ProviderOutputError("Provider returned malformed JSON."); }
  }
}
