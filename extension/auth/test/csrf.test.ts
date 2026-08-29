import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "../dist/errors.js";
import { createMemoryAuthAdapter } from "../dist/memory-adapter.js";
import { createAuth } from "../dist/server.js";
import { cookieRequest, createTestAuth, createTestUser, csrfRequest, TEST_ORIGIN } from "./helpers.js";

describe("CSRF configuration", () => {
  it("fails createAuth when csrf.allowedOrigins is empty", () => {
    assert.throws(
      () => createTestAuth({ csrf: { allowedOrigins: [] } }),
      (error: unknown) => error instanceof AuthError && error.code === "CSRF_CONFIGURATION_INVALID"
    );
  });

  it("fails createAuth when csrf.allowedOrigins contains invalid values", () => {
    assert.throws(
      () => createTestAuth({ csrf: { allowedOrigins: ["not-a-valid-origin"] } }),
      (error: unknown) => error instanceof AuthError && error.code === "CSRF_CONFIGURATION_INVALID"
    );
  });

  it("accepts valid allowedOrigins during createAuth", () => {
    assert.doesNotThrow(() => createTestAuth());
  });
});

describe("requireCsrf", () => {
  it("accepts a valid origin and token", async () => {
    const { auth, user } = createTestAuth();
    const { session, cookie } = await auth.createSession(user);
    const csrfToken = await auth.getCsrfToken(session);

    await assert.doesNotReject(async () => {
      await auth.requireCsrf(
        csrfRequest(cookie.value, csrfToken),
        session,
        csrfToken
      );
    });
  });

  it("rejects requests without Origin header", async () => {
    const { auth, user } = createTestAuth();
    const { session, cookie } = await auth.createSession(user);
    const csrfToken = await auth.getCsrfToken(session);

    await assert.rejects(
      () => auth.requireCsrf(
        cookieRequest(cookie.value),
        session,
        csrfToken
      ),
      (error: unknown) => error instanceof AuthError && error.code === "CSRF_ORIGIN_INVALID"
    );
  });

  it("rejects requests with an invalid origin", async () => {
    const { auth, user } = createTestAuth();
    const { session, cookie } = await auth.createSession(user);
    const csrfToken = await auth.getCsrfToken(session);

    await assert.rejects(
      () => auth.requireCsrf(
        csrfRequest(cookie.value, csrfToken, "https://evil.example.com"),
        session,
        csrfToken
      ),
      (error: unknown) => error instanceof AuthError && error.code === "CSRF_ORIGIN_INVALID"
    );
  });

  it("rejects invalid CSRF tokens", async () => {
    const { auth, user } = createTestAuth();
    const { session, cookie } = await auth.createSession(user);

    await assert.rejects(
      () => auth.requireCsrf(
        csrfRequest(cookie.value, "invalid-token"),
        session,
        "invalid-token"
      ),
      (error: unknown) => error instanceof AuthError && error.code === "CSRF_TOKEN_INVALID"
    );
  });

  it("fails when csrf was not configured and requireCsrf is used", async () => {
    const adapter = createMemoryAuthAdapter({ users: [createTestUser()] });
    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false }
    });
    const { session, cookie } = await auth.createSession(createTestUser());
    const csrfToken = await auth.getCsrfToken(session);

    await assert.rejects(
      () => auth.requireCsrf(
        csrfRequest(cookie.value, csrfToken, TEST_ORIGIN),
        session,
        csrfToken
      ),
      (error: unknown) => error instanceof AuthError && error.code === "CSRF_CONFIGURATION_INVALID"
    );
  });
});
