import type { RateLimitResult, RateLimitRule, RateLimitStorage } from "./types.js";

// ---------------------------------------------------------------------------
// In-memory storage (development default)
// ---------------------------------------------------------------------------

/**
 * Simple in-memory rate-limit store.
 * Suitable for single-process dev/test; use a Redis-backed store in production
 * multi-instance deployments.
 */
export class MemoryRateLimitStorage implements RateLimitStorage {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs = 60_000) {
    if (typeof setInterval !== "undefined") {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
      // Allow the process to exit even if this timer is still pending.
      if (this.cleanupTimer && typeof (this.cleanupTimer as any).unref === "function") {
        (this.cleanupTimer as any).unref();
      }
    }
  }

  increment(key: string, windowMs: number): { count: number; resetAt: number } {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (!existing || existing.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.entries.set(key, fresh);
      return fresh;
    }

    existing.count += 1;
    return existing;
  }

  /** Returns the current entry without incrementing. */
  peek(key: string): { count: number; resetAt: number } | null {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (!existing || existing.resetAt <= now) return null;
    return existing;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.entries.clear();
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Increments the counter for `key` and evaluates whether the request is
 * within the allowed rate.
 */
export async function evaluateRateLimit(
  key: string,
  rule: RateLimitRule,
  storage: RateLimitStorage,
): Promise<RateLimitResult> {
  const { count, resetAt } = await storage.increment(key, rule.windowMs);
  const now = Date.now();
  const allowed = count <= rule.max;
  const remaining = Math.max(0, rule.max - count);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

  return {
    allowed,
    limit: rule.max,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}

/**
 * Applies rate-limit response headers (`X-RateLimit-*`, `Retry-After`)
 * so clients can implement back-off without parsing error bodies.
 */
export function applyRateLimitHeaders(
  setHeader: (name: string, value: string) => void,
  result: RateLimitResult,
): void {
  setHeader("X-RateLimit-Limit", String(result.limit));
  setHeader("X-RateLimit-Remaining", String(result.remaining));
  setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) {
    setHeader("Retry-After", String(result.retryAfterSeconds));
  }
}
