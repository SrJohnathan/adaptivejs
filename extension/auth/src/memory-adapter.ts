import type {
  AuthAdapter,
  AuthSessionData,
  AuthUser,
  StoredAuthSession
} from "./types.js";

export interface MemoryAuthAdapterOptions<TUser extends AuthUser = AuthUser> {
  users?: Iterable<TUser>;
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
} {
  const users = new Map<string, TUser>();
  const sessions = new Map<string, StoredAuthSession<TData>>();

  for (const user of options.users ?? []) {
    users.set(user.id, user);
  }

  return {
    getUser(userId) {
      return users.get(userId) ?? null;
    },
    getSession(sessionId) {
      return sessions.get(sessionId) ?? null;
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
    setUser(user) {
      users.set(user.id, user);
    },
    deleteUser(userId) {
      users.delete(userId);
    },
    clear() {
      users.clear();
      sessions.clear();
    }
  };
}
