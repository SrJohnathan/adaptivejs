import type {
  AuthAdapter,
  AuthSessionData,
  AuthUser,
  ExternalAuthAdapter,
  ExternalAuthInput,
  ExternalAuthResult,
  StoredAuthSession
} from "./types.js";

export interface ExternalAuthAdapterOptions<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
> {
  id?: string;
  /**
   * Base URL of the external auth API (e.g., "http://localhost:3001" or "https://auth.example.com").
   * Optional if a custom `request` function is provided.
   */
  baseUrl?: string;

  /**
   * Endpoint path for user login when using baseUrl.
   * @default "/api/v1/auth/login"
   */
  loginPath?: string;

  /**
   * Endpoint path for user registration when using baseUrl.
   * @default "/api/v1/auth/register"
   */
  registerPath?: string;

  /**
   * Endpoint path for refreshing tokens when using baseUrl.
   * @default "/api/v1/auth/refresh"
   */
  refreshPath?: string;

  /** Initial auth token (optional) */
  token?: string;

  /**
   * Custom request / login handler.
   * If provided, takes precedence over the default fetch(baseUrl + loginPath).
   *
   * @example
   * ```ts
   * request: async ({ email, password }) => {
   *   const res = await fetch("http://localhost:3001/api/v1/auth/login", { ... });
   *   return res.json(); // or AppUser
   * }
   * ```
   */
  request?: (input: ExternalAuthInput) => Promise<TUser | ExternalAuthResult<TUser> | unknown>;

  /**
   * Custom register handler.
   * If provided, takes precedence over fetch(baseUrl + registerPath).
   */
  register?: (input: ExternalAuthInput) => Promise<TUser | ExternalAuthResult<TUser> | unknown>;

  /**
   * Custom refresh handler.
   */
  refresh?: (input: ExternalAuthInput) => Promise<TUser | ExternalAuthResult<TUser> | unknown>;

  /**
   * Transform the API response payload into an AuthUser object.
   */
  mapUser?: (payload: unknown) => TUser;

  /**
   * Extract the token from the API response payload.
   */
  mapToken?: (payload: unknown) => string | undefined;

  /**
   * Custom fetch function (defaults to globalThis.fetch).
   */
  fetch?: typeof globalThis.fetch;

  /**
   * If true, keeps sessions in a local Map instead of global process cache. Useful for tests.
   */
  isolated?: boolean;

  /** Interval to clean up expired local sessions (in ms). Default: 60_000 */
  cleanupIntervalMs?: number;
}

/**
 * Creates an External Auth Adapter that delegates user authentication,
 * registration and token management to an external HTTP API (such as Rust Axum,
 * Go, FastAPI, etc.) or a custom `request` function, while maintaining local
 * session persistence for AdaptiveJS SSR.
 *
 * @example
 * ```ts
 * export const adapter = createExternalAuthAdapter<AppUser>({
 *   baseUrl: process.env.AUTH_SERVICE_URL ?? "http://localhost:3001",
 *   loginPath: "/api/v1/auth/login",
 *   registerPath: "/api/v1/auth/register",
 *   mapUser: (res: any) => res.user,
 *   mapToken: (res: any) => res.token,
 * });
 *
 * export const auth = createAuth({
 *   adapter, // Single adapter! No separate providers.
 *   csrf: { allowedOrigins: ["http://localhost:3000"] },
 * });
 * ```
 */
export function createExternalAuthAdapter<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
>(options: ExternalAuthAdapterOptions<TUser, TData>): ExternalAuthAdapter<TUser, TData> {
  const baseUrl = options.baseUrl ? options.baseUrl.replace(/\/+$/, "") : "";
  const loginPath = options.loginPath ?? "/api/v1/auth/login";
  const registerPath = options.registerPath ?? "/api/v1/auth/register";
  const refreshPath = options.refreshPath ?? "/api/v1/auth/refresh";
  const fetchFn = options.fetch ?? globalThis.fetch;

  let currentToken: string | undefined = options.token;

  const users = options.isolated
    ? new Map<string, TUser>()
    : (((globalThis as any).__ADAPTIVE_AUTH_EXTERNAL_USERS__ ??= new Map<string, any>()) as Map<string, TUser>);

  const sessions = options.isolated
    ? new Map<string, StoredAuthSession<TData>>()
    : (((globalThis as any).__ADAPTIVE_AUTH_EXTERNAL_SESSIONS__ ??= new Map<string, any>()) as Map<string, StoredAuthSession<TData>>);

  const defaultMapUser = (payload: unknown): TUser => {
    const raw = (payload as any)?.user ?? payload;
    return {
      id: String(raw?.id ?? ""),
      email: raw?.email ? String(raw.email) : undefined,
      name: raw?.name ? String(raw.name) : undefined,
      roles: Array.isArray(raw?.roles) ? raw.roles.map(String) : [],
      ...(typeof raw === "object" ? raw : {})
    } as TUser;
  };

  const defaultMapToken = (payload: unknown): string | undefined => {
    const token = (payload as any)?.token ?? (payload as any)?.access_token ?? (payload as any)?.authToken;
    return typeof token === "string" && token.length > 0 ? token : undefined;
  };

  const mapUser = options.mapUser ?? defaultMapUser;
  const mapToken = options.mapToken ?? defaultMapToken;

  function processPayload(payload: unknown): ExternalAuthResult<TUser> {
    if (payload && typeof payload === "object" && "user" in payload && (payload as any).user) {
      const user = (payload as any).user as TUser;
      const token = (payload as any).token ?? mapToken(payload);
      if (token) currentToken = token;
      if (user?.id) users.set(user.id, user);
      return {
        user,
        token,
        data: typeof payload === "object" ? (payload as Record<string, unknown>) : undefined
      };
    }

    const user = mapUser(payload);
    const token = mapToken(payload);

    if (token) {
      currentToken = token;
    }

    if (user?.id) {
      users.set(user.id, user);
    }

    return {
      user,
      token,
      data: typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : undefined
    };
  }

  async function postApi(path: string, body: Record<string, unknown>): Promise<ExternalAuthResult<TUser>> {
    if (!baseUrl) {
      throw new Error(`[ExternalAuthAdapter] Neither baseUrl nor custom request function was provided.`);
    }

    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (currentToken) {
      headers["Authorization"] = `Bearer ${currentToken}`;
    }

    const response = await fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => String(response.status));
      throw new Error(`[ExternalAuthAdapter] HTTP ${response.status} from ${url} — ${errorText}`);
    }

    const json = await response.json();
    return processPayload(json);
  }

  function cleanupExpiredSessions(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, session] of sessions) {
      if (session.expiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
        sessions.delete(id);
        count += 1;
      }
    }
    return count;
  }

  let cleanupTimer: NodeJS.Timeout | null = null;
  const interval = options.cleanupIntervalMs ?? 60_000;
  if (interval > 0 && typeof setInterval !== "undefined") {
    cleanupTimer = setInterval(cleanupExpiredSessions, interval);
    if (cleanupTimer && typeof cleanupTimer.unref === "function") {
      cleanupTimer.unref();
    }
  }

  return {
    id: options.id ?? "external",

    get token() {
      return currentToken;
    },

    async login(input: ExternalAuthInput): Promise<ExternalAuthResult<TUser>> {
      if (options.request) {
        const payload = await options.request(input);
        return processPayload(payload);
      }
      return postApi(loginPath, input);
    },

    async register(input: ExternalAuthInput): Promise<ExternalAuthResult<TUser>> {
      if (options.register) {
        const payload = await options.register(input);
        return processPayload(payload);
      }
      return postApi(registerPath, input);
    },

    async refresh(input: ExternalAuthInput = {}): Promise<ExternalAuthResult<TUser>> {
      if (options.refresh) {
        const payload = await options.refresh(input);
        return processPayload(payload);
      }
      return postApi(refreshPath, input);
    },

    async request(
      endpointOrInput: string | ExternalAuthInput,
      input?: ExternalAuthInput
    ): Promise<ExternalAuthResult<TUser>> {
      if (typeof endpointOrInput === "string") {
        return postApi(endpointOrInput, input ?? {});
      }
      // If called as request({ email, password })
      return this.login(endpointOrInput);
    },

    getUser(userId: string) {
      return users.get(userId) ?? null;
    },

    getSession(sessionId: string) {
      const session = sessions.get(sessionId) ?? null;
      if (!session) return null;
      const now = Date.now();
      if (session.expiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
        sessions.delete(sessionId);
        return null;
      }
      return session;
    },

    createSession(session: StoredAuthSession<TData>) {
      sessions.set(session.id, session);
    },

    updateSession(session: StoredAuthSession<TData>) {
      sessions.set(session.id, session);
    },

    deleteSession(sessionId: string) {
      sessions.delete(sessionId);
    },

    deleteUserSessions(userId: string) {
      for (const [sessionId, session] of sessions) {
        if (session.userId === userId) {
          sessions.delete(sessionId);
        }
      }
    },

    deleteUserSessionsExcept(userId: string, exceptSessionId: string) {
      for (const [sessionId, session] of sessions) {
        if (session.userId === userId && sessionId !== exceptSessionId) {
          sessions.delete(sessionId);
        }
      }
    },

    listUserSessions(userId: string) {
      const now = Date.now();
      const result = [];
      for (const [sessionId, session] of sessions) {
        if (session.userId === userId) {
          if (session.expiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
            sessions.delete(sessionId);
            continue;
          }
          result.push({
            id: session.id,
            userId: session.userId,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            absoluteExpiresAt: session.absoluteExpiresAt
          });
        }
      }
      return result;
    },

    setUser(user: TUser) {
      users.set(user.id, user);
    },

    deleteUser(userId: string) {
      users.delete(userId);
    },

    clear() {
      users.clear();
      sessions.clear();
      currentToken = undefined;
    },

    destroy() {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    }
  };
}

/**
 * Backward compatibility alias for createExternalAuthAdapter.
 */
export const createApiExternalAdapter = createExternalAuthAdapter;
