import type { AdaptiveRequest, AdaptiveResponse, Plugin } from "@adaptivejs/ssr";
import { readCookieValue, serializeAuthCookie } from "./cookies.js";
import { createSessionId, MemoryAuthSessionStore } from "./session-store.js";
import type {
  AdaptiveAuth,
  AdaptiveAuthOptions,
  AdaptiveAuthProvider,
  AuthSessionRecord
} from "./types.js";

const DEFAULT_OPTIONS = {
  basePath: "/auth",
  cookieName: "adaptive_auth",
  cookieMaxAge: 60 * 60 * 24 * 7,
  secureCookies: true,
  sameSite: "lax",
  onErrorRedirectTo: null
} as const;

export function createAdaptiveAuth<User = Record<string, unknown>>(options: AdaptiveAuthOptions<User> = {}): AdaptiveAuth<User> {
  const resolvedOptions = {
    basePath: options.basePath ?? DEFAULT_OPTIONS.basePath,
    cookieName: options.cookieName ?? DEFAULT_OPTIONS.cookieName,
    cookieMaxAge: options.cookieMaxAge ?? DEFAULT_OPTIONS.cookieMaxAge,
    secureCookies: options.secureCookies ?? DEFAULT_OPTIONS.secureCookies,
    sameSite: options.sameSite ?? DEFAULT_OPTIONS.sameSite,
    onErrorRedirectTo: options.onErrorRedirectTo ?? DEFAULT_OPTIONS.onErrorRedirectTo,
    store: options.store ?? new MemoryAuthSessionStore<User>(),
    providers: options.providers ?? []
  };

  const auth: AdaptiveAuth<User> = {
    options: resolvedOptions,
    async createSession(input) {
      const issuedAt = Date.now();
      const sessionId = createSessionId();
      const record: AuthSessionRecord<User> = {
        sessionId,
        user: input.user,
        tokens: input.tokens,
        metadata: input.metadata,
        issuedAt,
        expiresAt: input.tokens.expiresAt ?? issuedAt + resolvedOptions.cookieMaxAge * 1000
      };
      await resolvedOptions.store.set(sessionId, record);
      return record;
    },
    async getSession(request) {
      const sessionId = readSessionId(request, resolvedOptions.cookieName);
      if (!sessionId) return null;
      return await resolvedOptions.store.get(sessionId);
    },
    async getPublicSession(request) {
      const session = await auth.getSession(request);
      return session ? auth.toPublicSession(session) : null;
    },
    async requireSession(request) {
      const session = await auth.getSession(request);
      if (!session) {
        throw new Error("Authentication required.");
      }
      return session;
    },
    async clearSession(response, request) {
      const sessionId = request ? readSessionId(request, resolvedOptions.cookieName) : null;
      if (sessionId) {
        await resolvedOptions.store.delete(sessionId);
      }
      response.setHeader("Set-Cookie", serializeAuthCookie(auth, null));
    },
    applySession(response, session) {
      response.setHeader("Set-Cookie", serializeAuthCookie(auth, session.sessionId));
    },
    toPublicSession(session) {
      return {
        sessionId: session.sessionId,
        user: session.user,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt ?? null
      };
    },
    getProvider(name) {
      return resolvedOptions.providers.find((provider) => provider.name === name) ?? null;
    },
    buildCallbackUrl(request, providerName) {
      const origin = getRequestOrigin(request);
      return `${origin}${resolvedOptions.basePath}/callback/${providerName}`;
    },
    createPlugins() {
      return createAuthPlugins(auth);
    }
  };

  return auth;
}

export function createAuthPlugins<User>(auth: AdaptiveAuth<User>): Plugin[] {
  return [
    {
      path: `${auth.options.basePath}/login/:provider`,
      method: "GET",
      callback: async (req, res) => {
        const providerName = readRouteParam(req.params.provider);
        const provider = providerName ? auth.getProvider(providerName) : null;
        if (!provider) {
          res.status(404).json({ success: false, error: `Unknown auth provider '${providerName ?? "unknown"}'.` });
          return;
        }

        if (!provider.getAuthorizationUrl) {
          res.status(405).json({ success: false, error: `Provider '${provider.name}' does not support redirect login.` });
          return;
        }

        const state = createSessionId();
        const authorizationUrl = await provider.getAuthorizationUrl({
          state,
          callbackUrl: auth.buildCallbackUrl(req, provider.name)
        });

        res.redirect(authorizationUrl);
      }
    },
    {
      path: `${auth.options.basePath}/login/:provider`,
      method: "POST",
      callback: async (req, res) => {
        const providerName = readRouteParam(req.params.provider);
        const provider = providerName ? auth.getProvider(providerName) : null;
        if (!provider) {
          res.status(404).json({ success: false, error: `Unknown auth provider '${providerName ?? "unknown"}'.` });
          return;
        }

        if (!provider.authenticateCredentials) {
          res.status(405).json({ success: false, error: `Provider '${provider.name}' does not support credential login.` });
          return;
        }

        try {
          const credentials = await readCredentialPayload(req);
          const result = await provider.authenticateCredentials({
            credentials,
            request: req
          });
          const session = await auth.createSession({
            user: result.user,
            tokens: result.tokens,
            metadata: result.metadata
          });
          auth.applySession(res, session);

          if (result.redirectTo) {
            res.redirect(result.redirectTo);
            return;
          }

          res.status(200).json({
            success: true,
            provider: provider.name,
            session: auth.toPublicSession(session)
          });
        } catch (error: any) {
          await handleProviderFailure(auth, res, error?.message ?? "Authentication failed.");
        }
      }
    },
    {
      path: `${auth.options.basePath}/callback/:provider`,
      method: "GET",
      callback: async (req, res) => {
        const providerName = readRouteParam(req.params.provider);
        const provider = providerName ? auth.getProvider(providerName) : null;
        if (!provider) {
          res.status(404).json({ success: false, error: `Unknown auth provider '${providerName ?? "unknown"}'.` });
          return;
        }

        if (!provider.exchangeCode) {
          res.status(405).json({ success: false, error: `Provider '${provider.name}' does not support OAuth callback.` });
          return;
        }

        const code = typeof req.query.code === "string" ? req.query.code : null;
        const state = typeof req.query.state === "string" ? req.query.state : null;
        if (!code) {
          await handleProviderFailure(auth, res, "Missing OAuth code.");
          return;
        }

        try {
          const result = await provider.exchangeCode({
            code,
            state,
            callbackUrl: auth.buildCallbackUrl(req, provider.name),
            request: req
          });
          const session = await auth.createSession({
            user: result.user,
            tokens: result.tokens,
            metadata: result.metadata
          });
          auth.applySession(res, session);

          if (result.redirectTo) {
            res.redirect(result.redirectTo);
            return;
          }

          res.status(200).json({
            success: true,
            provider: provider.name,
            session: auth.toPublicSession(session)
          });
        } catch (error: any) {
          await handleProviderFailure(auth, res, error?.message ?? "Authentication failed.");
        }
      }
    },
    {
      path: `${auth.options.basePath}/session`,
      method: "GET",
      callback: async (req, res) => {
        const session = await auth.getPublicSession(req);
        res.status(session ? 200 : 401).json({
          authenticated: Boolean(session),
          session
        });
      }
    },
    {
      path: `${auth.options.basePath}/logout`,
      method: "POST",
      callback: async (req, res) => {
        await auth.clearSession(res, req);
        res.status(200).json({ success: true });
      }
    }
  ];
}

export async function resolveAuthSession<User>(auth: AdaptiveAuth<User>, request: Pick<AdaptiveRequest, "headers">) {
  return auth.getPublicSession(request);
}

export async function requireAuthSession<User>(auth: AdaptiveAuth<User>, request: Pick<AdaptiveRequest, "headers">) {
  return auth.requireSession(request);
}

export function createOAuthProvider<User = Record<string, unknown>>(provider: AdaptiveAuthProvider<User>) {
  return provider;
}

export function createCredentialsProvider<User = Record<string, unknown>>(provider: AdaptiveAuthProvider<User>) {
  return provider;
}

function readSessionId(request: Pick<AdaptiveRequest, "headers">, cookieName: string) {
  const rawCookie = request.headers.cookie;
  return readCookieValue(typeof rawCookie === "string" ? rawCookie : undefined, cookieName);
}

function readRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function handleProviderFailure<User>(auth: AdaptiveAuth<User>, res: AdaptiveResponse, message: string) {
  if (auth.options.onErrorRedirectTo) {
    const separator = auth.options.onErrorRedirectTo.includes("?") ? "&" : "?";
    res.redirect(`${auth.options.onErrorRedirectTo}${separator}error=${encodeURIComponent(message)}`);
    return;
  }

  res.status(400).json({ success: false, error: message });
}

function getRequestOrigin(request: Pick<AdaptiveRequest, "headers">) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" && forwardedProto.length > 0
    ? forwardedProto.split(",")[0]
    : "http";
  const host = request.headers.host;

  if (!host || typeof host !== "string") {
    throw new Error("Missing request host header.");
  }

  return `${protocol}://${host}`;
}

async function readCredentialPayload(request: AdaptiveRequest) {
  const contentTypeHeader = request.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
  const body = await readRequestBody(request);

  if (!contentType || contentType.includes("application/json")) {
    const parsed = body.length > 0 ? JSON.parse(body) : {};
    return normalizeCredentialPayload(parsed);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return normalizeCredentialPayload(Object.fromEntries(new URLSearchParams(body).entries()));
  }

  throw new Error(`Unsupported login payload type '${contentType}'.`);
}

async function readRequestBody(request: AdaptiveRequest) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function normalizeCredentialPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Credential payload must be an object.");
  }

  const output: Record<string, string> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested == null) continue;
    output[key] = String(nested);
  }
  return output;
}
