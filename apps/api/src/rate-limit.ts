import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  consume(identity: string): RateLimitResult;
  close(): void;
}

export interface SqliteRateLimiterOptions {
  databasePath: string;
  limit: number;
  windowMs: number;
  clock?: () => number;
}

/**
 * A single-machine, durable fixed-window limiter. SQLite transactions and WAL
 * make concurrent local processes serialize updates; it is not a distributed limiter.
 */
export class SqliteRateLimiter implements RateLimiter {
  private readonly database: DatabaseSync;
  private readonly now: () => number;

  public constructor(private readonly options: SqliteRateLimiterOptions) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.database = new DatabaseSync(options.databasePath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.database.exec("CREATE TABLE IF NOT EXISTS rate_limit_windows (identity_hash TEXT NOT NULL, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL, PRIMARY KEY (identity_hash, window_start))");
    this.now = options.clock ?? Date.now;
  }

  public consume(identity: string): RateLimitResult {
    const now = this.now();
    const windowStart = now - (now % this.options.windowMs);
    const resetAt = windowStart + this.options.windowMs;
    const identityHash = createHash("sha256").update(identity).digest("hex");
    this.database.prepare("DELETE FROM rate_limit_windows WHERE window_start < ?").run(windowStart - this.options.windowMs);
    const row = this.database.prepare("INSERT INTO rate_limit_windows (identity_hash, window_start, request_count) VALUES (?, ?, 1) ON CONFLICT(identity_hash, window_start) DO UPDATE SET request_count = request_count + 1 RETURNING request_count").get(identityHash, windowStart) as { request_count: number };
    return { allowed: row.request_count <= this.options.limit, remaining: Math.max(0, this.options.limit - row.request_count), resetAt };
  }

  public close(): void {
    this.database.close();
  }
}
