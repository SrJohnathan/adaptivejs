import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestAuth, cookieRequest } from "./helpers.js";

describe("session lifecycle", () => {
  it("creates and reads a session", async () => {
    const { auth, user } = createTestAuth();
    const { session, cookie } = await auth.createSession(user);
    const result = await auth.readSession(cookieRequest(cookie.value));

    assert.equal(result.session?.id, session.id);
    assert.equal(result.session?.user.id, user.id);
    assert.equal("csrfToken" in (result.session ?? {}), false);
  });

  it("expires sessions after idle timeout", async () => {
    const { auth, user } = createTestAuth({ sessionDuration: 1, renewBefore: 0 });
    const { cookie } = await auth.createSession(user);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const result = await auth.readSession(cookieRequest(cookie.value));
    assert.equal(result.session, null);
    assert.ok(result.freshCookie);
  });

  it("renews sessions near expiry", async () => {
    const { auth, user } = createTestAuth({ sessionDuration: 120, renewBefore: 120 });
    const { session, cookie } = await auth.createSession(user);
    const result = await auth.readSession(cookieRequest(cookie.value));

    assert.notEqual(result.session?.id, session.id);
    assert.ok(result.freshCookie);
  });

  it("invalidates the current request session", async () => {
    const { auth, user } = createTestAuth();
    const { cookie } = await auth.createSession(user);

    await auth.invalidateRequestSession(cookieRequest(cookie.value));

    const result = await auth.readSession(cookieRequest(cookie.value));
    assert.equal(result.session, null);
  });

  it("invalidates all user sessions", async () => {
    const { auth, user } = createTestAuth();
    const first = await auth.createSession(user);
    const second = await auth.createSession(user);

    await auth.invalidateUserSessions(user.id);

    const firstResult = await auth.readSession(cookieRequest(first.cookie.value));
    const secondResult = await auth.readSession(cookieRequest(second.cookie.value));

    assert.equal(firstResult.session, null);
    assert.equal(secondResult.session, null);
  });

  it("invalidates all user sessions except the current one", async () => {
    const { auth, user } = createTestAuth();
    const current = await auth.createSession(user);
    const other = await auth.createSession(user);

    await auth.invalidateUserSessionsExcept(user.id, current.session.id);

    const currentResult = await auth.readSession(cookieRequest(current.cookie.value));
    const otherResult = await auth.readSession(cookieRequest(other.cookie.value));

    assert.equal(currentResult.session?.id, current.session.id);
    assert.equal(otherResult.session, null);
  });

  it("lists user sessions without exposing csrfToken", async () => {
    const { auth, user } = createTestAuth();
    await auth.createSession(user);
    await auth.createSession(user);

    const sessions = await auth.listUserSessions(user.id);

    assert.equal(sessions.length, 2);
    for (const session of sessions) {
      assert.equal(session.userId, user.id);
      assert.equal("csrfToken" in session, false);
      assert.ok(session.createdAt instanceof Date);
      assert.ok(session.expiresAt instanceof Date);
    }
  });
});
