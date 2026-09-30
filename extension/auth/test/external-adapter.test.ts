import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "../dist/errors.js";
import {
  createApiExternalAdapter,
  createExternalAuthAdapter
} from "../dist/external-adapter.js";
import { createAuth } from "../dist/server.js";
import type {
  AuthAdapter,
  AuthUser,
  StoredAuthSession
} from "../dist/types.js";
import { csrfRequest, TEST_ORIGIN } from "./helpers.js";

interface CustomUser extends AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

describe("createExternalAuthAdapter", () => {
  it("authenticates against external API and persists session in createAuth", async () => {
    const mockFetch: typeof globalThis.fetch = async (url, init) => {
      assert.equal(url.toString(), "http://localhost:3001/api/v1/auth/login");
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.email, "test@external.com");
      assert.equal(body.password, "pass123");

      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: "ext-usr-100",
            email: "test@external.com",
            name: "External User",
            roles: ["member"]
          },
          token: "jwt_external_access_token"
        }),
        text: async () => ""
      } as any;
    };

    const adapter = createExternalAuthAdapter<CustomUser>({
      baseUrl: "http://localhost:3001",
      loginPath: "/api/v1/auth/login",
      fetch: mockFetch,
      isolated: true
    });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] }
    });

    // 1. Login via adapter directly
    const loginResult = await adapter.login({
      email: "test@external.com",
      password: "pass123"
    });

    assert.equal(loginResult.user.id, "ext-usr-100");
    assert.equal(loginResult.token, "jwt_external_access_token");
    assert.equal(adapter.token, "jwt_external_access_token");

    // 2. Create session with the authenticated user
    const { session, cookie } = await auth.createSession(loginResult.user, {
      data: { authToken: loginResult.token }
    });

    assert.equal(session.userId, "ext-usr-100");
    assert.equal(session.data.authToken, "jwt_external_access_token");

    // 3. Read session from cookie
    const read = await auth.readSession({
      headers: { cookie: `adaptive.session.test=${cookie.value}` }
    });
    assert.equal(read.session?.userId, "ext-usr-100");
    assert.equal(read.session?.user.email, "test@external.com");
  });

  it("supports auth.login(credentials) directly with external adapter", async () => {
    const mockFetch: typeof globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: "auto-usr-1",
            email: "auto@test.com",
            roles: ["admin"]
          },
          token: "auto_token_999"
        }),
        text: async () => ""
      } as any;
    };

    const adapter = createExternalAuthAdapter<CustomUser>({
      baseUrl: "http://localhost:3001",
      fetch: mockFetch,
      isolated: true
    });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] }
    });

    // Directly login with credentials through auth.login()
    const { session, cookie } = await auth.login({
      email: "auto@test.com",
      password: "secret"
    });

    assert.equal(session.userId, "auto-usr-1");
    assert.equal(session.data.authToken, "auto_token_999");
    assert.ok(cookie.value.length > 0);
  });

  it("supports user registration via adapter.register()", async () => {
    const mockFetch: typeof globalThis.fetch = async (url, init) => {
      assert.equal(url.toString(), "http://localhost:3001/api/v1/auth/register");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.name, "New User");

      return {
        ok: true,
        status: 201,
        json: async () => ({
          user: { id: "reg-1", email: "new@test.com", name: "New User", roles: [] },
          token: "token_reg_1"
        }),
        text: async () => ""
      } as any;
    };

    const adapter = createExternalAuthAdapter<CustomUser>({
      baseUrl: "http://localhost:3001",
      registerPath: "/api/v1/auth/register",
      fetch: mockFetch,
      isolated: true
    });

    const regResult = await adapter.register!({
      email: "new@test.com",
      password: "password123",
      name: "New User"
    });

    assert.equal(regResult.user.id, "reg-1");
    assert.equal(regResult.token, "token_reg_1");
  });

  it("exposes adapter in auth.action context", async () => {
    const adapter = createExternalAuthAdapter<CustomUser>({
      baseUrl: "http://localhost:3001",
      isolated: true
    });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] }
    });

    const user: CustomUser = { id: "action-usr", email: "act@test.com", name: "Act", roles: [] };
    const { session, cookie } = await auth.createSession(user);
    const csrfToken = await auth.getCsrfToken(session);

    const testAction = auth.action(async ({ adapter: actAdapter }) => {
      return { isAdapter: actAdapter === adapter };
    });

    const result = await testAction({ request: csrfRequest(cookie.value, csrfToken) });
    assert.equal(result.isAdapter, true);
  });

  it("supports custom request function in createExternalAuthAdapter", async () => {
    const adapter = createExternalAuthAdapter<CustomUser>({
      request: async ({ email, password }) => {
        assert.equal(email, "custom-fn@test.com");
        assert.equal(password, "custom-pass");
        return {
          id: "custom-fn-usr",
          email: "custom-fn@test.com",
          name: "Custom Function User",
          roles: ["admin"]
        };
      },
      isolated: true
    });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] }
    });

    const { user, session, cookie } = await auth.login({
      email: "custom-fn@test.com",
      password: "custom-pass"
    });

    assert.equal(user.id, "custom-fn-usr");
    assert.equal(session.userId, "custom-fn-usr");
    assert.ok(cookie.value.length > 0);

    // Logout
    const logoutRes = await auth.logout();
    assert.equal(logoutRes.cookie.value, "");
  });

  it("provides createApiExternalAdapter as alias", () => {
    const adapter = createApiExternalAdapter({
      baseUrl: "http://localhost:3001",
      isolated: true
    });
    assert.equal(typeof adapter.login, "function");
    assert.equal(typeof adapter.getSession, "function");
  });
});

describe("User Custom Adapter", () => {
  it("supports completely custom AuthAdapter implementation", async () => {
    const sessions = new Map<string, StoredAuthSession>();
    const users = new Map<string, AuthUser>([
      ["custom-1", { id: "custom-1", email: "custom@db.local", roles: ["superadmin"] }]
    ]);

    // Developer creates their own adapter without any provider concepts
    const myDatabaseAdapter: AuthAdapter = {
      async getUser(userId) {
        return users.get(userId) ?? null;
      },
      async getSession(sessionId) {
        return sessions.get(sessionId) ?? null;
      },
      async createSession(session) {
        sessions.set(session.id, session);
      },
      async updateSession(session) {
        sessions.set(session.id, session);
      },
      async deleteSession(sessionId) {
        sessions.delete(sessionId);
      }
    };

    const auth = createAuth({
      adapter: myDatabaseAdapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] }
    });

    const user = users.get("custom-1")!;
    const { session, cookie } = await auth.createSession(user);

    assert.equal(session.userId, "custom-1");
    assert.equal(sessions.has(session.id), true);

    const read = await auth.readSession({
      headers: { cookie: `adaptive.session.test=${cookie.value}` }
    });
    assert.equal(read.session?.userId, "custom-1");

    await auth.invalidateSession(session.id);
    assert.equal(sessions.has(session.id), false);
  });
});
