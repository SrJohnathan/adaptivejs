export type FrameguardOption = "deny" | "sameorigin" | false;

export type CoopOption = "same-origin" | "same-origin-allow-popups" | false;

export type CorpOption = "same-origin" | "same-site" | "cross-origin" | false;

export type CoepOption = "require-corp" | "credentialless" | false;

export interface CspDirectives {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  connectSrc?: string[];
  frameAncestors?: string[];
  baseUri?: string[];
  formAction?: string[];
  objectSrc?: string[];
  reportUri?: string[];
}

export type CspOptions = CspDirectives | false;

export interface HstsOptions {
  maxAge?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

export type PermissionsPolicyOptions = Record<string, string[]>;

export interface RateLimitRule {
  max: number;
  windowMs: number;
}

export interface RateLimitOptions {
  global?: RateLimitRule | false;
  actions?: RateLimitRule | false;
  storage?: RateLimitStorage;
}

export interface RateLimitStorage {
  increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }> | { count: number; resetAt: number };
}

export interface ActionGuardOptions {
  /** Rate limit adicional por IP + action (complementa o baseline do core). */
  rateLimit?: RateLimitRule | false;
}

export interface CreateSecurityOptions {
  frameguard?: FrameguardOption;
  csp?: CspOptions;
  hsts?: boolean | HstsOptions;
  nosniff?: boolean;
  referrerPolicy?: string | false;
  permissionsPolicy?: PermissionsPolicyOptions | false;
  coop?: CoopOption;
  corp?: CorpOption;
  coep?: CoepOption;
  rateLimit?: RateLimitOptions | false;
  actions?: ActionGuardOptions;
  allowedOrigins?: string[];
  isProduction?: boolean;
}

export interface SecurityRequestLike {
  headers?: Headers | Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
}

export interface SecurityResponseLike {
  setHeader?(name: string, value: string): void;
  getHeader?(name: string): string | number | string[] | undefined;
  headers?: {
    set(name: string, value: string): void;
    append?(name: string, value: string): void;
    get?(name: string): string | null;
  };
}

export interface SecurityEventLike {
  method?: string;
  path?: string;
  node?: { req?: SecurityRequestLike; res?: SecurityResponseLike };
  req?: SecurityRequestLike;
  res?: SecurityResponseLike;
  headers?: Headers | Record<string, string | string[] | undefined>;
}

export interface ApplyHeadersOptions {
  nonce?: string;
  isHttps?: boolean;
}

export interface RateLimitContext {
  key?: string;
  rule?: "global" | "actions";
}

export interface ProtectActionContext {
  actionName?: string;
  moduleId?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface SecurityInstallHooks {
  onBeforeRequest?: (event: SecurityEventLike) => Promise<void> | void;
  onBeforeAction?: (
    event: SecurityEventLike,
    context: ProtectActionContext,
  ) => Promise<void> | void;
}

export interface ResolvedSecurityConfig {
  frameguard: FrameguardOption;
  csp: CspDirectives | false;
  hsts: HstsOptions | false;
  nosniff: boolean;
  referrerPolicy: string | false;
  permissionsPolicy: PermissionsPolicyOptions | false;
  coop: CoopOption;
  corp: CorpOption;
  coep: CoepOption;
  rateLimit: {
    global: RateLimitRule | false;
    actions: RateLimitRule | false;
    storage: RateLimitStorage;
  } | false;
  actions: ActionGuardOptions;
  allowedOrigins: string[] | undefined;
  isProduction: boolean;
}
