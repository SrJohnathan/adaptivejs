import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_AUTH_COOKIE_NAME,
  createBlankSessionCookie,
  createSessionCookie,
  getCookie,
  validateCookieOptions
} from "./cookies.js";
import { AuthError } from "./errors.js";
import {
  buildLoginReturnUrl,
  readReturnToFromSearchParams,
  sanitizeReturnTo
} from "./intended-url.js";
import { evaluateRateLimit, extractClientIp } from "./rate-limit.js";
import type {
  AuthActionContext,
  AuthActionOptions,
  AuthCookieResult,
  AuthPageContext,
  AuthRequestLike,
  AuthSession,
  AuthSessionData,
  AuthUser,
  CreateAuthOptions,
  CreateSessionOptions,
  ManagedUserSession,
  ProtectedPageContext,
  ProtectPageOptions,
  ReadSessionResult,
  StoredAuthSession,
  StoredSessionBinding
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
  const { csrfToken: _, binding: __, ...session } = stored;
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

function validateAllowedOrigins(origins: string[]) {
  if (!Array.isArray(origins) || origins.length === 0) {
    throw new AuthError(
      "CSRF_CONFIGURATION_INVALID",
      "CSRF allowedOrigins must include at least one valid origin.",
      500
    );
  }

  const normalized = new Set<string>();

  for (const origin of origins) {
    const value = normalizeOrigin(origin);

    if (!value) {
      throw new AuthError(
        "CSRF_CONFIGURATION_INVALID",
        `Invalid CSRF allowed origin: "${origin}".`,
        500
      );
    }

    normalized.add(value);
  }

  if (normalized.size === 0) {
    throw new AuthError(
      "CSRF_CONFIGURATION_INVALID",
      "CSRF allowedOrigins must include at least one valid origin.",
      500
    );
  }

  return normalized;
}

function normalizeAuthRequest(input: any): AuthRequestLike {
  if (!input) {
    return { headers: {} };
  }
  if (input instanceof Headers) {
    return { headers: input };
  }
  if (typeof input === "object") {
    if (input.event) {
      return normalizeAuthRequest(input.event);
    }
    if (input.node?.req) {
      return {
        headers: input.node.req.headers ?? {},
        url: input.node.req.url
      };
    }
    if (input.req?.headers) {
      return {
        headers: input.req.headers,
        url: input.req.url
      };
    }
    if (input.request) {
      return normalizeAuthRequest(input.request);
    }
    if (input.headers) {
      return {
        headers: input.headers,
        url: input.url
      };
    }
  }
  return { headers: {} };
}

function extractCsrfFromFormData(formData: any): string | null {
  if (!formData || typeof formData.get !== "function") return null;
  return (
    formData.get("csrfToken") ??
    formData.get("_csrf") ??
    formData.get("x-adaptive-csrf-token") ??
    null
  );
}

function extractCsrfFromArgs(args: unknown[]): string | null {
  for (const arg of args) {
    if (arg && typeof arg === "object") {
      if (typeof (arg as any).get === "function") {
        const fromForm = extractCsrfFromFormData(arg);
        if (fromForm) return fromForm;
      }
      if ("csrfToken" in arg && typeof (arg as any).csrfToken === "string") {
        return (arg as any).csrfToken;
      }
      if ("_csrf" in arg && typeof (arg as any)._csrf === "string") {
        return (arg as any)._csrf;
      }
    }
  }
  return null;
}

function tryApplyFreshCookie(context: any, freshCookie: AuthCookieResult) {
  if (!context || !freshCookie) return;
  if (typeof context.appendSetCookie === "function") {
    context.appendSetCookie(freshCookie.header);
  }
  if (context.event?.node?.res?.setHeader) {
    const existing = context.event.node.res.getHeader("Set-Cookie");
    if (!existing) {
      context.event.node.res.setHeader("Set-Cookie", freshCookie.header);
    } else if (Array.isArray(existing)) {
      context.event.node.res.setHeader("Set-Cookie", [...existing, freshCookie.header]);
    } else {
      context.event.node.res.setHeader("Set-Cookie", [existing, freshCookie.header]);
    }
  } else if (context.event?.res?.headers?.append) {
    context.event.res.headers.append("set-cookie", freshCookie.header);
  }
}

export type {
  AuthPageContext,
  ProtectPageOptions,
  ProtectedPageContext
} from "./types.js";


export function createAuth<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
>(options: CreateAuthOptions<TUser, TData>) {
  if (!options.csrf || !options.csrf.allowedOrigins) {
    throw new AuthError(
      "CSRF_CONFIGURATION_INVALID",
      "CSRF configuration is required: csrf.allowedOrigins must be provided in createAuth().",
      500
    );
  }

  const allowedOrigins = validateAllowedOrigins(options.csrf.allowedOrigins);
  const sessionDuration = options.sessionDuration ?? DEFAULT_SESSION_DURATION;
  const absoluteSessionDuration = options.absoluteSessionDuration ?? DEFAULT_ABSOLUTE_SESSION_DURATION;
  const renewBefore = options.renewBefore ?? DEFAULT_RENEW_BEFORE;
  const generateSessionId = options.generateSessionId ?? defaultGenerateSessionId;
  const cookieOptions = {
    ...options.cookie,
    maxAge: options.cookie?.maxAge ?? sessionDuration
  };
  const csrfHeaderName = options.csrf.headerName ?? DEFAULT_CSRF_HEADER_NAME;

  if (sessionDuration <= 0 || absoluteSessionDuration <= 0 || renewBefore < 0) {
    throw new AuthError(
      "AUTH_CONFIGURATION_INVALID",
      "[AdaptiveJS auth] Session durations must be positive and renewBefore cannot be negative.",
      500
    );
  }

  const isProduction = process.env.NODE_ENV === "production";
  validateCookieOptions(
    cookieOptions.name,
    cookieOptions,
    isProduction || Boolean(options.secureDefaults)
  );

  if (isProduction && !options.onAuditEvent) {
    console.warn(
      "[AdaptiveJS auth] Warning: onAuditEvent should be configured in production for security auditing."
    );
  }

  // Renewal concurrency management
  const renewalInFlight = new Map<
    string,
    Promise<ReadSessionResult<TUser, TData>>
  >();
  const renewalGraceCache = new Map<
    string,
    { stored: StoredAuthSession<TData>; freshCookie: AuthCookieResult; user: TUser; expiresAtMs: number }
  >();

  async function audit(
    type: import("./types.js").AuthAuditEventType,
    details: Omit<import("./types.js").AuthAuditEvent, "type" | "at">
  ) {
    if (!options.onAuditEvent) {
      return;
    }

    try {
      await options.onAuditEvent({ type, at: new Date(), ...details });
    } catch {
      // Audit is best-effort. Failures must not break session lifecycle operations.
    }
  }

  async function createSession(
    user: TUser,
    sessionOptions: CreateSessionOptions<TData> = {},
    request?: AuthRequestLike
  ): Promise<{ session: AuthSession<TUser, TData>; cookie: AuthCookieResult }> {
    // Rate limit check
    if (options.rateLimit?.createSession) {
      const ip = extractClientIp(request);
      const evalResult = await evaluateRateLimit(options.rateLimit.createSession, {
        ip,
        userId: user.id,
        user,
        request
      });

      if (!evalResult.allowed) {
        await audit("session.rejected", {
          userId: user.id,
          reason: "rate-limit-exceeded"
        });
        throw new AuthError(
          "RATE_LIMIT_EXCEEDED",
          `Too many session creation attempts. Please try again after ${evalResult.retryAfterSeconds} seconds.`,
          429
        );
      }
    }

    await options.beforeCreateSession?.({ user, request });

    // Session binding extraction
    let binding: StoredSessionBinding | undefined;
    if (options.sessionBinding) {
      binding = {};
      if (options.sessionBinding.userAgent) {
        binding.userAgent = readHeader(request ?? { headers: {} }, "user-agent") ?? undefined;
      }
      if (options.sessionBinding.ip) {
        binding.ip = extractClientIp(request) ?? undefined;
      }
      if (options.sessionBinding.fingerprint) {
        binding.fingerprint = readHeader(request ?? { headers: {} }, "x-client-fingerprint") ?? undefined;
      }
    }

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
      csrfToken: defaultGenerateCsrfToken(),
      binding: sessionOptions.binding ?? binding
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

    // 1. Check grace cache for recently rotated sessions
    const grace = renewalGraceCache.get(sessionId);
    if (grace) {
      if (Date.now() < grace.expiresAtMs) {
        return {
          session: toPublicSession(grace.stored, grace.user),
          freshCookie: grace.freshCookie
        };
      }
      renewalGraceCache.delete(sessionId);
    }

    // 2. Join in-flight renewal if this session is currently being renewed
    const inFlight = renewalInFlight.get(sessionId);
    if (inFlight) {
      return await inFlight;
    }

    const stored = await options.adapter.getSession(sessionId);
    if (!stored) {
      // Check grace cache once more in case it was rotated concurrently
      const raceGrace = renewalGraceCache.get(sessionId);
      if (raceGrace && Date.now() < raceGrace.expiresAtMs) {
        return {
          session: toPublicSession(raceGrace.stored, raceGrace.user),
          freshCookie: raceGrace.freshCookie
        };
      }

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

    // Session binding validation
    if (options.sessionBinding && stored.binding) {
      let mismatchReason: string | null = null;
      if (options.sessionBinding.userAgent && stored.binding.userAgent) {
        const currentUa = readHeader(request, "user-agent");
        if (currentUa && currentUa !== stored.binding.userAgent) {
          mismatchReason = "session-binding-user-agent-mismatch";
        }
      }
      if (!mismatchReason && options.sessionBinding.ip && stored.binding.ip) {
        const currentIp = extractClientIp(request);
        if (currentIp && currentIp !== stored.binding.ip) {
          mismatchReason = "session-binding-ip-mismatch";
        }
      }
      if (!mismatchReason && options.sessionBinding.fingerprint && stored.binding.fingerprint) {
        const currentFp = readHeader(request, "x-client-fingerprint");
        if (currentFp && currentFp !== stored.binding.fingerprint) {
          mismatchReason = "session-binding-fingerprint-mismatch";
        }
      }

      if (mismatchReason) {
        await options.adapter.deleteSession(stored.id);
        await audit("session.rejected", {
          sessionId: stored.id,
          userId: stored.userId,
          reason: mismatchReason
        });
        return {
          session: null,
          freshCookie: createBlankSessionCookie(cookieOptions)
        };
      }
    }

    const remainingSeconds = Math.floor((stored.expiresAt.getTime() - now) / 1000);

    if (remainingSeconds <= renewBefore) {
      const renewalPromise = (async (): Promise<ReadSessionResult<TUser, TData>> => {
        const renewed: StoredAuthSession<TData> = {
          ...stored,
          id: generateSessionId(),
          expiresAt: new Date(Math.min(now + sessionDuration * 1000, stored.absoluteExpiresAt.getTime()))
        };
        await options.adapter.createSession(renewed);
        await options.adapter.deleteSession(stored.id);
        await audit("session.renewed", { sessionId: renewed.id, userId: renewed.userId });

        const freshCookie = createSessionCookie(renewed.id, {
          ...cookieOptions,
          maxAge: Math.max(0, Math.floor((renewed.expiresAt.getTime() - now) / 1000))
        });

        // 15 seconds grace period for parallel in-flight requests
        renewalGraceCache.set(stored.id, {
          stored: renewed,
          freshCookie,
          user,
          expiresAtMs: Date.now() + 15_000
        });

        return {
          session: toPublicSession(renewed, user),
          freshCookie
        };
      })();

      renewalInFlight.set(stored.id, renewalPromise);
      try {
        return await renewalPromise;
      } finally {
        renewalInFlight.delete(stored.id);
      }
    }

    return {
      session: toPublicSession(stored, user),
      freshCookie: undefined
    };
  }

  async function requireSession(
    request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string
  ): Promise<{ session: AuthSession<TUser, TData>; freshCookie?: AuthCookieResult }> {
    const result = await readSession(request);

    if (!result.session) {
      throw new AuthError(
        "AUTHENTICATION_REQUIRED",
        "An authenticated session is required.",
        401
      );
    }

    return {
      session: result.session,
      freshCookie: result.freshCookie
    };
  }

  async function invalidateSession(sessionId: string) {
    const stored = await options.adapter.getSession(sessionId);
    await options.adapter.deleteSession(sessionId);
    renewalGraceCache.delete(sessionId);
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
      renewalGraceCache.delete(sessionId);
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

  async function invalidateUserSessionsExcept(userId: string, currentSessionId: string) {
    if (!options.adapter.deleteUserSessionsExcept) {
      throw new Error(
        "[AdaptiveJS auth] The configured adapter does not implement deleteUserSessionsExcept()."
      );
    }

    await options.adapter.deleteUserSessionsExcept(userId, currentSessionId);
    await audit("session.invalidated", {
      userId,
      sessionId: currentSessionId,
      reason: "other-user-sessions-invalidated"
    });
  }

  async function listUserSessions(userId: string): Promise<ManagedUserSession[]> {
    if (options.adapter.listUserSessions) {
      return options.adapter.listUserSessions(userId);
    }

    throw new Error(
      "[AdaptiveJS auth] The configured adapter does not implement listUserSessions()."
    );
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

    const origin = readHeader(request, "origin");
    if (!origin || !allowedOrigins.has(normalizeOrigin(origin) ?? "")) {
      await audit("csrf.rejected", {
        sessionId: session.id,
        userId: session.userId,
        reason: origin ? "origin" : "origin-missing"
      });
      throw new AuthError(
        "CSRF_ORIGIN_INVALID",
        origin
          ? "The request origin is not allowed."
          : "The request must include a valid Origin header.",
        403
      );
    }

    const stored = await options.adapter.getSession(session.id);
    const token = submittedToken ?? readHeader(request, csrfHeaderName);
    if (!stored || !token || !isSameSecret(stored.csrfToken, token)) {
      await audit("csrf.rejected", { sessionId: session.id, userId: session.userId, reason: "token" });
      throw new AuthError("CSRF_TOKEN_INVALID", "The CSRF token is invalid.", 403);
    }
  }

  // Risk Event Methods
  async function passwordChanged(userId: string) {
    await invalidateUserSessions(userId);
    await audit("session.invalidated", { userId, reason: "password-changed" });
    try {
      await options.onPasswordChanged?.(userId);
    } catch {
      // Best-effort
    }
  }

  async function roleElevated(userId: string) {
    await invalidateUserSessions(userId);
    await audit("session.invalidated", { userId, reason: "role-elevated" });
    try {
      await options.onRoleChanged?.(userId);
    } catch {
      // Best-effort
    }
  }

  async function forceReauth(userId: string, reason = "force-reauth") {
    await invalidateUserSessions(userId);
    await audit("session.invalidated", { userId, reason });
    try {
      await options.onSuspiciousActivity?.(userId, reason);
    } catch {
      // Best-effort
    }
  }

  async function mfaEnabled(userId: string) {
    await invalidateUserSessions(userId);
    await audit("session.invalidated", { userId, reason: "mfa-enabled" });
    try {
      await options.onMfaEnabled?.(userId);
    } catch {
      // Best-effort
    }
  }

  // Session Data Updates
  async function updateSessionData(
    sessionId: string,
    dataOrUpdater: Partial<TData> | ((prev: TData) => Partial<TData>)
  ): Promise<void> {
    const stored = await options.adapter.getSession(sessionId);
    if (!stored) {
      throw new AuthError("AUTHENTICATION_REQUIRED", "Session not found.", 401);
    }
    const nextData = typeof dataOrUpdater === "function"
      ? (dataOrUpdater as (prev: TData) => Partial<TData>)(stored.data)
      : dataOrUpdater;

    const updated: StoredAuthSession<TData> = {
      ...stored,
      data: { ...stored.data, ...nextData }
    };

    await options.adapter.updateSession(updated);
  }

  // Request wrappers & high-level helpers
  async function withSession<TResult = any>(
    request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string,
    handler: (context: {
      session: AuthSession<TUser, TData>;
      freshCookie?: AuthCookieResult;
    }) => Promise<TResult> | TResult
  ): Promise<TResult> {
    const { session, freshCookie } = await requireSession(request);
    const result = await handler({ session, freshCookie });

    if (freshCookie) {
      if (
        typeof request === "object" &&
        request !== null &&
        "appendSetCookie" in request &&
        typeof (request as any).appendSetCookie === "function"
      ) {
        (request as any).appendSetCookie(freshCookie.header);
      }
      if (typeof Response !== "undefined" && result instanceof Response) {
        result.headers.append("Set-Cookie", freshCookie.header);
      }
    }

    return result;
  }

  async function login(
    user: TUser,
    request?: AuthRequestLike,
    sessionOptions?: CreateSessionOptions<TData>
  ) {
    return createSession(user, sessionOptions, request);
  }

  async function logout(
    request: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string
  ) {
    const cookie = await invalidateRequestSession(request);
    return { cookie };
  }

  async function logoutEverywhere(userId: string) {
    await invalidateUserSessions(userId);
  }

  // Protect page helpers
  function handleUnauthenticated(context: AuthPageContext, protection: ProtectPageOptions) {
    if (typeof protection.onUnauthenticated === "function") {
      return protection.onUnauthenticated(context);
    }
    if (protection.onUnauthenticated === "redirect") {
      const currentUrl = context.request?.url;
      const returnTo = protection.returnTo ? currentUrl : undefined;
      const location = buildLoginReturnUrl(protection.redirectTo ?? "/login", returnTo);
      return { __type: "redirect" as const, location, status: 302 };
    }
    if (protection.onUnauthenticated === "401") {
      return { __type: "error" as const, status: 401 };
    }
    return { __type: "not-found" as const };
  }

  function handleForbidden(context: AuthPageContext, protection: ProtectPageOptions) {
    if (typeof protection.onForbidden === "function") {
      return protection.onForbidden(context);
    }
    if (protection.onForbidden === "403") {
      return { __type: "error" as const, status: 403 };
    }
    return { __type: "not-found" as const };
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
          return handleUnauthenticated(context, protection);
        }
        throw error;
      }

      if (!result.session) {
        return handleUnauthenticated(context, protection);
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
        return handleForbidden(context, protection);
      }

      return page({ ...context, session: result.session });
    };
  }

  // Server Action helper
  function action<TReturn = any>(
    optionsOrHandler:
      | AuthActionOptions
      | ((context: AuthActionContext<TUser, TData>) => Promise<TReturn> | TReturn),
    maybeHandler?: (context: AuthActionContext<TUser, TData>) => Promise<TReturn> | TReturn
  ) {
    const actionOptions: AuthActionOptions =
      typeof optionsOrHandler === "function" ? {} : optionsOrHandler;
    const handler =
      typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler!;

    return async (...args: any[]): Promise<TReturn> => {
      const lastArg = args[args.length - 1];
      const isContextArg =
        lastArg &&
        typeof lastArg === "object" &&
        ("event" in lastArg || "request" in lastArg || "node" in lastArg);
      const context = isContextArg ? lastArg : {};
      const actionArgs = isContextArg ? args.slice(0, -1) : args;

      const request = normalizeAuthRequest(
        context?.request ?? context?.event ?? (isContextArg ? undefined : lastArg) ?? actionArgs[0]
      );

      let formData: FormData | undefined;
      for (const arg of actionArgs) {
        if (arg && typeof arg === "object" && typeof (arg as any).entries === "function") {
          formData = arg as FormData;
          break;
        }
      }

      let submittedToken: string | null = null;
      if (formData) {
        submittedToken = extractCsrfFromFormData(formData);
      }
      if (!submittedToken) {
        submittedToken = extractCsrfFromArgs(actionArgs);
      }

      // 1. Require session
      const { session, freshCookie } = await requireSession(request);

      // 2. Require role if specified
      if (actionOptions.roles) {
        for (const role of actionOptions.roles) {
          requireRole(session, role);
        }
      }

      // 3. Require CSRF
      await requireCsrf(request, session, submittedToken);

      // 4. Attach freshCookie if present
      if (freshCookie) {
        tryApplyFreshCookie(context, freshCookie);
      }

      // 5. Execute user handler
      return handler({
        session,
        freshCookie,
        formData,
        request,
        args: actionArgs,
        event: context?.event,
        external: options.adapter

      });
    };
  }

  function protectAction<TArgs extends any[], TReturn>(
    actionFn: (...args: TArgs) => Promise<TReturn> | TReturn,
    protection: { roles?: string[] } = {}
  ) {
    return async (...args: TArgs): Promise<TReturn> => {
      const lastArg = args[args.length - 1];
      const request = normalizeAuthRequest(lastArg);
      const { session } = await requireSession(request);

      if (protection.roles) {
        for (const role of protection.roles) {
          requireRole(session, role);
        }
      }

      return actionFn(...args);
    };
  }

  function protectRoute(
    handler: (context: any) => any,
    protection: ProtectPageOptions = {}
  ) {
    return protectPage(handler, protection);
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
    invalidateUserSessionsExcept,
    listUserSessions,
    getCsrfToken,
    requireCsrf,
    passwordChanged,
    roleElevated,
    forceReauth,
    mfaEnabled,
    updateSessionData,
    withSession,
    login,
    logout,
    logoutEverywhere,
    protectPage,
    protectAction,
    protectRoute,
    action,
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

export {
  buildLoginReturnUrl,
  readReturnToFromSearchParams,
  sanitizeReturnTo
} from "./intended-url.js";
