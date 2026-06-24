import type { AuthCookieOptions, AuthCookieResult, AuthRequestLike } from "./types.js";

export const DEFAULT_AUTH_COOKIE_NAME = "adaptive.session";

export const DEFAULT_AUTH_COOKIE_OPTIONS: Required<
  Pick<AuthCookieOptions, "path" | "sameSite" | "secure" | "httpOnly">
> = {
  path: "/",
  sameSite: "lax",
  secure: true,
  httpOnly: true
};

export function readCookieHeader(
  source: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string
) {
  if (typeof source === "string") {
    return source;
  }

  let headers: Headers | Record<string, string | string[] | undefined>;

  if (source instanceof Headers) {
    headers = source;
  } else {
    const possibleRequest = source as Partial<AuthRequestLike>;
    const requestHeaders = possibleRequest.headers;

    headers = (
      requestHeaders instanceof Headers ||
      (typeof requestHeaders === "object" && requestHeaders !== null && !Array.isArray(requestHeaders))
    )
      ? requestHeaders
      : source as Record<string, string | string[] | undefined>;
  }

  if (headers instanceof Headers) {
    return headers.get("cookie") ?? "";
  }

  const value = headers.cookie ?? headers.Cookie;
  return Array.isArray(value) ? value.join("; ") : value ?? "";
}

export function parseCookies(cookieHeader: string) {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

export function getCookie(
  source: AuthRequestLike | Headers | Record<string, string | string[] | undefined> | string,
  name: string
) {
  return parseCookies(readCookieHeader(source))[name] ?? null;
}

export function serializeCookie(name: string, value: string, options: AuthCookieOptions = {}) {
  const path = options.path ?? DEFAULT_AUTH_COOKIE_OPTIONS.path;
  const sameSite = options.sameSite ?? DEFAULT_AUTH_COOKIE_OPTIONS.sameSite;
  const secure = options.secure ?? DEFAULT_AUTH_COOKIE_OPTIONS.secure;
  const httpOnly = options.httpOnly ?? DEFAULT_AUTH_COOKIE_OPTIONS.httpOnly;
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  parts.push(`SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`);

  if (secure) {
    parts.push("Secure");
  }

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  return parts.join("; ");
}

export function createSessionCookie(
  sessionId: string,
  options: AuthCookieOptions = {}
): AuthCookieResult {
  const name = options.name ?? DEFAULT_AUTH_COOKIE_NAME;

  return {
    name,
    value: sessionId,
    header: serializeCookie(name, sessionId, options)
  };
}

export function createBlankSessionCookie(options: AuthCookieOptions = {}): AuthCookieResult {
  const name = options.name ?? DEFAULT_AUTH_COOKIE_NAME;
  const blankOptions = { ...options, maxAge: 0 };

  return {
    name,
    value: "",
    header: serializeCookie(name, "", blankOptions)
  };
}
