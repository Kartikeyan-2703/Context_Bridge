import { createContextBridgeServer } from "./server.js";
import { OpenAiCompatibleProvider } from "./provider.js";
import { readApiRuntimeConfig } from "./config.js";
import { SqliteRateLimiter } from "./rate-limit.js";

function main(): void {
  let config;
  try { config = readApiRuntimeConfig(); }
  catch (error) {
    console.error(`Context Bridge API configuration error: ${error instanceof Error ? error.message : "Invalid configuration."}`);
    process.exitCode = 1;
    return;
  }

  const limiter = new SqliteRateLimiter({ databasePath: config.rateLimitDatabasePath, limit: config.rateLimit, windowMs: config.rateLimitWindowMs });
  const server = createContextBridgeServer({
    provider: new OpenAiCompatibleProvider({ apiKey: process.env.CONTEXT_BRIDGE_PROVIDER_API_KEY, endpoint: process.env.CONTEXT_BRIDGE_PROVIDER_ENDPOINT, model: process.env.CONTEXT_BRIDGE_PROVIDER_MODEL, maxResponseBytes: config.maxResponseBytes }),
    apiToken: config.apiToken,
    rateLimiter: limiter,
    maxBodyBytes: config.maxBodyBytes,
    maxResponseBytes: config.maxResponseBytes,
    timeoutMs: config.timeoutMs,
    logger: console
  });
  server.listen(config.port, config.host, () => console.info(`Context Bridge API listening on http://${config.host}:${config.port}`));
}

main();
