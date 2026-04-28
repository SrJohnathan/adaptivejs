import type { PublicAuthSession } from "./types.js";
export type AuthFetchResult<User = Record<string, unknown>> = {
    authenticated: boolean;
    session: PublicAuthSession<User> | null;
};
export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
export type UseAuthOptions<User = Record<string, unknown>> = {
    basePath?: string;
    initialData?: PublicAuthSession<User> | null;
    immediate?: boolean;
};
export declare function fetchAuthSession<User = Record<string, unknown>>(basePath?: string): Promise<AuthFetchResult<User>>;
export declare function useAuth<User = Record<string, unknown>>(options?: UseAuthOptions<User>): {
    data: () => PublicAuthSession<User> | null;
    status: () => AuthStatus;
    authenticated: () => boolean;
    error: () => string | null;
    refresh: () => Promise<AuthFetchResult<User>>;
    signOut: () => Promise<void>;
};
