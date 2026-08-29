import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAuthStateExpiresInMs, isAuthStateExpired, toAuthClientState } from "../dist/client.js";
import { createTestUser } from "./helpers.js";

describe("client expiration helpers", () => {
  it("detects expired client state", () => {
    const expired = {
      authenticated: true,
      user: createTestUser(),
      expiresAt: new Date(Date.now() - 1000).toISOString()
    };

    assert.equal(isAuthStateExpired(expired), true);
    assert.equal(getAuthStateExpiresInMs(expired), 0);
  });

  it("reports remaining time for active sessions", () => {
    const active = toAuthClientState({
      user: createTestUser(),
      expiresAt: new Date(Date.now() + 60_000)
    });

    const remaining = getAuthStateExpiresInMs(active);
    assert.ok(remaining !== null && remaining > 0 && remaining <= 60_000);
    assert.equal(isAuthStateExpired(active), false);
  });
});
