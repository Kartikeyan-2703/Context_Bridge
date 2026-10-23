import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateHandoffArtifacts, safeValidateHandoff } from "@context-bridge/shared";
import { readApiRuntimeConfig } from "./config.js";
import { OpenAiCompatibleProvider } from "./provider.js";
import { SqliteRateLimiter } from "./rate-limit.js";
import { createContextBridgeServer, type ExtractionDiagnostic } from "./server.js";

const requiredProviderVariables = ["CONTEXT_BRIDGE_PROVIDER_API_KEY", "CONTEXT_BRIDGE_PROVIDER_ENDPOINT", "CONTEXT_BRIDGE_PROVIDER_MODEL"] as const;
const requiredSmokeVariables = [...requiredProviderVariables, "CONTEXT_BRIDGE_API_TOKEN"] as const;

export function missingSmokeConfiguration(environment: NodeJS.ProcessEnv = process.env): string[] {
  return requiredSmokeVariables.filter((name) => !environment[name]);
}

const syntheticRequest = {
  consentToUpload: true,
  taskObjective: "Create a cautious handoff for a fictional parser investigation.",
  records: [{
    id: "smoke-fictional-investigation",
    source: "Context Bridge synthetic smoke fixture",
    kind: "note" as const,
    capturedAt: "2026-10-20T10:00:00+05:30",
    content: "Fictional project: an engineer inspected a parser failure. The cause is not yet verified. Next step: add a focused unit test before changing production code.",
    references: [],
    metadata: { fixture: "synthetic" }
  }]
};

async function listen(server: ReturnType<typeof createContextBridgeServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not obtain smoke-test port.");
  return address.port;
}

async function main(): Promise<void> {
  const missing = missingSmokeConfiguration();
  if (missing.length > 0) {
    console.error(`Live Gemini smoke test cannot run: configure ${missing.join(", ")} and rerun.`);
    process.exitCode = 1;
    return;
  }

  let config;
  try {
    config = readApiRuntimeConfig();
  } catch (error) {
    console.error(`Live Gemini smoke test cannot run: ${error instanceof Error ? error.message : "invalid local configuration"}`);
    process.exitCode = 1;
    return;
  }
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "context-bridge-gemini-smoke-"));
  const limiter = new SqliteRateLimiter({ databasePath: join(temporaryDirectory, "rate-limit.sqlite"), limit: config.rateLimit, windowMs: config.rateLimitWindowMs });
  const diagnostics: ExtractionDiagnostic[] = [];
  const server = createContextBridgeServer({
    provider: new OpenAiCompatibleProvider({ apiKey: process.env.CONTEXT_BRIDGE_PROVIDER_API_KEY, endpoint: process.env.CONTEXT_BRIDGE_PROVIDER_ENDPOINT, model: process.env.CONTEXT_BRIDGE_PROVIDER_MODEL, maxResponseBytes: config.maxResponseBytes }),
    apiToken: config.apiToken,
    rateLimiter: limiter,
    maxBodyBytes: config.maxBodyBytes,
    maxResponseBytes: config.maxResponseBytes,
    timeoutMs: config.timeoutMs,
    logger: { info: () => undefined, warn: () => undefined },
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
  });

  try {
    const port = await listen(server);
    const localRequestStartedAt = Date.now();
    const response = await fetch(`http://${config.host}:${port}/v1/handoffs/extract`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiToken}` },
      body: JSON.stringify(syntheticRequest)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as { category?: unknown; providerStatus?: unknown } | undefined;
      const category = typeof body?.category === "string" ? ` (${body.category})` : "";
      const providerStatus = typeof body?.providerStatus === "number" ? ` upstream HTTP ${body.providerStatus}` : "";
      const diagnostic = diagnostics.at(-1);
      const timing = ` localElapsedMs=${Date.now() - localRequestStartedAt}`;
      const stage = diagnostic ? ` stage=${diagnostic.stage} category=${diagnostic.category} stageElapsedMs=${diagnostic.elapsedMs}${diagnostic.deadlineMs === undefined ? "" : ` deadlineMs=${diagnostic.deadlineMs}`}${diagnostic.providerProgress === undefined ? "" : ` providerProgress=${diagnostic.providerProgress}`}${diagnostic.providerStatus === undefined ? "" : ` providerStatus=${diagnostic.providerStatus}`}${diagnostic.providerDiagnostic === undefined ? "" : ` providerDiagnostic=${diagnostic.providerDiagnostic}`}` : "";
      throw new Error(`Live provider pipeline returned local HTTP ${response.status}${category}${providerStatus}.${timing}${stage}`);
    }
    const body: unknown = await response.json();
    const handoff = (body as { handoff?: unknown }).handoff;
    const valid = safeValidateHandoff(handoff);
    if (!valid.success) throw new Error("Live provider response failed local handoff validation.");
    const artifacts = generateHandoffArtifacts(valid.data);
    if (!artifacts.json || !artifacts.markdown) throw new Error("Live provider response did not generate artifacts.");
    console.info("Live Gemini smoke test passed: one synthetic request returned a validated handoff and local artifacts.");
  } catch (error) {
    console.error(`Live Gemini smoke test failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
