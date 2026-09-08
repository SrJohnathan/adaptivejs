import type {
  CspDirectives,
  CreateSecurityOptions,
  HstsOptions,
  PermissionsPolicyOptions,
  RateLimitRule,
  ResolvedSecurityConfig,
} from "./types.js";

export const DEFAULT_CSP: CspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "https:"],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  objectSrc: ["'none'"],
};

export const DEFAULT_PERMISSIONS_POLICY: PermissionsPolicyOptions = {
  camera: [],
  microphone: [],
  geolocation: [],
  payment: [],
  usb: [],
  "interest-cohort": [],
};

export const DEFAULT_HSTS: HstsOptions = {
  maxAge: 31_536_000,
  includeSubDomains: true,
  preload: false,
};

export const PRODUCTION_RATE_LIMIT = {
  global: { max: 300, windowMs: 60_000 },
  actions: { max: 60, windowMs: 60_000 },
} as const;

export const DEVELOPMENT_RATE_LIMIT = {
  global: { max: 1_000, windowMs: 60_000 },
  actions: { max: 200, windowMs: 60_000 },
} as const;

export function resolveSecurityConfig(
  options: CreateSecurityOptions = {},
): ResolvedSecurityConfig {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";

  const frameguard = options.frameguard ?? "deny";
  const csp = options.csp === false ? false : { ...DEFAULT_CSP, ...(options.csp ?? {}) };
  const hsts =
    options.hsts === false
      ? false
      : {
          ...DEFAULT_HSTS,
          ...(typeof options.hsts === "object" ? options.hsts : {}),
        };

  const rateLimitDefaults = isProduction ? PRODUCTION_RATE_LIMIT : DEVELOPMENT_RATE_LIMIT;
  const rateLimit =
    options.rateLimit === false
      ? (false as const)
      : {
          global:
            options.rateLimit?.global === false
              ? (false as const)
              : {
                  ...rateLimitDefaults.global,
                  ...(typeof options.rateLimit?.global === "object"
                    ? options.rateLimit.global
                    : {}),
                },
          actions:
            options.rateLimit?.actions === false
              ? (false as const)
              : {
                  ...rateLimitDefaults.actions,
                  ...(typeof options.rateLimit?.actions === "object"
                    ? options.rateLimit.actions
                    : {}),
                },
          storage: options.rateLimit?.storage ?? null!,
        };


  return {
    frameguard,
    csp,
    hsts: isProduction ? hsts : false,
    nosniff: options.nosniff ?? true,
    referrerPolicy: options.referrerPolicy ?? "strict-origin-when-cross-origin",
    permissionsPolicy:
      options.permissionsPolicy === false
        ? false
        : { ...DEFAULT_PERMISSIONS_POLICY, ...(options.permissionsPolicy ?? {}) },
    coop: options.coop ?? "same-origin",
    corp: options.corp ?? "same-origin",
    coep: options.coep ?? false,
    rateLimit,
    actions: options.actions ?? {},
    allowedOrigins: normalizeAllowedOrigins(options.allowedOrigins),
    isProduction,
  };
}

export function validateSecurityConfig(config: ResolvedSecurityConfig): void {
  if (config.isProduction && config.allowedOrigins?.length) {
    for (const origin of config.allowedOrigins) {
      try {
        new URL(origin);
      } catch {
        throw new Error(
          `[AdaptiveJS security] Invalid allowedOrigins entry: "${origin}"`,
        );
      }
    }
  }

  if (config.rateLimit) {
    validateRateLimitRule(config.rateLimit.global, "rateLimit.global");
    validateRateLimitRule(config.rateLimit.actions, "rateLimit.actions");
  }
}

function validateRateLimitRule(rule: RateLimitRule | false, label: string): void {
  if (rule === false) return;
  if (rule.max <= 0 || rule.windowMs <= 0) {
    throw new Error(
      `[AdaptiveJS security] ${label} requires positive max and windowMs.`,
    );
  }
}

function normalizeAllowedOrigins(origins?: string[]): string[] | undefined {
  if (!origins?.length) return undefined;
  const normalized = origins
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return null;
      }
    })
    .filter((v): v is string => Boolean(v));

  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}
