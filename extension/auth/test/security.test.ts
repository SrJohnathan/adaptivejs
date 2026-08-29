import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLoginReturnUrl,
  readReturnToFromSearchParams,
  sanitizeReturnTo
} from "../dist/intended-url.js";
import { createMemoryAuthAdapter } from "../dist/memory-adapter.js";
import { createAuth } from "../dist/server.js";
import { createTestAuth, createTestUser } from "./helpers.js";

describe("intended URL helpers", () => {
  it("accepts safe internal paths", () => {
    assert.equal(sanitizeReturnTo("/private/page"), "/private/page");
    assert.equal(
      buildLoginReturnUrl("/login", "/private/page"),
      "/login?returnTo=%2Fprivate%2Fpage"
    );
  });

  it("rejects external URLs and open redirects", () => {
    assert.equal(sanitizeReturnTo("https://attacker.com"), null);
    assert.equal(sanitizeReturnTo("//attacker.com/path"), null);
    assert.equal(sanitizeReturnTo("/\\evil"), null);
    assert.equal(buildLoginReturnUrl("/login", "https://attacker.com"), "/login");
  });

  it("reads returnTo from search params safely", () => {
    const params = new URLSearchParams("returnTo=%2Fdashboard");
    assert.equal(readReturnToFromSearchParams(params), "/dashboard");
    assert.equal(
      readReturnToFromSearchParams(new URLSearchParams("returnTo=https://attacker.com")),
      null
    );
  });
});

describe("security guarantees", () => {
  it("never exposes csrfToken on public AuthSession", async () => {
    const { auth, user } = createTestAuth();
    const { session } = await auth.createSession(user);

    assert.equal("csrfToken" in session, false);
  });

  it("completes session creation even when audit fails", async () => {
    let auditCalls = 0;
    const memoryAdapter = createMemoryAuthAdapter({ users: [createTestUser()] });
    const authWithFailingAudit = createAuth({
      adapter: memoryAdapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: ["https://app.example.com"] },
      onAuditEvent() {
        auditCalls += 1;
        throw new Error("audit unavailable");
      }
    });

    const created = await authWithFailingAudit.createSession(createTestUser());

    assert.ok(created.session.id);
    assert.equal(auditCalls, 1);
  });

  it("runs beforeCreateSession before storing the session", async () => {
    const events: string[] = [];
    const user = createTestUser();
    const adapter = createMemoryAuthAdapter({ users: [user] });

    const auth = createAuth({
      adapter,
      cookie: { name: "adaptive.session.test", secure: false },
      csrf: { allowedOrigins: ["https://app.example.com"] },
      beforeCreateSession() {
        events.push("before");
      },
      onAuditEvent() {
        events.push("audit");
      }
    });

    await auth.createSession(user);

    assert.deepEqual(events, ["before", "audit"]);
  });
});
