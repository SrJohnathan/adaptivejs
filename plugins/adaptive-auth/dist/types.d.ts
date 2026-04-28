import type { AdaptiveRequest, AdaptiveResponse, Plugin } from "@adaptivejs/ssr";
export type AuthTokenSet = {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: number | null;
    tokenType?: string | null;
    scope?: string | null;
};
export type PublicAuthSession<User = Record<string, unknown>> = {
    sessionId: string;
    user: User;
    issuedAt: number;
    expiresAt?: number | null;
};
export type AuthSessionRecord<User = Record<string, unknown>> = PublicAuthSession<User> & {
    tokens: AuthTokenSet;
    metadata?: Record<string, unknown>;
};
export interface AuthSessionStore<User = Record<string, unknown>> {
    get(sessionId: string): Promise<AuthSessionRecord<User> | null> | AuthSessionRecord<User> | null;
    set(sessionId: string, record: AuthSessionRecord<User>): Promise<void> | void;
    delete(sessionId: string): Promise<void> | void;
}
export interface AdaptiveAuthOptions<User = Record<string, unknown>> {
    basePath?: string;
    cookieName?: string;
    cookieMaxAge?: number;
    secureCookies?: boolean;
    sameSite?: "strict" | "lax" | "none";
    store?: AuthSessionStore<User>;
    providers?: AdaptiveAuthProvider<User>[];
    onErrorRedirectTo?: string | null;
}
export type ProviderAuthorizeContext = {
    state: string;
    callbackUrl: string;
};
export type ProviderCredentialsContext = {
    credentials: Record<string, string>;
    request: Pick<AdaptiveRequest, "headers" | "query" | "params" | "originalUrl">;
};
export type ProviderCallbackContext = {
    code: string;
    state?: string | null;
    callbackUrl: string;
    request: Pick<AdaptiveRequest, "headers" | "query" | "params" | "originalUrl">;
};
export type ProviderCallbackResult<User = Record<string, unknown>> = {
    user: User;
    tokens: AuthTokenSet;
    metadata?: Record<string, unknown>;
    redirectTo?: string | null;
};
export interface AdaptiveAuthProvider<User = Record<string, unknown>> {
    name: string;
    getAuthorizationUrl?(context: ProviderAuthorizeContext): string | Promise<string>;
    exchangeCode?(context: ProviderCallbackContext): Promise<ProviderCallbackResult<User>>;
    authenticateCredentials?(context: ProviderCredentialsContext): Promise<ProviderCallbackResult<User>>;
}
export interface AdaptiveAuth<User = Record<string, unknown>> {
    options: Required<Omit<AdaptiveAuthOptions<User>, "store" | "providers">> & {
        store: AuthSessionStore<User>;
        providers: AdaptiveAuthProvider<User>[];
    };
    createSession(input: {
        user: User;
        tokens: AuthTokenSet;
        metadata?: Record<string, unknown>;
    }): Promise<AuthSessionRecord<User>>;
    getSession(request: Pick<AdaptiveRequest, "headers">): Promise<AuthSessionRecord<User> | null>;
    getPublicSession(request: Pick<AdaptiveRequest, "headers">): Promise<PublicAuthSession<User> | null>;
    requireSession(request: Pick<AdaptiveRequest, "headers">): Promise<AuthSessionRecord<User>>;
    clearSession(response: Pick<AdaptiveResponse, "setHeader">, request?: Pick<AdaptiveRequest, "headers">): Promise<void>;
    applySession(response: Pick<AdaptiveResponse, "setHeader">, session: AuthSessionRecord<User>): void;
    toPublicSession(session: AuthSessionRecord<User>): PublicAuthSession<User>;
    getProvider(name: string): AdaptiveAuthProvider<User> | null;
    buildCallbackUrl(request: Pick<AdaptiveRequest, "headers">, providerName: string): string;
    createPlugins(): Plugin[];
}
