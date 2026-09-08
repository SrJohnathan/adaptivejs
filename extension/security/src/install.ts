import { applySecurityHeaders } from "./headers.js";
import { generateNonce } from "./csp.js";
import { applyRateLimitHeaders, evaluateRateLimit } from "./rate-limit.js";
import { extractClientIp, resolveResponseTarget } from "./request.js";
import type {
  RateLimitStorage,
  ResolvedSecurityConfig,
  SecurityEventLike,
} from "./types.js";

// ---------------------------------------------------------------------------
// Nitro / H3 adapter plugin interface
// ---------------------------------------------------------------------------

/**
 * Minimal interface that `adapter-nitro` calls when a security plugin is
 * installed. Allows the SSR pipeline to:
 *   1. Obtain a fresh per-request nonce for the hydration `<script>`.
 *   2. Apply security headers (including the nonce in CSP) on every HTML response.
 */
export interface NitroSecurityPlugin {
  /**
   * Called once per SSR render to get a nonce string that will be injected
   * into both `Content-Security-Policy` and the inline hydration `<script>`.
   */
  generateNonce(): string;

  /**
   * Called after the response headers are available. The `nonce` is the
   * same value returned by `generateNonce()` for this request.
   */
  applyHeaders(event: SecurityEventLike, nonce: string): void;
}

// ---------------------------------------------------------------------------
// installSecurity — hooks into Nitro or a bare Node http.Server
// ---------------------------------------------------------------------------

/**
 * Installs the security module into a runtime adapter.
 *
 * **Nitro (preferred)** — pass the Nitro app returned by `createNitroApp()`.
 * The module registers `onBeforeResponse` hooks that apply headers and rate
 * limiting automatically.
 *
 * **Bare Node `http.Server`** — pass the server instance directly. The module
 * monkey-patches `server.emit('request', ...)` to add headers on every response.
 *
 * Both paths are best-effort: if the adapter shape is unrecognised, a warning
 * is printed and the function returns without throwing, so the app still boots.
 */
export function installSecurity(
  adapter: unknown,
  config: ResolvedSecurityConfig,
  storage: RateLimitStorage,
): void {
  if (!adapter || typeof adapter !== "object") return;

  const nitro = adapter as any;

  // ── Nitro / H3 ────────────────────────────────────────────────────────────
  if (typeof nitro.hooks?.hook === "function") {
    // Headers on every response
    nitro.hooks.hook("afterResponse", (event: SecurityEventLike) => {
      applySecurityHeaders(event, config);
    });

    // Rate limit on every request
    nitro.hooks.hook("request", async (event: SecurityEventLike) => {
      if (!config.rateLimit) return;

      const globalRule = config.rateLimit.global;
      if (globalRule === false) return;

      const ip = extractClientIp(event);
      const key = `global:${ip}`;
      const result = await evaluateRateLimit(key, globalRule, storage);

      const setter = resolveResponseTarget(event);
      if (setter) applyRateLimitHeaders(setter.setHeader, result);

      if (!result.allowed) {
        // Surface as a 429 response directly in Nitro
        const err = Object.assign(new Error("Too many requests."), {
          statusCode: 429,
          statusMessage: "Too Many Requests",
        });
        throw err;
      }
    });

    return;
  }

  // ── Bare Node http.Server ─────────────────────────────────────────────────
  if (typeof (adapter as any).on === "function") {
    const server = adapter as { on(event: string, handler: (...args: any[]) => void): void };

    server.on("request", (req: any, res: any) => {
      // Apply headers — wrap res into the ResponseLike interface
      const responseLike = {
        setHeader: (name: string, value: string) => res.setHeader(name, value),
      };

      // We don't have a SecurityEventLike here, so we build one
      const event: SecurityEventLike = {
        method: req.method,
        path: req.url,
        node: { req, res: responseLike as any },
      };

      applySecurityHeaders(event, config);
    });

    return;
  }

  // ── Unknown adapter ───────────────────────────────────────────────────────
  if (!config.isProduction) {
    console.warn(
      "[AdaptiveJS security] install(): adapter shape not recognised. " +
        "Call applyHeaders() and rateLimit() manually in your request handler.",
    );
  }
}

// ---------------------------------------------------------------------------
// createNitroSecurityPlugin — used by adapter-nitro to wire nonce into SSR
// ---------------------------------------------------------------------------

/**
 * Returns a `NitroSecurityPlugin` that `adapter-nitro/handler.ts` can hold a
 * reference to. The handler calls `plugin.generateNonce()` before rendering
 * and passes the nonce to `injectIntoTemplate`, then calls `plugin.applyHeaders`
 * so CSP and the hydration script share the same nonce.
 */
export function createNitroSecurityPlugin(
  config: ResolvedSecurityConfig,
): NitroSecurityPlugin {
  return {
    generateNonce,
    applyHeaders(event: SecurityEventLike, nonce: string): void {
      applySecurityHeaders(event, config, { nonce });
    },
  };
}
