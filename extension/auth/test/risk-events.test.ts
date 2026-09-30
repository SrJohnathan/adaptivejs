import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryAuthAdapter } from "../dist/memory-adapter.js";
import { createAuth } from "../dist/server.js";
import { cookieRequest, createTestUser, TEST_ORIGIN } from "./helpers.js";

describe("risk event methods and hooks", () => {
  it("passwordChanged invalidates sessions and calls onPasswordChanged", async () => {
    let hookUserId = "";
    const auditReasons: string[] = [];
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user], isolated: true });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] },
      onAuditEvent(event) {
        if (event.reason) auditReasons.push(event.reason);
      },
      onPasswordChanged(id) {
        hookUserId = id;
      }
    });

    const { cookie } = await auth.createSession(user);
    assert.ok((await auth.readSession(cookieRequest(cookie.value))).session);

    await auth.passwordChanged(user.id);

    // Session must be gone
    assert.equal((await auth.readSession(cookieRequest(cookie.value))).session, null);
    assert.equal(hookUserId, user.id);
    assert.ok(auditReasons.includes("password-changed"));
  });

  it("roleElevated, forceReauth and mfaEnabled invalidate sessions and fire hooks", async () => {
    const firedHooks: string[] = [];
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user], isolated: true });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] },
      onRoleChanged() {
        firedHooks.push("role");
      },
      onSuspiciousActivity() {
        firedHooks.push("suspicious");
      },
      onMfaEnabled() {
        firedHooks.push("mfa");
      }
    });

    const s1 = await auth.createSession(user);
    await auth.roleElevated(user.id);
    assert.equal((await auth.readSession(cookieRequest(s1.cookie.value))).session, null);

    const s2 = await auth.createSession(user);
    await auth.forceReauth(user.id, "credential-leak");
    assert.equal((await auth.readSession(cookieRequest(s2.cookie.value))).session, null);

    const s3 = await auth.createSession(user);
    await auth.mfaEnabled(user.id);
    assert.equal((await auth.readSession(cookieRequest(s3.cookie.value))).session, null);

    assert.deepEqual(firedHooks, ["role", "suspicious", "mfa"]);
  });
});
