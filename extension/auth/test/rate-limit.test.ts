import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "../dist/errors.js";
import { createMemoryAuthAdapter } from "../dist/memory-adapter.js";
import { MemoryRateLimitStorage } from "../dist/rate-limit.js";
import { createAuth } from "../dist/server.js";
import { createTestUser, TEST_ORIGIN } from "./helpers.js";

describe("rate limiting on createSession", () => {
  it("enforces session creation rate limit per key", async () => {
    const auditEvents: string[] = [];
    const storage = new MemoryRateLimitStorage();
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user], isolated: true });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] },
      onAuditEvent(event) {
        if (event.reason) {
          auditEvents.push(event.reason);
        }
      },
      rateLimit: {
        createSession: {
          max: 2,
          windowMs: 60_000,
          storage
        }
      }
    });

    const requestA = { headers: { "x-forwarded-for": "192.168.1.1" } };
    const requestB = { headers: { "x-forwarded-for": "10.0.0.1" } };

    // Request A attempt 1: allowed
    const session1 = await auth.createSession(user, {}, requestA);
    assert.ok(session1.session.id);

    // Request A attempt 2: allowed
    const session2 = await auth.createSession(user, {}, requestA);
    assert.ok(session2.session.id);

    // Request A attempt 3: blocked
    await assert.rejects(
      () => auth.createSession(user, {}, requestA),
      (err: unknown) => {
        return (
          err instanceof AuthError &&
          err.code === "RATE_LIMIT_EXCEEDED" &&
          err.status === 429
        );
      }
    );

    assert.ok(auditEvents.includes("rate-limit-exceeded"));

    // Request B from another IP should still be allowed
    const sessionB = await auth.createSession(user, {}, requestB);
    assert.ok(sessionB.session.id);

    storage.destroy();
  });
});
