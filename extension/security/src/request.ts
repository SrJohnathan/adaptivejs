import type { SecurityEventLike, SecurityRequestLike } from "./types.js";

export function normalizeSecurityRequest(
  input?: SecurityRequestLike | SecurityEventLike | Headers | Record<string, string | string[] | undefined>,
): SecurityRequestLike {
  if (!input) return {};

  if (input instanceof Headers) {
    return { headers: input };
  }

  if ("node" in input || "req" in input || "res" in input) {
    const event = input as SecurityEventLike;
    return {
      headers:
        event.req?.headers ??
        event.node?.req?.headers ??
        event.headers,
      method: event.method ?? event.req?.method ?? event.node?.req?.method,
      url: event.path ?? event.req?.url ?? event.node?.req?.url,
    };
  }

  if ("headers" in input || "method" in input || "url" in input) {
    return input as SecurityRequestLike;
  }

  return { headers: input as Record<string, string | string[] | undefined> };
}

export function getRequestHeader(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  const val =
    headers[name] ??
    headers[name.toLowerCase()] ??
    headers[name.toUpperCase()];

  return Array.isArray(val) ? val[0] ?? null : val ?? null;
}

export function extractClientIp(
  request?: SecurityRequestLike | SecurityEventLike | Headers | Record<string, string | string[] | undefined>,
): string {
  const normalized = normalizeSecurityRequest(request);
  const xff = getRequestHeader(normalized.headers, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp =
    getRequestHeader(normalized.headers, "x-real-ip") ??
    getRequestHeader(normalized.headers, "cf-connecting-ip");

  return realIp?.trim() || "unknown";
}

export function isHttpsRequest(
  request?: SecurityRequestLike | SecurityEventLike,
): boolean {
  const normalized = normalizeSecurityRequest(request);
  const forwardedProto = getRequestHeader(normalized.headers, "x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
  }

  const url = normalized.url;
  if (url) {
    try {
      return new URL(url, "http://localhost").protocol === "https:";
    } catch {
      return false;
    }
  }

  return false;
}

export function resolveResponseTarget(
  target: SecurityEventLike | { setHeader?: (name: string, value: string) => void },
): { setHeader(name: string, value: string): void } | null {
  const event = target as any;

  if (typeof event.setHeader === "function") {
    return { setHeader: (name, value) => event.setHeader(name, value) };
  }

  if (event.node?.res?.setHeader) {
    return { setHeader: (name, value) => event.node.res.setHeader(name, value) };
  }

  if (event.res?.headers?.set) {
    return {
      setHeader: (name, value) => event.res.headers.set(name, value),
    };
  }

  return null;
}

