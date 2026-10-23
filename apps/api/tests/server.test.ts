import { afterEach, describe, expect, it } from "vitest";
import { createContextBridgeServer, type ExtractionDiagnostic } from "../src/server.js";
import { OpenAiCompatibleProvider, ProviderConnectionError, ProviderHttpError, ProviderOutputError, type HostedProvider } from "../src/provider.js";
import { readApiRuntimeConfig, LOOPBACK_HOST } from "../src/config.js";
import { SqliteRateLimiter } from "../src/rate-limit.js";
import { request as nodeRequest, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiToken = "test-local-api-token-with-at-least-32-characters";
const servers: Server[] = [];
const temporaryDirectories: string[] = [];

interface StartOptions {
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxResponseBytes?: number;
  rateLimit?: number;
  rateLimitWindowMs?: number;
  databasePath?: string;
  logger?: Pick<Console, "info" | "warn">;
  onDiagnostic?: Parameters<typeof createContextBridgeServer>[0]["onDiagnostic"];
}

async function start(provider: HostedProvider, options: StartOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "context-bridge-api-"));
  temporaryDirectories.push(directory);
  const limiter = new SqliteRateLimiter({
    databasePath: options.databasePath ?? join(directory, "rate-limit.sqlite"),
    limit: options.rateLimit ?? 30,
    windowMs: options.rateLimitWindowMs ?? 60_000
  });
  const server = createContextBridgeServer({ provider, apiToken, rateLimiter: limiter, ...options });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  return { url: `http://${LOOPBACK_HOST}:${address.port}`, server };
}

async function close(server: Server): Promise<void> {
  const index = servers.indexOf(server);
  if (index >= 0) servers.splice(index, 1);
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function validProviderHandoff(summary = "Provider summary") {
  return {
    schemaVersion: "1.0.0" as const,
    handoffId: "provider-handoff",
    createdAt: "2026-10-20T10:00:00+05:30",
    project: { name: "API test" }, source: { tool: "test provider" },
    task: { objective: "Continue safely", constraints: [], environment: [] }, summary,
    workDone: [], decisions: [], debuggingHistory: [], changedFiles: [], commands: [], tests: [],
    currentState: { status: "unverified" as const, description: "Awaiting review", blockers: [], nextSteps: [] },
    warnings: [], evidence: []
  };
}

function request(url: string, body: unknown, init: RequestInit = {}) {
  return fetch(`${url}/v1/handoffs/extract`, {
    ...init,
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiToken}`, ...init.headers },
    body: JSON.stringify(body)
  });
}

async function requestWithHost(url: string, host: string): Promise<number> {
  const target = new URL(`${url}/v1/handoffs/extract`);
  return new Promise((resolve, reject) => {
    const request = nodeRequest({ hostname: target.hostname, port: target.port, path: target.pathname, method: "POST", headers: { host, authorization: `Bearer ${apiToken}`, "content-type": "application/json" } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
    request.end(JSON.stringify(validRequest()));
  });
}

function validRequest() {
  return { consentToUpload: true, taskObjective: "Continue safely", records: [{ id: "one", source: "test", kind: "note", content: "hello", references: [], metadata: {} }] };
}

describe("Context Bridge API security", () => {
  it("uses a required token and loopback-only runtime configuration", () => {
    expect(readApiRuntimeConfig({ CONTEXT_BRIDGE_API_TOKEN: apiToken }, "C:\\workspace").host).toBe(LOOPBACK_HOST);
    expect(() => readApiRuntimeConfig({})).toThrow("CONTEXT_BRIDGE_API_TOKEN");
    expect(() => readApiRuntimeConfig({ CONTEXT_BRIDGE_API_TOKEN: apiToken, CONTEXT_BRIDGE_HOST: "0.0.0.0" })).toThrow("localhost-only");
  });

  it("keeps the minimal health endpoint unauthenticated and does not enable CORS", async () => {
    const { url } = await start({ extract: async () => validProviderHandoff() });
    const response = await fetch(`${url}/health`, { headers: { origin: "https://untrusted.example" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects missing, malformed, incorrect, and oversized credentials before the provider", async () => {
    let calls = 0;
    const { url } = await start({ extract: async () => { calls += 1; return validProviderHandoff(); } });
    for (const authorization of [undefined, "Basic ignored", "Bearer incorrect-token", `Bearer ${"a".repeat(1_100)}`]) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (authorization) headers.authorization = authorization;
      const response = await fetch(`${url}/v1/handoffs/extract`, { method: "POST", headers, body: JSON.stringify(validRequest()) });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
    }
    expect(calls).toBe(0);
  });

  it("accepts valid credentials and preserves request validation", async () => {
    const { url } = await start({ extract: async () => validProviderHandoff() });
    expect((await request(url, validRequest())).status).toBe(200);
    expect((await request(url, { records: [], taskObjective: "x" })).status).toBe(400);
  });

  it("rejects invalid hosts, content types, malformed JSON, and oversized bodies", async () => {
    let calls = 0;
    const { url } = await start({ extract: async () => { calls += 1; return validProviderHandoff(); } }, { maxBodyBytes: 100 });
    expect(await requestWithHost(url, "attacker.invalid")).toBe(400);
    const invalidType = await fetch(`${url}/v1/handoffs/extract`, { method: "POST", headers: { authorization: `Bearer ${apiToken}`, "content-type": "text/plain" }, body: "not json" });
    expect(invalidType.status).toBe(415);
    const malformed = await fetch(`${url}/v1/handoffs/extract`, { method: "POST", headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" }, body: "{" });
    expect(malformed.status).toBe(400);
    const oversized = await request(url, { ...validRequest(), records: [{ ...validRequest().records[0], content: "x".repeat(500) }] });
    expect(oversized.status).toBe(413);
    expect(calls).toBe(0);
  });

  it("enforces a durable authenticated rate limit with Retry-After", async () => {
    const { url } = await start({ extract: async () => validProviderHandoff() }, { rateLimit: 2, rateLimitWindowMs: 60_000 });
    expect((await request(url, validRequest())).status).toBe(200);
    expect((await request(url, validRequest())).status).toBe(200);
    const limited = await request(url, validRequest());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("resets a durable limiter when its configured window advances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-bridge-api-window-"));
    temporaryDirectories.push(directory);
    let now = 1_000;
    const limiter = new SqliteRateLimiter({ databasePath: join(directory, "rate-limit.sqlite"), limit: 1, windowMs: 1_000, clock: () => now });
    expect(limiter.consume("identity").allowed).toBe(true);
    expect(limiter.consume("identity").allowed).toBe(false);
    now = 2_000;
    expect(limiter.consume("identity").allowed).toBe(true);
    limiter.close();
  });

  it("persists limits across server recreation without storing the raw token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-bridge-api-persist-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "rate-limit.sqlite");
    const first = await start({ extract: async () => validProviderHandoff() }, { databasePath, rateLimit: 1 });
    expect((await request(first.url, validRequest())).status).toBe(200);
    await close(first.server);
    const second = await start({ extract: async () => validProviderHandoff() }, { databasePath, rateLimit: 1 });
    expect((await request(second.url, validRequest())).status).toBe(429);
    expect((await readFile(databasePath)).includes(apiToken)).toBe(false);
  });

  it("does not allow concurrent requests to exceed the configured local limit", async () => {
    const { url } = await start({ extract: async () => validProviderHandoff() }, { rateLimit: 2 });
    const statuses = await Promise.all(Array.from({ length: 6 }, () => request(url, validRequest()).then((response) => response.status)));
    expect(statuses.filter((status) => status === 200)).toHaveLength(2);
    expect(statuses.filter((status) => status === 429)).toHaveLength(4);
  });

  it("reports missing provider credentials and timeouts without exposing provider details", async () => {
    const missing = await start(new OpenAiCompatibleProvider({}));
    expect((await request(missing.url, validRequest())).status).toBe(503);
    const timeout = await start({ extract: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("provider private detail")))) }, { timeoutMs: 1_000 });
    const response = await request(timeout.url, validRequest());
    expect(response.status).toBe(504);
    expect(JSON.stringify(await response.json())).not.toContain("provider private detail");
  });

  it("uses the route deadline for a nonresponsive provider and records a safe timeout stage", async () => {
    const diagnostics: ExtractionDiagnostic[] = [];
    const timeout = await start({
      extract: async ({ signal }) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("provider private detail")));
      })
    }, { timeoutMs: 20, onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });
    const startedAt = Date.now();
    const response = await request(timeout.url, validRequest());
    expect(response.status).toBe(504);
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(diagnostics).toEqual([expect.objectContaining({ stage: "provider_request", category: "route_timeout", elapsedMs: expect.any(Number), deadlineMs: 20, providerProgress: "provider_dispatch" })]);
    expect(JSON.stringify(await response.json())).not.toContain("provider private detail");
  });

  it("allows a slow provider completion within the configured route deadline", async () => {
    const slow = await start({
      extract: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return validProviderHandoff("Slow but valid provider response");
      }
    }, { timeoutMs: 100 });
    expect((await request(slow.url, validRequest())).status).toBe(200);
  });

  it("rejects invalid model output and redacts credential-like provider input and output", async () => {
    const invalid = await start({ extract: async () => ({}) });
    expect((await request(invalid.url, validRequest())).status).toBe(422);
    const invalidEvidence = await start({ extract: async () => ({ ...validProviderHandoff(), decisions: [{ id: "unsupported", decision: "Claim", evidence: [{ evidenceId: "missing", relation: "supports" }] }] }) });
    expect((await request(invalidEvidence.url, validRequest())).status).toBe(422);
    const secret = "not-a-real" + "-credential";
    let prompt = "";
    const redacted = await start({ extract: async ({ prompt: received }) => { prompt = received; return validProviderHandoff(`token=${secret}`); } });
    const response = await request(redacted.url, { ...validRequest(), taskObjective: `Continue token=${secret}`, records: [{ ...validRequest().records[0], content: `password=${secret}` }] });
    expect(response.status).toBe(200);
    expect(prompt).not.toContain(secret);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });

  it("bounds returned handoff artifacts", async () => {
    const { url } = await start({ extract: async () => validProviderHandoff("x".repeat(2_000)) }, { maxResponseBytes: 1_000 });
    expect((await request(url, validRequest())).status).toBe(502);
  });

  it("does not disclose secrets in errors or routine logs", async () => {
    const secret = "not-a-real" + "-credential";
    const warnings: string[] = [];
    const { url } = await start({ extract: async () => { throw new Error(`provider failure ${secret}`); } }, { logger: { info: () => undefined, warn: (message) => warnings.push(message) } });
    const response = await request(url, validRequest());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
    expect(warnings.join("\n")).not.toContain(secret);
  });

  it("distinguishes safe provider HTTP, connection, and malformed-output failures", async () => {
    const warnings: string[] = [];
    const privateKey = "not-a-real-provider-key";
    const http = await start({ extract: async () => { throw new ProviderHttpError(404, `models/gemini-2.5-flash is unavailable; Authorization: Bearer ${privateKey}`); } }, { logger: { info: () => undefined, warn: (message) => warnings.push(message) } });
    const httpResponse = await request(http.url, validRequest());
    expect(httpResponse.status).toBe(502);
    expect(await httpResponse.json()).toEqual({ error: "Hosted extraction failed.", category: "provider_http", providerStatus: 404 });
    expect(warnings.join("\n")).toContain("gemini-2.5-flash");
    expect(warnings.join("\n")).not.toContain(privateKey);

    const connection = await start({ extract: async () => { throw new ProviderConnectionError("socket closed"); } });
    expect(await (await request(connection.url, validRequest())).json()).toEqual({ error: "Hosted extraction failed.", category: "provider_connection" });
    const output = await start({ extract: async () => { throw new ProviderOutputError("malformed JSON"); } });
    expect(await (await request(output.url, validRequest())).json()).toEqual({ error: "Hosted extraction failed.", category: "provider_output" });
  });
});
