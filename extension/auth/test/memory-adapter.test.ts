import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryAuthAdapter } from "../dist/memory-adapter.js";
import { createAuth } from "../dist/server.js";
import { createTestUser } from "./helpers.js";

describe("MemoryAuthAdapter", () => {
  it("stores users and sessions only in memory", async () => {
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user] });
    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: ["https://app.example.com"] }
    });

    const { session } = await auth.createSession(user);
    const stored = await adapter.getSession(session.id);

    assert.ok(stored);
    assert.equal(stored?.userId, user.id);
    assert.equal(await adapter.getUser(user.id), user);
  });

  it("clears in-memory state", async () => {
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user] });
    const { session } = await createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: ["https://app.example.com"] }
    }).createSession(user);

    adapter.clear();

    assert.equal(await adapter.getSession(session.id), null);
    assert.equal(await adapter.getUser(user.id), null);
  });

  it("supports optional session management methods", async () => {
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user] });
    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: ["https://app.example.com"] }
    });

    const first = await auth.createSession(user);
    const second = await auth.createSession(user);

    const listed = await auth.listUserSessions(user.id);
    assert.equal(listed.length, 2);

    await auth.invalidateUserSessionsExcept(user.id, first.session.id);

    assert.ok(await adapter.getSession(first.session.id));
    assert.equal(await adapter.getSession(second.session.id), null);
  });
});
