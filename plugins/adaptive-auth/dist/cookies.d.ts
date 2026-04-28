import type { AdaptiveAuth } from "./types.js";
export declare function readCookieValue(cookieHeader: string | undefined, cookieName: string): string | null;
export declare function serializeAuthCookie(auth: AdaptiveAuth<any>, sessionId: string | null): string;
