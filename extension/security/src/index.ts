// Primary API
export { createSecurity } from "./create-security.js";
export type { SecurityInstance } from "./create-security.js";

// Adapter integration
export { createNitroSecurityPlugin, installSecurity } from "./install.js";
export type { NitroSecurityPlugin } from "./install.js";

// Types — all public interfaces
export type {
  ActionGuardOptions,
  ApplyHeadersOptions,
  CoepOption,
  CoopOption,
  CorpOption,
  CreateSecurityOptions,
  CspDirectives,
  CspOptions,
  FrameguardOption,
  HstsOptions,
  PermissionsPolicyOptions,
  ProtectActionContext,
  RateLimitContext,
  RateLimitOptions,
  RateLimitResult,
  RateLimitRule,
  RateLimitStorage,
  ResolvedSecurityConfig,
  SecurityEventLike,
  SecurityRequestLike,
  SecurityResponseLike,
} from "./types.js";

// Errors
export { SecurityError, toSecurityResponseBody } from "./errors.js";
export type { SecurityErrorCode } from "./errors.js";

// Standalone utilities
export { buildCspHeader, generateNonce } from "./csp.js";
export { MemoryRateLimitStorage } from "./rate-limit.js";
export { buildPermissionsPolicyHeader } from "./permissions-policy.js";
export { buildHstsHeader } from "./hsts.js";
export { buildFrameguardHeader } from "./frameguard.js";
