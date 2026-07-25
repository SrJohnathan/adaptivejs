export type MaybePromise<T> = T | Promise<T>;

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  roles?: string[];
  [key: string]: unknown;
}

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

export interface StoredAuthSession<TData extends AuthSessionData = AuthSessionData> {
  id: string;
  userId: string;
  data: TData;
  createdAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  csrfToken: string;
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
}

export interface AuthCsrfOptions {
  allowedOrigins?: string[];
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

export interface CreateAuthOptions<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
> {
  adapter: AuthAdapter<TUser, TData>;
  cookie?: AuthCookieOptions;
  sessionDuration?: number;
  absoluteSessionDuration?: number;
  renewBefore?: number;
  generateSessionId?: () => string;
  csrf?: AuthCsrfOptions;
  onAuditEvent?: (event: AuthAuditEvent) => MaybePromise<void>;
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
