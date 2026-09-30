import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cookieRequest, createTestAuth } from "./helpers.js";

describe("renewal concurrency and grace period", () => {
  it("deduplicates parallel readSession renewals for the same session", async () => {
    const { auth, user } = createTestAuth({ sessionDuration: 60, renewBefore: 60 });
    const { cookie } = await auth.createSession(user);

    const req = cookieRequest(cookie.value);

    // Concurrently trigger readSession for the same session
    const [result1, result2] = await Promise.all([
      auth.readSession(req),
      auth.readSession(req)
    ]);

    assert.ok(result1.session);
    assert.ok(result2.session);
    // Both parallel calls should receive the same renewed session
    assert.equal(result1.session?.id, result2.session?.id);
  });

  it("permits old session ID during post-rotation grace period", async () => {
    const { auth, user } = createTestAuth({ sessionDuration: 60, renewBefore: 60 });
    const { session: originalSession, cookie: originalCookie } = await auth.createSession(user);

    // Trigger renewal
    const renewedResult = await auth.readSession(cookieRequest(originalCookie.value));
    assert.ok(renewedResult.session);
    assert.notEqual(renewedResult.session?.id, originalSession.id);

    // Another request arrives using the OLD session cookie (e.g. from an in-flight parallel request)
    const graceResult = await auth.readSession(cookieRequest(originalCookie.value));
    assert.ok(graceResult.session);
    assert.equal(graceResult.session?.id, renewedResult.session?.id);
    assert.ok(graceResult.freshCookie);
  });
});
