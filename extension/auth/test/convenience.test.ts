import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cookieRequest, createTestAuth, createTestUser } from "./helpers.js";

describe("convenience helpers and updates", () => {
  it("updates session data using updateSessionData", async () => {
    const { auth, user, adapter } = createTestAuth();
    const { session } = await auth.createSession(user, { data: { role: "guest", step: 1 } });

    await auth.updateSessionData(session.id, { step: 2 });

    const stored = await adapter.getSession(session.id);
    assert.deepEqual(stored?.data, { role: "guest", step: 2 });

    // Functional updater
    await auth.updateSessionData(session.id, (prev: any) => ({ step: prev.step + 1 }));
    const stored2 = await adapter.getSession(session.id);
    assert.equal(stored2?.data.step, 3);
  });

  it("applies freshCookie automatically with withSession", async () => {
    const { auth, user } = createTestAuth({ sessionDuration: 60, renewBefore: 60 });
    const { cookie } = await auth.createSession(user);

    let capturedCookie: string | null = null;
    const req = {
      headers: {
        cookie: `adaptive.session.test=${cookie.value}`
      },
      appendSetCookie(c: string) {
        capturedCookie = c;
      }
    };

    const result = await auth.withSession(req, async ({ session }) => {
      return { hello: session.user.id };
    });

    assert.equal(result.hello, user.id);
    assert.ok(capturedCookie !== null);
  });

  it("provides login, logout, and logoutEverywhere helpers", async () => {
    const { auth, user } = createTestAuth();

    // Login
    const { session, cookie } = await auth.login(user);
    assert.ok(session.id);
    assert.ok(cookie.header.includes(session.id));

    // Logout
    const { cookie: blankCookie } = await auth.logout(cookieRequest(cookie.value));
    assert.ok(blankCookie.header.includes("Max-Age=0"));
    assert.equal((await auth.readSession(cookieRequest(cookie.value))).session, null);

    // Login multiple and logoutEverywhere
    const s1 = await auth.login(user);
    const s2 = await auth.login(user);
    await auth.logoutEverywhere(user.id);
    assert.equal((await auth.readSession(cookieRequest(s1.cookie.value))).session, null);
    assert.equal((await auth.readSession(cookieRequest(s2.cookie.value))).session, null);
  });

  it("protectPage supports configurable onUnauthenticated and onForbidden", async () => {
    const member = createTestUser({ id: "m-1", roles: ["member"] });
    const { auth } = createTestAuth({ users: [member] });

    const pageHandler = auth.protectPage(
      (ctx) => ({ rendered: true, user: ctx.session.userId }),
      {
        roles: ["admin"],
        onUnauthenticated: "redirect",
        redirectTo: "/login",
        returnTo: true,
        onForbidden: "403"
      }
    );

    // Unauthenticated: redirects to /login?returnTo=...
    const unauthResult = await pageHandler({
      request: { headers: {}, url: "/secret/dashboard" }
    });
    assert.deepEqual(unauthResult, {
      __type: "redirect",
      location: "/login?returnTo=%2Fsecret%2Fdashboard",
      status: 302
    });

    // Authenticated but forbidden role: returns status 403
    const { cookie } = await auth.login(member);
    const forbiddenResult = await pageHandler({
      request: {
        headers: { cookie: `adaptive.session.test=${cookie.value}` },
        url: "/secret/dashboard"
      }
    });
    assert.deepEqual(forbiddenResult, {
      __type: "error",
      status: 403
    });
  });
});
