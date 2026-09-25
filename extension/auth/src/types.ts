export type MaybePromise<T> = T | Promise<T>;

export interface AuthUserFields {
  id: string;
  email?: string;
  name?: string;
  roles?: string[];
}

/**
 * Known user fields stay strongly typed. Pass a generic to model app-specific fields.
 */
export type AuthUser<TExtra extends Record<string, unknown> = Record<string, unknown>> =
  AuthUserFields & TExtra;

export interface AuthSessionData {
  [key: string]: unknown;
}

export interface AuthSession<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
> {
  id: string;
  userId: TUser["id"];
  user: TUser;
  data: TData;
  createdAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface StoredSessionBinding {
  userAgent?: string;
  ip?: string;
  fingerprint?: string;
}

export interface StoredAuthSession<TData extends AuthSessionData = AuthSessionData> {
  id: string;
  userId: string;
  data: TData;
  createdAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  csrfToken: string;
  binding?: StoredSessionBinding;
}

/**
 * Public session metadata for account/device management UIs.
 * Never includes csrfToken or other internal secrets.
 */
export interface ManagedUserSession {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

/**
 * Conceptual identity for a future OAuth integration package.
 * Linking is based on (provider, providerAccountId), not email alone.
 */
export interface OAuthIdentity {
  userId: string;
  provider: string;
  providerAccountId: string;
}

export interface AuthAdapter<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
> {
  getUser(userId: string): MaybePromise<TUser | null>;
  getSession(sessionId: string): MaybePromise<StoredAuthSession<TData> | null>;
  createSession(session: StoredAuthSession<TData>): MaybePromise<void>;
  updateSession(session: StoredAuthSession<TData>): MaybePromise<void>;
  deleteSession(sessionId: string): MaybePromise<void>;
  deleteUserSessions?(userId: string): MaybePromise<void>;
  deleteUserSessionsExcept?(userId: string, exceptSessionId: string): MaybePromise<void>;
  listUserSessions?(userId: string): MaybePromise<ManagedUserSession[]>;
}


export interface ApiExternalAdapter <  TUser extends AuthUser = AuthUser>{
  id: string;
  token: string;
/** chamar a rota de login */
  request(): Promise<TUser>;

  /** atualiza */
  refresh?(): Promise<TUser>;
}

export type ExternalAuthResult<TUser extends AuthUser = AuthUser> = {
  id: string;
  email?: string;
  name?: string;
  /** access token do IdP — o adapter guarda em `.token` */
  token?: string;
  /** extra livre (roles, claims, …) */
  data?: Record<string, unknown>;
} & Partial<TUser>;

export type ExternalAuthInput = Record<string, unknown>;

export interface ApiExternalAdapter<TUser extends AuthUser = AuthUser> {
   id: string;
   token: string;
  request(input?: ExternalAuthInput): Promise<TUser>;
  refresh?(input?: ExternalAuthInput): Promise<TUser>;
}


export interface AuthCookieOptions {
  name?: string;
  path?: string;
  domain?: string;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
  httpOnly?: boolean;
  maxAge?: number;
}

export interface AuthRequestLike {
  headers: Headers | Record<string, string | string[] | undefined>;
  url?: string;
}

export interface AuthCookieResult {
  name: string;
  value: string;
  header: string;
}

export interface CreateSessionOptions<TData extends AuthSessionData = AuthSessionData> {
  data?: TData;
  expiresAt?: Date;
  absoluteExpiresAt?: Date;
  binding?: StoredSessionBinding;
}

export interface BeforeCreateSessionContext<
  TUser extends AuthUser = AuthUser
> {
  user: TUser;
  request?: AuthRequestLike;
}

export interface AuthCsrfOptions {
  allowedOrigins: string[];
  headerName?: string;
}

export type AuthAuditEventType =
  | "session.created"
  | "session.renewed"
  | "session.invalidated"
  | "session.expired"
  | "session.rejected"
  | "csrf.rejected";

export interface AuthAuditEvent {
  type: AuthAuditEventType;
  sessionId?: string;
  userId?: string;
  reason?: string;
  at: Date;
}

export interface SessionBindingConfig {
  userAgent?: boolean;
  ip?: boolean;
  fingerprint?: boolean;
}

export interface RateLimitContext<TUser extends AuthUser = AuthUser> {
  ip: string | null;
  userId?: string;
  user?: TUser;
  request?: AuthRequestLike;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface AuthRateLimitStorage {
  increment(key: string, windowMs: number): MaybePromise<{ count: number; resetAt: number }>;
  get?(key: string): MaybePromise<RateLimitEntry | null>;
  reset?(key: string): MaybePromise<void>;
}

export interface AuthRateLimitRule<TUser extends AuthUser = AuthUser> {
  max: number;
  windowMs: number;
  key?: (context: RateLimitContext<TUser>) => string;
  storage?: AuthRateLimitStorage;
}

export interface AuthRateLimitConfig<TUser extends AuthUser = AuthUser> {
  createSession?: AuthRateLimitRule<TUser>;
}

export interface CreateAuthOptions<
    TUser extends AuthUser = AuthUser,
    TData extends AuthSessionData = AuthSessionData,
    TExternal extends ApiExternalAdapter<TUser> = ApiExternalAdapter<TUser>
> {
  adapter: AuthAdapter<TUser, TData>;
  /** Opcional: IdP externo (Axum, etc.) */
  external?: TExternal;
  csrf: AuthCsrfOptions;
  cookie?: AuthCookieOptions;
  sessionDuration?: number;
  absoluteSessionDuration?: number;
  renewBefore?: number;
  generateSessionId?: () => string;
  secureDefaults?: boolean;
  sessionBinding?: SessionBindingConfig;
  rateLimit?: AuthRateLimitConfig<TUser>;
  onAuditEvent?: (event: AuthAuditEvent) => MaybePromise<void>;
  beforeCreateSession?: (context: BeforeCreateSessionContext<TUser>) => MaybePromise<void>;
  onPasswordChanged?: (userId: string) => MaybePromise<void>;
  onRoleChanged?: (userId: string) => MaybePromise<void>;
  onMfaEnabled?: (userId: string) => MaybePromise<void>;
  onSuspiciousActivity?: (userId: string, reason: string) => MaybePromise<void>;
}

export interface ReadSessionResult<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
> {
  session: AuthSession<TUser, TData> | null;
  freshCookie?: AuthCookieResult;
}

export interface AuthClientState<TUser extends AuthUser = AuthUser> {
  authenticated: boolean;
  user: TUser | null;
  expiresAt: string | null;
}

export interface AuthActionContext<
    TUser extends AuthUser = AuthUser,
    TData extends AuthSessionData = AuthSessionData,
    TExternal extends ApiExternalAdapter<TUser> = ApiExternalAdapter<TUser>
> {
  session: AuthSession<TUser, TData>;
  freshCookie?: AuthCookieResult;
  formData?: FormData;
  request: AuthRequestLike;
  args: unknown[];
  event?: any;
  external?: TExternal;
}

export interface AuthActionOptions {
  roles?: string[];
}

export interface AuthPageContext {
  request?: AuthRequestLike;
  appendSetCookie?: (header: string) => void;
}

export interface ProtectPageOptions {
  roles?: string[];
  onUnauthenticated?: "404" | "401" | "redirect" | ((context: AuthPageContext) => any);
  redirectTo?: string;
  returnTo?: boolean;
  onForbidden?: "404" | "403" | ((context: AuthPageContext) => any);
}

export type ProtectedPageContext<
  TContext extends AuthPageContext = AuthPageContext,
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
> = TContext & { session: AuthSession<TUser, TData> };


