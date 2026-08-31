import { createMemoryAuthAdapter } from "../dist/memory-adapter.js";
import { createAuth } from "../dist/server.js";
import type { AuthUser } from "../dist/types.js";

export const TEST_ORIGIN = "https://app.example.com";

export function createTestUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "Test User",
    roles: ["member"],
    ...overrides
  };
}

export function createTestAuth(options: {
  users?: AuthUser[];
  csrf?: { allowedOrigins?: string[] };
  sessionDuration?: number;
  renewBefore?: number;
} = {}) {
  const user = createTestUser();
  const adapter = createMemoryAuthAdapter({
    users: options.users ?? [user],
    isolated: true
  });

  const auth = createAuth({
    adapter,
    cookie: {
      name: "adaptive.session.test",
      secure: false
    },
    sessionDuration: options.sessionDuration ?? 60 * 60,
    absoluteSessionDuration: 60 * 60 * 24,
    renewBefore: options.renewBefore ?? 60 * 30,
    csrf: options.csrf ?? {
      allowedOrigins: [TEST_ORIGIN]
    }
  });

  return { auth, adapter, user };
}

export function cookieRequest(sessionId: string) {
  return {
    headers: {
      cookie: `adaptive.session.test=${sessionId}`
    }
  };
}

export function csrfRequest(sessionId: string, csrfToken: string, origin = TEST_ORIGIN) {
  return {
    headers: {
      cookie: `adaptive.session.test=${sessionId}`,
      origin,
      "x-adaptive-csrf-token": csrfToken
    }
  };
}
