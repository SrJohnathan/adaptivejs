import { protectAction as _protectAction } from "./action-guard.js";
import { buildCspHeader, generateNonce } from "./csp.js";
import { SecurityError } from "./errors.js";
import { applySecurityHeaders } from "./headers.js";
import { createNitroSecurityPlugin, installSecurity } from "./install.js";
import { MemoryRateLimitStorage, applyRateLimitHeaders, evaluateRateLimit } from "./rate-limit.js";
import { extractClientIp, normalizeSecurityRequest, resolveResponseTarget } from "./request.js";
import { resolveSecurityConfig, validateSecurityConfig } from "./defaults.js";
import type {
  ApplyHeadersOptions,
  CreateSecurityOptions,
  ProtectActionContext,
  RateLimitContext,
  RateLimitResult,
  RateLimitStorage,
  ResolvedSecurityConfig,
  SecurityEventLike,
  SecurityRequestLike,
} from "./types.js";

// ---------------------------------------------------------------------------
// SecurityInstance
// ---------------------------------------------------------------------------

export interface SecurityInstance {
  /** The fully-resolved, validated configuration. */
  readonly config: ResolvedSecurityConfig;

  /**
   * Applies all security headers to the response.
   * Pass `options.nonce` to include the same nonce in `Content-Security-Policy`
   * and your inline `<script>` tags.
   */
  applyHeaders(
    target: SecurityEventLike | { setHeader?(name: string, value: string): void },
    options?: ApplyHeadersOptions,
  ): void;

  /**
   * Evaluates the global rate limit for the incoming request.
   * Attaches `X-RateLimit-*` headers to the response and throws a
   * `SecurityError(RATE_LIMIT_EXCEEDED, 429)` when the limit is exceeded.
   */
  rateLimit(
    request: SecurityRequestLike | SecurityEventLike,
    context?: RateLimitContext,
  ): Promise<RateLimitResult>;

  /**
   * Full guard for the `/_action` endpoint.
   * Applies per-IP and per-action rate limiting.
   * Throws `SecurityError` on violation.
   */
  protectAction(
    request: SecurityRequestLike | SecurityEventLike,
    context?: ProtectActionContext,
  ): Promise<void>;

  /**
   * Installs the module into a runtime adapter (Nitro app or Node http.Server).
   * After calling this, headers and rate limiting are applied automatically.
   */
  install(adapter: unknown): void;

  /** Generates a cryptographically random nonce (base64, 16 bytes). */
  generateNonce(): string;

  /**
   * Builds the `Content-Security-Policy` header value, optionally embedding a
   * nonce into `script-src`.
   */
  buildCspHeader(nonce?: string): string;

  /**
   * Returns a `NitroSecurityPlugin` for use by `adapter-nitro/handler.ts`.
   * The handler calls `plugin.generateNonce()` per SSR render and
   * `plugin.applyHeaders(event, nonce)` to keep the nonce consistent
   * between the hydration `<script>` and the CSP header.
   */
  asNitroPlugin(): ReturnType<typeof createNitroSecurityPlugin>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a fully configured security instance with secure defaults.
 *
 * ```ts
 * // Minimum viable usage — all defaults applied:
 * export const security = createSecurity();
 *
 * // With explicit allowed origins:
 * export const security = createSecurity({
 *   allowedOrigins: ["https://app.example.com"],
 * });
 * ```
 *
 * Configuration is validated at call time (fail-closed). Passing an invalid
 * `allowedOrigins` entry in production mode throws immediately so misconfiguration
 * is surfaced at boot, not at runtime.
 */
export function createSecurity(options: CreateSecurityOptions = {}): SecurityInstance {
  const config = resolveSecurityConfig(options);
  validateSecurityConfig(config);

  // Build a single shared storage instance. In production the developer
  // should provide a Redis-backed store via options.rateLimit.storage.
  const storage: RateLimitStorage =
    (config.rateLimit && (config.rateLimit as any).storage) ||
    new MemoryRateLimitStorage();

  // ── applyHeaders ──────────────────────────────────────────────────────────
  function applyHeaders(
    target: SecurityEventLike | { setHeader?(name: string, value: string): void },
    headerOptions: ApplyHeadersOptions = {},
  ): void {
    applySecurityHeaders(target as SecurityEventLike, config, headerOptions);
  }

  // ── rateLimit ─────────────────────────────────────────────────────────────
  async function rateLimit(
    request: SecurityRequestLike | SecurityEventLike,
    context: RateLimitContext = {},
  ): Promise<RateLimitResult> {
    if (!config.rateLimit || config.rateLimit.global === false) {
      // Rate limiting disabled — return a synthetic "always allowed" result.
      return { allowed: true, limit: Infinity, remaining: Infinity, resetAt: 0, retryAfterSeconds: 0 };
    }

    const rule = config.rateLimit.global;
    const ip = context.key ?? extractClientIp(request as SecurityEventLike);
    const key = `global:${ip}`;
    const result = await evaluateRateLimit(key, rule, storage);

    // Best-effort: attach rate limit headers to the response.
    const setter = resolveResponseTarget(request as SecurityEventLike);
    if (setter) applyRateLimitHeaders(setter.setHeader, result);

    if (!result.allowed) {
      throw new SecurityError(
        "RATE_LIMIT_EXCEEDED",
        config.isProduction
          ? "Too many requests."
          : `Global rate limit exceeded (IP: ${ip}).`,
        429,
      );
    }

    return result;
  }

  // ── protectAction ─────────────────────────────────────────────────────────
  async function protectAction(
    request: SecurityRequestLike | SecurityEventLike,
    context: ProtectActionContext = {},
  ): Promise<void> {
    return _protectAction(request, config, storage, context);
  }

  // ── install ───────────────────────────────────────────────────────────────
  function install(adapter: unknown): void {
    installSecurity(adapter, config, storage);
  }

  // ── buildCspHeader ────────────────────────────────────────────────────────
  function buildCsp(nonce?: string): string {
    if (config.csp === false) return "";
    return buildCspHeader(config.csp, nonce);
  }

  // ── asNitroPlugin ─────────────────────────────────────────────────────────
  function asNitroPlugin() {
    return createNitroSecurityPlugin(config);
  }

  return {
    config,
    applyHeaders,
    rateLimit,
    protectAction,
    install,
    generateNonce,
    buildCspHeader: buildCsp,
    asNitroPlugin,
  };
}
