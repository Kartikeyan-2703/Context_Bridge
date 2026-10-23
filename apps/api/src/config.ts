import { resolve } from "node:path";
import { validateConfiguredApiToken } from "./auth.js";

export const LOOPBACK_HOST = "127.0.0.1";

export interface ApiRuntimeConfig {
  apiToken: string;
  host: typeof LOOPBACK_HOST;
  port: number;
  maxBodyBytes: number;
  maxResponseBytes: number;
  timeoutMs: number;
  rateLimit: number;
  rateLimitWindowMs: number;
  rateLimitDatabasePath: string;
}

function positiveInteger(value: string | undefined, fallback: number, name: string, minimum: number, maximum: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function readApiRuntimeConfig(environment: NodeJS.ProcessEnv = process.env, workingDirectory = process.cwd()): ApiRuntimeConfig {
  const requestedHost = environment.CONTEXT_BRIDGE_HOST ?? LOOPBACK_HOST;
  if (requestedHost !== LOOPBACK_HOST) {
    throw new Error(`CONTEXT_BRIDGE_HOST must be ${LOOPBACK_HOST} for this localhost-only build.`);
  }

  return {
    apiToken: validateConfiguredApiToken(environment.CONTEXT_BRIDGE_API_TOKEN),
    host: LOOPBACK_HOST,
    port: positiveInteger(environment.CONTEXT_BRIDGE_PORT, 8787, "CONTEXT_BRIDGE_PORT", 1, 65_535),
    maxBodyBytes: positiveInteger(environment.CONTEXT_BRIDGE_MAX_BODY_BYTES, 256_000, "CONTEXT_BRIDGE_MAX_BODY_BYTES", 1_024, 1_000_000),
    maxResponseBytes: positiveInteger(environment.CONTEXT_BRIDGE_MAX_RESPONSE_BYTES, 1_000_000, "CONTEXT_BRIDGE_MAX_RESPONSE_BYTES", 16_384, 4_000_000),
    timeoutMs: positiveInteger(environment.CONTEXT_BRIDGE_TIMEOUT_MS, 30_000, "CONTEXT_BRIDGE_TIMEOUT_MS", 1_000, 120_000),
    rateLimit: positiveInteger(environment.CONTEXT_BRIDGE_RATE_LIMIT, 30, "CONTEXT_BRIDGE_RATE_LIMIT", 1, 1_000),
    rateLimitWindowMs: positiveInteger(environment.CONTEXT_BRIDGE_RATE_LIMIT_WINDOW_MS, 60_000, "CONTEXT_BRIDGE_RATE_LIMIT_WINDOW_MS", 1_000, 86_400_000),
    rateLimitDatabasePath: resolve(workingDirectory, environment.CONTEXT_BRIDGE_RATE_LIMIT_DB_PATH ?? ".context-bridge/api-rate-limit.sqlite")
  };
}
