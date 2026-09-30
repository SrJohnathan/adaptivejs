import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBlankSessionCookie,
  createSessionCookie,
  DEFAULT_AUTH_COOKIE_NAME,
  DEFAULT_AUTH_COOKIE_OPTIONS,
  getCookie,
  parseCookies,
  readCookieHeader,
  serializeCookie,
  validateCookieOptions
} from "../dist/cookies.js";
import { AuthError } from "../dist/errors.js";

describe("cookie utilities", () => {
  it("serializes default cookie correctly with Secure and HttpOnly", () => {
    const serialized = serializeCookie("test-session", "val123");
    assert.ok(serialized.includes("test-session=val123"));
    assert.ok(serialized.includes("Path=/"));
    assert.ok(serialized.includes("SameSite=Lax"));
    assert.ok(serialized.includes("Secure"));
    assert.ok(serialized.includes("HttpOnly"));
  });

  it("enforces __Host- prefix requirements", () => {
    // __Host- requires secure: true, path: "/", no domain
    assert.throws(
      () => serializeCookie("__Host-test", "val", { secure: false }),
      (err: unknown) => err instanceof AuthError && err.code === "AUTH_CONFIGURATION_INVALID"
    );

    assert.throws(
      () => serializeCookie("__Host-test", "val", { domain: "example.com" }),
      (err: unknown) => err instanceof AuthError && err.code === "AUTH_CONFIGURATION_INVALID"
    );

    assert.throws(
      () => serializeCookie("__Host-test", "val", { path: "/subpath" }),
      (err: unknown) => err instanceof AuthError && err.code === "AUTH_CONFIGURATION_INVALID"
    );

    // Valid __Host- cookie passes
    assert.doesNotThrow(() => {
      serializeCookie("__Host-test", "val", { path: "/", secure: true });
    });
  });

  it("rejects insecure cookies in production", () => {
    assert.throws(
      () => validateCookieOptions("session", { secure: false }, true),
      (err: unknown) => err instanceof AuthError && err.code === "AUTH_CONFIGURATION_INVALID"
    );

    assert.throws(
      () => validateCookieOptions("session", { httpOnly: false }, true),
      (err: unknown) => err instanceof AuthError && err.code === "AUTH_CONFIGURATION_INVALID"
    );

    assert.doesNotThrow(() => {
      validateCookieOptions("session", { secure: true, httpOnly: true }, true);
    });
  });

  it("parses cookies and headers correctly", () => {
    const raw = "foo=bar; baz=qux%20123";
    const parsed = parseCookies(raw);
    assert.equal(parsed.foo, "bar");
    assert.equal(parsed.baz, "qux 123");

    assert.equal(getCookie(raw, "foo"), "bar");
    assert.equal(getCookie(raw, "baz"), "qux 123");
    assert.equal(getCookie(raw, "missing"), null);

    const fromHeaders = getCookie(
      new Headers({ cookie: "session_id=abc" }),
      "session_id"
    );
    assert.equal(fromHeaders, "abc");

    const fromRecord = getCookie({ headers: { cookie: "a=1" } }, "a");
    assert.equal(fromRecord, "1");
  });

  it("creates blank session cookie with Max-Age=0", () => {
    const blank = createBlankSessionCookie({ name: "my-session", secure: false });
    assert.equal(blank.name, "my-session");
    assert.equal(blank.value, "");
    assert.ok(blank.header.includes("Max-Age=0"));
  });

  it("creates active session cookie", () => {
    const active = createSessionCookie("session-123", { name: "my-session", secure: false });
    assert.equal(active.name, "my-session");
    assert.equal(active.value, "session-123");
    assert.ok(active.header.includes("my-session=session-123"));
  });
});
