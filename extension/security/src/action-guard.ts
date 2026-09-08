import { SecurityError } from "./errors.js";
import { applyRateLimitHeaders, evaluateRateLimit } from "./rate-limit.js";
import { extractClientIp, normalizeSecurityRequest, resolveResponseTarget } from "./request.js";
import type {
  ProtectActionContext,
  RateLimitStorage,
  ResolvedSecurityConfig,
  SecurityEventLike,
  SecurityRequestLike,
} from "./types.js";

/**
 * Guards the `/_action` endpoint with rate limiting.
 *
 * The core framework already validates `Origin` and `Content-Type` as
 * baseline protections (see `server-actions-security.md`). This guard
 * adds the layers that are genuinely optional by nature:
 *   - Rate limiting by IP (global pool)
 *   - Rate limiting by IP + action name (action-specific pool)
 *
 * Throws `SecurityError` with status 429 when a limit is exceeded.
 */
export async function protectAction(
  request: SecurityRequestLike | SecurityEventLike,
  config: ResolvedSecurityConfig,
  storage: RateLimitStorage,
  context: ProtectActionContext = {},
): Promise<void> {
  if (!config.rateLimit) return;

  const normalized = normalizeSecurityRequest(request as SecurityEventLike);
  const ip = extractClientIp(request as SecurityEventLike);

  // Resolve response target for rate-limit headers (best-effort).
  const setter = resolveResponseTarget(request as SecurityEventLike);
  const applyHeaders = setter
    ? (result: Parameters<typeof applyRateLimitHeaders>[1]) =>
        applyRateLimitHeaders(setter.setHeader, result)
    : () => {};

  // ── Global rate limit ────────────────────────────────────────────────────
  const globalRule = config.rateLimit.actions;
  if (globalRule !== false) {
    const globalKey = `action:global:${ip}`;
    const globalResult = await evaluateRateLimit(globalKey, globalRule, storage);
    applyHeaders(globalResult);

    if (!globalResult.allowed) {
      throw new SecurityError(
        "RATE_LIMIT_EXCEEDED",
        config.isProduction
          ? "Too many requests."
          : `Rate limit exceeded for global action pool (IP: ${ip}).`,
        429,
      );
    }
  }

  // ── Per-action rate limit ────────────────────────────────────────────────
  const actionName = context.actionName;
  const moduleId = context.moduleId;
  if (actionName && config.rateLimit.actions !== false) {
    const actionKey = `action:${moduleId ?? "default"}:${actionName}:${ip}`;
    const actionResult = await evaluateRateLimit(actionKey, config.rateLimit.actions, storage);
    applyHeaders(actionResult);

    if (!actionResult.allowed) {
      throw new SecurityError(
        "RATE_LIMIT_EXCEEDED",
        config.isProduction
          ? "Too many requests."
          : `Rate limit exceeded for action "${actionName}" (IP: ${ip}).`,
        429,
      );
    }
  }

  // ── URL in normalized form for unused-import hygiene ────────────────────
  void normalized.url;
}
