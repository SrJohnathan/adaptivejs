import type { AdaptiveRequest, Plugin } from "@adaptivejs/ssr";
import type { AdaptiveAuth, AdaptiveAuthOptions, AdaptiveAuthProvider, AuthSessionRecord } from "./types.js";
export declare function createAdaptiveAuth<User = Record<string, unknown>>(options?: AdaptiveAuthOptions<User>): AdaptiveAuth<User>;
export declare function createAuthPlugins<User>(auth: AdaptiveAuth<User>): Plugin[];
export declare function resolveAuthSession<User>(auth: AdaptiveAuth<User>, request: Pick<AdaptiveRequest, "headers">): Promise<import("./types.js").PublicAuthSession<User> | null>;
export declare function requireAuthSession<User>(auth: AdaptiveAuth<User>, request: Pick<AdaptiveRequest, "headers">): Promise<AuthSessionRecord<User>>;
export declare function createOAuthProvider<User = Record<string, unknown>>(provider: AdaptiveAuthProvider<User>): AdaptiveAuthProvider<User>;
export declare function createCredentialsProvider<User = Record<string, unknown>>(provider: AdaptiveAuthProvider<User>): AdaptiveAuthProvider<User>;
