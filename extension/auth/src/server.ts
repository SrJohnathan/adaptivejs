import { randomBytes } from "node:crypto";
import {
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
const DEFAULT_RENEW_BEFORE = 60 * 60 * 24 * 7;

function defaultGenerateSessionId() {
  return randomBytes(32).toString("base64url");
}

function toPublicSession<
  TUser extends AuthUser,
  TData extends AuthSessionData
>(stored: StoredAuthSession<TData>, user: TUser): AuthSession<TUser, TData> {
  return {
    ...stored,
    user
  };
}

export function createAuth<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
>(options: CreateAuthOptions<TUser, TData>) {
  const sessionDuration = options.sessionDuration ?? DEFAULT_SESSION_DURATION;
  const renewBefore = options.renewBefore ?? DEFAULT_RENEW_BEFORE;
  const generateSessionId = options.generateSessionId ?? defaultGenerateSessionId;
  const cookieOptions = {
    ...options.cookie,
    maxAge: options.cookie?.maxAge ?? sessionDuration
  };

  async function createSession(
    user: TUser,
    sessionOptions: CreateSessionOptions<TData> = {}
  ): Promise<{ session: AuthSession<TUser, TData>; cookie: AuthCookieResult }> {
    const now = new Date();
    const stored: StoredAuthSession<TData> = {
      id: generateSessionId(),
      userId: user.id,
      data: (sessionOptions.data ?? {}) as TData,
      createdAt: now,
      expiresAt: sessionOptions.expiresAt ?? new Date(now.getTime() + sessionDuration * 1000)
    };

    await options.adapter.createSession(stored);

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
    const cookieName = cookieOptions.name ?? "adaptive.session";
    const sessionId = getCookie(request, cookieName);

    if (!sessionId) {
      return { session: null };
    }

    const stored = await options.adapter.getSession(sessionId);
    if (!stored) {
      return {
        session: null,
        freshCookie: createBlankSessionCookie(cookieOptions)
      };
    }

    const now = Date.now();
    if (stored.expiresAt.getTime() <= now) {
      await options.adapter.deleteSession(stored.id);
      return {
        session: null,
        freshCookie: createBlankSessionCookie(cookieOptions)
      };
    }

    const user = await options.adapter.getUser(stored.userId);
    if (!user) {
      await options.adapter.deleteSession(stored.id);
      throw new AuthError(
        "SESSION_USER_NOT_FOUND",
        `The user "${stored.userId}" associated with this session no longer exists.`,
        401
      );
    }

    let freshCookie: AuthCookieResult | undefined;
    const remainingSeconds = Math.floor((stored.expiresAt.getTime() - now) / 1000);

    if (remainingSeconds <= renewBefore) {
      stored.expiresAt = new Date(now + sessionDuration * 1000);
      await options.adapter.updateSession(stored);
      freshCookie = createSessionCookie(stored.id, {
        ...cookieOptions,
        maxAge: sessionDuration
      });
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
    await options.adapter.deleteSession(sessionId);
    return createBlankSessionCookie(cookieOptions);
  }

  async function invalidateRequestSession(
    request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string
  ) {
    const cookieName = cookieOptions.name ?? "adaptive.session";
    const sessionId = getCookie(request, cookieName);

    if (sessionId) {
      await options.adapter.deleteSession(sessionId);
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
