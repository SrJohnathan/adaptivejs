import type { AdaptiveAuth } from "./types.js";

export function readCookieValue(cookieHeader: string | undefined, cookieName: string) {
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part.startsWith(`${cookieName}=`)) continue;
    return decodeURIComponent(part.slice(cookieName.length + 1));
  }

  return null;
}

export function serializeAuthCookie(auth: AdaptiveAuth<any>, sessionId: string | null) {
  const { cookieName, cookieMaxAge, secureCookies, sameSite } = auth.options;
  const segments = [
    `${cookieName}=${encodeURIComponent(sessionId ?? "")}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`
  ];

  if (secureCookies) {
    segments.push("Secure");
  }

  if (sessionId) {
    segments.push(`Max-Age=${cookieMaxAge}`);
  } else {
    segments.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    segments.push("Max-Age=0");
  }

  return segments.join("; ");
}
