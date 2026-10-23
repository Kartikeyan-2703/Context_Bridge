import { pathToFileURL } from "node:url";
import {
  OpenAiCompatibleProvider,
  ProviderConnectionError,
  ProviderHttpError,
  ProviderOutputError,
  type HostedProvider,
  type ProviderProgressStage,
  sanitizeProviderDiagnostic
} from "./provider.js";

const requiredProviderVariables = ["CONTEXT_BRIDGE_PROVIDER_API_KEY", "CONTEXT_BRIDGE_PROVIDER_ENDPOINT", "CONTEXT_BRIDGE_PROVIDER_MODEL"] as const;
const syntheticProbePrompt = "Return exactly this JSON object and no other text: {\"contextBridgeProviderProbe\":true}.";

export interface ProviderDiagnosticReport {
  outcome: "success" | "provider_http" | "provider_connection" | "provider_output" | "timeout" | "unknown";
  elapsedMs: number;
  responseHeadersArrived: boolean;
  progress: ProviderProgressStage[];
  httpStatus?: number;
  providerDiagnostic?: string;
}

export function missingProviderDiagnosticConfiguration(environment: NodeJS.ProcessEnv = process.env): string[] {
  return requiredProviderVariables.filter((name) => !environment[name]);
}

export function readProviderDiagnosticTimeout(environment: NodeJS.ProcessEnv = process.env): number {
  const value = environment.CONTEXT_BRIDGE_PROVIDER_DIAGNOSTIC_TIMEOUT_MS;
  if (value === undefined || value === "") return 60_000;
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error("CONTEXT_BRIDGE_PROVIDER_DIAGNOSTIC_TIMEOUT_MS must be an integer between 1000 and 120000.");
  }
  return timeoutMs;
}

export async function runProviderDiagnostic(
  provider: HostedProvider,
  timeoutMs: number,
  sanitizeDiagnostic: (value: string) => string = sanitizeProviderDiagnostic
): Promise<ProviderDiagnosticReport> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const progress: ProviderProgressStage[] = [];
  let httpStatus: number | undefined;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = provider.extract({
      prompt: syntheticProbePrompt,
      signal: controller.signal,
      onProgress: (stage) => progress.push(stage),
      onResponse: (status) => { httpStatus = status; }
    });
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("Provider diagnostic timed out."));
      }, timeoutMs);
    });
    await Promise.race([request, deadline]);
    return { outcome: "success", elapsedMs: Date.now() - startedAt, responseHeadersArrived: progress.includes("provider_response_headers"), progress, ...(httpStatus === undefined ? {} : { httpStatus }) };
  } catch (error) {
    const base = { elapsedMs: Date.now() - startedAt, responseHeadersArrived: progress.includes("provider_response_headers"), progress, ...(httpStatus === undefined ? {} : { httpStatus }) };
    if (timedOut) return { outcome: "timeout", ...base };
    if (error instanceof ProviderHttpError) return { outcome: "provider_http", ...base, httpStatus: error.status, providerDiagnostic: sanitizeDiagnostic(error.diagnostic) };
    if (error instanceof ProviderConnectionError) return { outcome: "provider_connection", ...base };
    if (error instanceof ProviderOutputError) return { outcome: "provider_output", ...base };
    return { outcome: "unknown", ...base };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const missing = missingProviderDiagnosticConfiguration();
  if (missing.length > 0) {
    console.error(`Provider diagnostic cannot run: configure ${missing.join(", ")} and rerun.`);
    process.exitCode = 1;
    return;
  }
  let timeoutMs: number;
  try { timeoutMs = readProviderDiagnosticTimeout(); }
  catch (error) {
    console.error(`Provider diagnostic cannot run: ${error instanceof Error ? error.message : "invalid diagnostic timeout"}`);
    process.exitCode = 1;
    return;
  }
  const apiKey = process.env.CONTEXT_BRIDGE_PROVIDER_API_KEY as string;
  const report = await runProviderDiagnostic(
    new OpenAiCompatibleProvider({ apiKey, endpoint: process.env.CONTEXT_BRIDGE_PROVIDER_ENDPOINT, model: process.env.CONTEXT_BRIDGE_PROVIDER_MODEL }),
    timeoutMs,
    (value) => sanitizeProviderDiagnostic(value, apiKey)
  );
  console.info(`Provider diagnostic: ${JSON.stringify(report)}`);
  if (report.outcome !== "success") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
