import { buildCspHeader } from "./csp.js";
import { applyCoep, applyCoop, applyCorp } from "./cross-origin.js";
import { applyFrameguard } from "./frameguard.js";
import { applyHsts } from "./hsts.js";
import { applyPermissionsPolicy } from "./permissions-policy.js";
import { isHttpsRequest, resolveResponseTarget } from "./request.js";
import type {
  ApplyHeadersOptions,
  ResolvedSecurityConfig,
  SecurityEventLike,
  SecurityResponseLike,
} from "./types.js";

/**
 * Applies all configured security headers to the response.
 *
 * Accepts either a Nitro/H3 event (`SecurityEventLike`) or a plain
 * response-like object (`SecurityResponseLike`). HSTS is only emitted
 * when the request is detected as HTTPS (via `X-Forwarded-Proto` or an
 * explicit `options.isHttps` override).
 */
export function applySecurityHeaders(
  target: SecurityEventLike | SecurityResponseLike,
  config: ResolvedSecurityConfig,
  options: ApplyHeadersOptions = {},
): void {
  const setter = resolveResponseTarget(target as SecurityEventLike);
  if (!setter) return;

  const { setHeader } = setter;
  const nonce = options.nonce;
  const isHttps = options.isHttps ?? isHttpsRequest(target as SecurityEventLike);

  // X-Frame-Options
  applyFrameguard(setHeader, config.frameguard);

  // Content-Security-Policy
  if (config.csp !== false) {
    setHeader("Content-Security-Policy", buildCspHeader(config.csp, nonce));
  }

  // X-Content-Type-Options
  if (config.nosniff) {
    setHeader("X-Content-Type-Options", "nosniff");
  }

  // Referrer-Policy
  if (config.referrerPolicy !== false) {
    setHeader("Referrer-Policy", config.referrerPolicy);
  }

  // Permissions-Policy
  applyPermissionsPolicy(setHeader, config.permissionsPolicy);

  // Strict-Transport-Security
  applyHsts(setHeader, config.hsts, isHttps);

  // Cross-Origin-*
  applyCoop(setHeader, config.coop);
  applyCorp(setHeader, config.corp);
  applyCoep(setHeader, config.coep);
}
