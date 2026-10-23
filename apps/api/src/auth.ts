import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AUTHORIZATION_HEADER_LENGTH = 1_024;
const MINIMUM_TOKEN_LENGTH = 32;

export function validateConfiguredApiToken(token: string | undefined): string {
  if (!token) {
    throw new Error("CONTEXT_BRIDGE_API_TOKEN must be configured before the API can start.");
  }
  if (token.length < MINIMUM_TOKEN_LENGTH || token.length > 512 || /\s/.test(token)) {
    throw new Error("CONTEXT_BRIDGE_API_TOKEN must be a non-whitespace token between 32 and 512 characters.");
  }
  return token;
}

/** Returns false for missing, malformed, and unequal-length credentials without exposing either token. */
export function isValidBearerToken(authorization: string | undefined, expectedToken: string): boolean {
  if (!authorization || authorization.length > MAX_AUTHORIZATION_HEADER_LENGTH) return false;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match?.[1]) return false;

  const expected = Buffer.from(expectedToken, "utf8");
  const received = Buffer.from(match[1], "utf8");
  const sameLength = received.length === expected.length;
  const comparable = sameLength ? received : Buffer.alloc(expected.length);
  return timingSafeEqual(expected, comparable) && sameLength;
}

/** A stable, keyed identifier for local rate-limit storage; the raw token is never persisted. */
export function rateLimitIdentity(apiToken: string): string {
  return createHmac("sha256", apiToken).update("context-bridge-rate-limit-v1").digest("hex");
}
