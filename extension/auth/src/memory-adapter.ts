import type {
  AuthAdapter,
  AuthSessionData,
  AuthUser,
  StoredAuthSession
} from "./types.js";

export interface MemoryAuthAdapterOptions<TUser extends AuthUser = AuthUser> {
  users?: Iterable<TUser>;
  isolated?: boolean;
  cleanupIntervalMs?: number;
}

/**
 * Development adapter. Its contents are lost whenever the process restarts.
 */
export function createMemoryAuthAdapter<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
>(options: MemoryAuthAdapterOptions<TUser> = {}): AuthAdapter<TUser, TData> & {
  setUser(user: TUser): void;
  deleteUser(userId: string): void;
  clear(): void;
  cleanup(): number;
  destroy(): void;
} {
  const users = options.isolated
    ? new Map<string, TUser>()
    : (((globalThis as any).__ADAPTIVE_AUTH_MEMORY_USERS__ ??= new Map<string, any>()) as Map<string, TUser>);

  const sessions = options.isolated
    ? new Map<string, StoredAuthSession<TData>>()
    : (((globalThis as any).__ADAPTIVE_AUTH_MEMORY_SESSIONS__ ??= new Map<string, any>()) as Map<string, StoredAuthSession<TData>>);

  for (const user of options.users ?? []) {
    users.set(user.id, user);
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
    getUser(userId) {
      return users.get(userId) ?? null;
    },
    getSession(sessionId) {
      const session = sessions.get(sessionId) ?? null;
      if (!session) return null;
      const now = Date.now();
      if (session.expiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
        sessions.delete(sessionId);
        return null;
      }
      return session;
    },
    createSession(session) {
      sessions.set(session.id, session);
    },
    updateSession(session) {
      sessions.set(session.id, session);
    },
    deleteSession(sessionId) {
      sessions.delete(sessionId);
    },
    deleteUserSessions(userId) {
      for (const [sessionId, session] of sessions) {
        if (session.userId === userId) {
          sessions.delete(sessionId);
        }
      }
    },
    deleteUserSessionsExcept(userId, exceptSessionId) {
      for (const [sessionId, session] of sessions) {
        if (session.userId === userId && sessionId !== exceptSessionId) {
          sessions.delete(sessionId);
        }
      }
    },
    listUserSessions(userId) {
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
    setUser(user) {
      users.set(user.id, user);
    },
    deleteUser(userId) {
      users.delete(userId);
    },
    clear() {
      users.clear();
      sessions.clear();
    },
    cleanup() {
      return cleanupExpiredSessions();
    },
    destroy() {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    }
  };
}
