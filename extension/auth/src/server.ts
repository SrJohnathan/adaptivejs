import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_AUTH_COOKIE_NAME,
  createBlankSessionCookie,
  createSessionCookie,
  getCookie
} from "./cookies.js";
import { AuthError } from "./errors.js";
import type {
  AuthCookieResult,
  AuthRequestLike,
  AuthSession,
  AuthSessionData,
  AuthUser,
  CreateAuthOptions,
  CreateSessionOptions,
  ReadSessionResult,
  StoredAuthSession
} from "./types.js";

const DEFAULT_SESSION_DURATION = 60 * 60 * 24 * 30;
const DEFAULT_ABSOLUTE_SESSION_DURATION = 60 * 60 * 24 * 90;
const DEFAULT_RENEW_BEFORE = 60 * 60 * 24 * 7;
const DEFAULT_CSRF_HEADER_NAME = "x-adaptive-csrf-token";

function defaultGenerateSessionId() {
  return randomBytes(32).toString("base64url");
}

function defaultGenerateCsrfToken() {
  return randomBytes(32).toString("base64url");
}

function toPublicSession<
  TUser extends AuthUser,
  TData extends AuthSessionData
>(stored: StoredAuthSession<TData>, user: TUser): AuthSession<TUser, TData> {
  const { csrfToken: _, ...session } = stored;
  return {
    ...session,
    user
  };
}

function readHeader(
  request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string,
  name: string
) {
  if (typeof request === "string") return null;
  const headers = request instanceof Headers
    ? request
    : "headers" in request && request.headers
      ? request.headers
      : request as Record<string, string | string[] | undefined>;

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isSameSecret(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export interface AuthPageContext {
  request?: AuthRequestLike;
  appendSetCookie?: (header: string) => void;
}

export interface ProtectPageOptions {
  roles?: string[];
}

export type ProtectedPageContext<TContext extends AuthPageContext, TUser extends AuthUser, TData extends AuthSessionData> =
  TContext & { session: AuthSession<TUser, TData> };

export function createAuth<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
>(options: CreateAuthOptions<TUser, TData>) {
  const sessionDuration = options.sessionDuration ?? DEFAULT_SESSION_DURATION;
  const absoluteSessionDuration = options.absoluteSessionDuration ?? DEFAULT_ABSOLUTE_SESSION_DURATION;
  const renewBefore = options.renewBefore ?? DEFAULT_RENEW_BEFORE;
  const generateSessionId = options.generateSessionId ?? defaultGenerateSessionId;
  const cookieOptions = {
    ...options.cookie,
    maxAge: options.cookie?.maxAge ?? sessionDuration
  };
  const csrfHeaderName = options.csrf?.headerName ?? DEFAULT_CSRF_HEADER_NAME;
  const allowedOrigins = new Set((options.csrf?.allowedOrigins ?? []).map(normalizeOrigin).filter(Boolean));

  if (sessionDuration <= 0 || absoluteSessionDuration <= 0 || renewBefore < 0) {
    throw new Error("[AdaptiveJS auth] Session durations must be positive and renewBefore cannot be negative.");
  }

  async function audit(
    type: import("./types.js").AuthAuditEventType,
    details: Omit<import("./types.js").AuthAuditEvent, "type" | "at">
  ) {
    await options.onAuditEvent?.({ type, at: new Date(), ...details });
  }

  async function createSession(
    user: TUser,
    sessionOptions: CreateSessionOptions<TData> = {}
  ): Promise<{ session: AuthSession<TUser, TData>; cookie: AuthCookieResult }> {
    const now = new Date();
    const absoluteExpiresAt = sessionOptions.absoluteExpiresAt ?? new Date(now.getTime() + absoluteSessionDuration * 1000);
    const requestedExpiry = sessionOptions.expiresAt ?? new Date(now.getTime() + sessionDuration * 1000);
    const stored: StoredAuthSession<TData> = {
      id: generateSessionId(),
      userId: user.id,
      data: (sessionOptions.data ?? {}) as TData,
      createdAt: now,
      expiresAt: new Date(Math.min(requestedExpiry.getTime(), absoluteExpiresAt.getTime())),
      absoluteExpiresAt,
      csrfToken: defaultGenerateCsrfToken()
    };

    await options.adapter.createSession(stored);
    await audit("session.created", { sessionId: stored.id, userId: stored.userId });

    return {
      session: toPublicSession(stored, user),
      cookie: createSessionCookie(stored.id, {
        ...cookieOptions,
        maxAge: Math.max(0, Math.floor((stored.expiresAt.getTime() - now.getTime()) / 1000))
      })
    };
  }

  async function readSession(
    request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string
  ): Promise<ReadSessionResult<TUser, TData>> {
    const cookieName = cookieOptions.name ?? DEFAULT_AUTH_COOKIE_NAME;
    const sessionId = getCookie(request, cookieName);

    if (!sessionId) {
      return { session: null };
    }

    const stored = await options.adapter.getSession(sessionId);
    if (!stored) {
      await audit("session.rejected", { reason: "session-not-found" });
      return {
        session: null,
        freshCookie: createBlankSessionCookie(cookieOptions)
      };
    }

    const now = Date.now();
    if (stored.expiresAt.getTime() <= now || stored.absoluteExpiresAt.getTime() <= now) {
      await options.adapter.deleteSession(stored.id);
      await audit("session.expired", { sessionId: stored.id, userId: stored.userId });
      return {
        session: null,
        freshCookie: createBlankSessionCookie(cookieOptions)
      };
    }

    const user = await options.adapter.getUser(stored.userId);
    if (!user) {
      await options.adapter.deleteSession(stored.id);
      await audit("session.rejected", { sessionId: stored.id, userId: stored.userId, reason: "user-not-found" });
      throw new AuthError(
        "SESSION_USER_NOT_FOUND",
        `The user "${stored.userId}" associated with this session no longer exists.`,
        401
      );
    }

    let freshCookie: AuthCookieResult | undefined;
    const remainingSeconds = Math.floor((stored.expiresAt.getTime() - now) / 1000);

    if (remainingSeconds <= renewBefore) {
      const renewed: StoredAuthSession<TData> = {
        ...stored,
        id: generateSessionId(),
        expiresAt: new Date(Math.min(now + sessionDuration * 1000, stored.absoluteExpiresAt.getTime()))
      };
      await options.adapter.createSession(renewed);
      await options.adapter.deleteSession(stored.id);
      await audit("session.renewed", { sessionId: renewed.id, userId: renewed.userId });
      freshCookie = createSessionCookie(renewed.id, {
        ...cookieOptions,
        maxAge: Math.max(0, Math.floor((renewed.expiresAt.getTime() - now) / 1000))
      });
      return {
        session: toPublicSession(renewed, user),
        freshCookie
      };
    }

    return {
      session: toPublicSession(stored, user),
      freshCookie
    };
  }

  async function requireSession(
    request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string
  ) {
    const result = await readSession(request);

    if (!result.session) {
      throw new AuthError(
        "AUTHENTICATION_REQUIRED",
        "An authenticated session is required.",
        401
      );
    }

    return result;
  }

  async function invalidateSession(sessionId: string) {
    const stored = await options.adapter.getSession(sessionId);
    await options.adapter.deleteSession(sessionId);
    await audit("session.invalidated", { sessionId, userId: stored?.userId });
    return createBlankSessionCookie(cookieOptions);
  }

  async function invalidateRequestSession(
    request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string
  ) {
    const cookieName = cookieOptions.name ?? DEFAULT_AUTH_COOKIE_NAME;
    const sessionId = getCookie(request, cookieName);

    if (sessionId) {
      const stored = await options.adapter.getSession(sessionId);
      await options.adapter.deleteSession(sessionId);
      await audit("session.invalidated", { sessionId, userId: stored?.userId });
    }

    return createBlankSessionCookie(cookieOptions);
  }

  async function invalidateUserSessions(userId: string) {
    if (!options.adapter.deleteUserSessions) {
      throw new Error(
        "[AdaptiveJS auth] The configured adapter does not implement deleteUserSessions()."
      );
    }

    await options.adapter.deleteUserSessions(userId);
    await audit("session.invalidated", { userId, reason: "user-sessions-invalidated" });
  }

  async function getCsrfToken(session: Pick<AuthSession<TUser, TData>, "id">) {
    const stored = await options.adapter.getSession(session.id);
    if (!stored || stored.expiresAt.getTime() <= Date.now() || stored.absoluteExpiresAt.getTime() <= Date.now()) {
      throw new AuthError("AUTHENTICATION_REQUIRED", "An authenticated session is required.", 401);
    }
    return stored.csrfToken;
  }

  async function requireCsrf(
    request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string,
    session: AuthSession<TUser, TData> | null,
    submittedToken?: string | null
  ) {
    if (!session) {
      throw new AuthError("AUTHENTICATION_REQUIRED", "An authenticated session is required.", 401);
    }

    if (allowedOrigins.size === 0) {
      throw new Error(
        "[AdaptiveJS auth] CSRF protection requires csrf.allowedOrigins to be configured."
      );
    }

    const origin = readHeader(request, "origin");
    if (allowedOrigins.size > 0 && (!origin || !allowedOrigins.has(normalizeOrigin(origin)))) {
      await audit("csrf.rejected", { sessionId: session.id, userId: session.userId, reason: "origin" });
      throw new AuthError("CSRF_ORIGIN_INVALID", "The request origin is not allowed.", 403);
    }

    const stored = await options.adapter.getSession(session.id);
    const token = submittedToken ?? readHeader(request, csrfHeaderName);
    if (!stored || !token || !isSameSecret(stored.csrfToken, token)) {
      await audit("csrf.rejected", { sessionId: session.id, userId: session.userId, reason: "token" });
      throw new AuthError("CSRF_TOKEN_INVALID", "The CSRF token is invalid.", 403);
    }
  }

  function protectPage<TContext extends AuthPageContext>(
    page: (context: ProtectedPageContext<TContext, TUser, TData>) => any | Promise<any>,
    protection: ProtectPageOptions = {}
  ) {
    return async (context: TContext) => {
      let result: ReadSessionResult<TUser, TData>;
      try {
        result = await readSession(context?.request ?? { headers: {} });
      } catch (error) {
        if (error instanceof AuthError) {
          return { __type: "not-found" as const };
        }
        throw error;
      }

      if (!result.session) {
        return { __type: "not-found" as const };
      }

      if (result.freshCookie) {
        context?.appendSetCookie?.(result.freshCookie.header);
      }

      if (protection.roles?.some((role) => !hasRole(result.session, role))) {
        await audit("session.rejected", {
          sessionId: result.session.id,
          userId: result.session.userId,
          reason: "route-role"
        });
        return { __type: "not-found" as const };
      }

      return page({ ...context, session: result.session });
    };
  }

  function hasRole(session: AuthSession<TUser, TData> | null, role: string) {
    return session?.user.roles?.includes(role) ?? false;
  }

  function requireRole(session: AuthSession<TUser, TData> | null, role: string) {
    if (!session) {
      throw new AuthError(
        "AUTHENTICATION_REQUIRED",
        "An authenticated session is required.",
        401
      );
    }

    if (!hasRole(session, role)) {
      throw new AuthError(
        "AUTHORIZATION_FAILED",
        `The authenticated user does not have the required "${role}" role.`,
        403
      );
    }

    return session;
  }

  return {
    createSession,
    readSession,
    requireSession,
    invalidateSession,
    invalidateRequestSession,
    invalidateUserSessions,
    getCsrfToken,
    requireCsrf,
    protectPage,
    hasRole,
    requireRole,
    cookie: {
      create: (sessionId: string) => createSessionCookie(sessionId, cookieOptions),
      blank: () => createBlankSessionCookie(cookieOptions)
    }
  };
}

export type AdaptiveAuth<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
> = ReturnType<typeof createAuth<TUser, TData>>;
