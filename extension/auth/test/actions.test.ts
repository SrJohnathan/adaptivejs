import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "../dist/errors.js";
import { createTestAuth, createTestUser, csrfRequest, TEST_ORIGIN } from "./helpers.js";

describe("auth.action helper", () => {
  it("executes action when session and CSRF header are valid", async () => {
    const { auth, user } = createTestAuth();
    const { session, cookie } = await auth.createSession(user);
    const csrfToken = await auth.getCsrfToken(session);

    const updateProfile = auth.action(async ({ session: s, args }) => {
      return { success: true, userId: s.userId, argVal: args[0] };
    });

    const req = csrfRequest(cookie.value, csrfToken);
    const result = await updateProfile("sample-input", { request: req });

    assert.equal(result.success, true);
    assert.equal(result.userId, user.id);
    assert.equal(result.argVal, "sample-input");
  });

  it("extracts CSRF token from FormData", async () => {
    const { auth, user } = createTestAuth();
    const { session, cookie } = await auth.createSession(user);
    const csrfToken = await auth.getCsrfToken(session);

    const saveSettings = auth.action(async ({ session: s, formData }) => {
      return { theme: formData?.get("theme"), user: s.userId };
    });

    const formData = new FormData();
    formData.append("csrfToken", csrfToken);
    formData.append("theme", "dark");

    const req = {
      headers: {
        cookie: `adaptive.session.test=${cookie.value}`,
        origin: TEST_ORIGIN
      }
    };

    const result = await saveSettings(formData, { request: req });
    assert.equal(result.theme, "dark");
    assert.equal(result.user, user.id);
  });

  it("rejects when unauthenticated", async () => {
    const { auth } = createTestAuth();

    const protectedAction = auth.action(async () => {
      return "should-not-run";
    });

    await assert.rejects(
      () => protectedAction({ request: { headers: {} } }),
      (err: unknown) => err instanceof AuthError && err.code === "AUTHENTICATION_REQUIRED"
    );
  });

  it("rejects when CSRF is missing or invalid", async () => {
    const { auth, user } = createTestAuth();
    const { cookie } = await auth.createSession(user);

    const sensitiveAction = auth.action(async () => "done");

    // Missing origin
    await assert.rejects(
      () => sensitiveAction({
        request: {
          headers: {
            cookie: `adaptive.session.test=${cookie.value}`
          }
        }
      }),
      (err: unknown) => err instanceof AuthError && err.code === "CSRF_ORIGIN_INVALID"
    );

    // Invalid token
    await assert.rejects(
      () => sensitiveAction({
        request: {
          headers: {
            cookie: `adaptive.session.test=${cookie.value}`,
            origin: TEST_ORIGIN,
            "x-adaptive-csrf-token": "wrong-token"
          }
        }
      }),
      (err: unknown) => err instanceof AuthError && err.code === "CSRF_TOKEN_INVALID"
    );
  });

  it("enforces required roles in action options", async () => {
    const normalUser = createTestUser({ id: "normal-1", roles: ["member"] });
    const adminUser = createTestUser({ id: "admin-1", roles: ["admin"] });

    const { auth } = createTestAuth({ users: [normalUser, adminUser] });
    const normalSession = await auth.createSession(normalUser);
    const adminSession = await auth.createSession(adminUser);

    const normalCsrf = await auth.getCsrfToken(normalSession.session);
    const adminCsrf = await auth.getCsrfToken(adminSession.session);

    const adminOnlyAction = auth.action({ roles: ["admin"] }, async ({ session: s }) => {
      return { ok: true, admin: s.userId };
    });

    // Normal user should fail with AUTHORIZATION_FAILED
    await assert.rejects(
      () => adminOnlyAction({
        request: csrfRequest(normalSession.cookie.value, normalCsrf)
      }),
      (err: unknown) => err instanceof AuthError && err.code === "AUTHORIZATION_FAILED"
    );

    // Admin should succeed
    const result = await adminOnlyAction({
      request: csrfRequest(adminSession.cookie.value, adminCsrf)
    });
    assert.equal(result.ok, true);
    assert.equal(result.admin, "admin-1");
  });

  it("action context includes the configured adapter", async () => {
    const { auth, user, adapter } = createTestAuth();
    const { session, cookie } = await auth.createSession(user);
    const csrfToken = await auth.getCsrfToken(session);

    const checkContext = auth.action(async (ctx) => {
      return {
        hasAdapter: "adapter" in ctx,
        isSameAdapter: ctx.adapter === adapter
      };
    });

    const result = await checkContext({ request: csrfRequest(cookie.value, csrfToken) });
    assert.equal(result.hasAdapter, true);
    assert.equal(result.isSameAdapter, true);
  });
});
