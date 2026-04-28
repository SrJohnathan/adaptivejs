import type { AuthSessionRecord, AuthSessionStore } from "./types.js";
export declare class MemoryAuthSessionStore<User = Record<string, unknown>> implements AuthSessionStore<User> {
    private readonly sessions;
    get(sessionId: string): Promise<AuthSessionRecord<User> | null>;
    set(sessionId: string, record: AuthSessionRecord<User>): Promise<void>;
    delete(sessionId: string): Promise<void>;
}
export declare function createSessionId(): `${string}-${string}-${string}-${string}-${string}`;
