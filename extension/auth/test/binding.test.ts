import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryAuthAdapter } from "../dist/memory-adapter.js";
import { createAuth } from "../dist/server.js";
import { createTestUser, TEST_ORIGIN } from "./helpers.js";

describe("session binding", () => {
  it("rejects and deletes session when user agent mismatches", async () => {
    const auditReasons: string[] = [];
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user], isolated: true });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] },
      sessionBinding: {
        userAgent: true
      },
      onAuditEvent(event) {
        if (event.reason) auditReasons.push(event.reason);
      }
    });

    const initialRequest = {
      headers: {
        "user-agent": "Mozilla/5.0 Chrome/120.0"
      }
    };

    const { session, cookie } = await auth.createSession(user, {}, initialRequest);

    // Same UA: session valid
    const validResult = await auth.readSession({
      headers: {
        cookie: `adaptive.session.test=${cookie.value}`,
        "user-agent": "Mozilla/5.0 Chrome/120.0"
      }
    });
    assert.equal(validResult.session?.id, session.id);

    // Different UA: session rejected and invalidated
    const invalidResult = await auth.readSession({
      headers: {
        cookie: `adaptive.session.test=${cookie.value}`,
        "user-agent": "Mozilla/5.0 Safari/605.1"
      }
    });
    assert.equal(invalidResult.session, null);
    assert.ok(invalidResult.freshCookie);
    assert.ok(auditReasons.includes("session-binding-user-agent-mismatch"));

    // Verify session was deleted from adapter
    const stored = await adapter.getSession(session.id);
    assert.equal(stored, null);
  });

  it("rejects and deletes session when IP or fingerprint mismatches", async () => {
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user], isolated: true });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: [TEST_ORIGIN] },
      sessionBinding: {
        ip: true,
        fingerprint: true
      }
    });

    const createReq = {
      headers: {
        "x-forwarded-for": "203.0.113.195",
        "x-client-fingerprint": "fp-alpha-99"
      }
    };

    const { session, cookie } = await auth.createSession(user, {}, createReq);

    // Mismatched IP
    const ipMismatchResult = await auth.readSession({
      headers: {
        cookie: `adaptive.session.test=${cookie.value}`,
        "x-forwarded-for": "198.51.100.1",
        "x-client-fingerprint": "fp-alpha-99"
      }
    });
    assert.equal(ipMismatchResult.session, null);
  });
});
