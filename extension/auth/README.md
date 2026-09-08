# @adaptive-js/extension-auth

[🇧🇷 Português](./README_PT-BR.md) | [🇺🇸 English](./README.md)

Server-first, secure-by-default authentication and session primitives for AdaptiveJS applications.

The package intentionally separates server authority from client UI state:

- `@adaptive-js/extension-auth/server` creates, reads, renews, and invalidates sessions, secures Server Actions, and handles CSRF/cookies.
- `@adaptive-js/extension-auth/client` exposes authenticated user state and reactive session expiry to hydrated UI components.
- `@adaptive-js/extension-auth/memory-adapter` is a development/testing session adapter with proactive expiry cleanup.
- `@adaptive-js/extension-auth` contains shared types, cookie utilities, rate limiting, intended URL helpers, and errors.

---

## Architecture

```text
                  @adaptive-js/extension-auth
                               │
                          AuthAdapter
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
        MemoryAuthAdapter             Application Adapter
                 │                           │
                 ▼                           ▼
        Dev Server / tests          Production / Database
        (no external backend)       (Postgres, Redis, Mongo, etc.)
```

### MemoryAuthAdapter

Use `createMemoryAuthAdapter()` for development, tests, and quick prototyping:

```ts
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";

const adapter = createMemoryAuthAdapter({
  users: [{ id: "u-1", email: "alice@example.com", roles: ["admin"] }],
  cleanupIntervalMs: 60_000 // proactive cleanup of expired sessions
});
```

> [!WARNING]
> In-memory session data is lost whenever the process restarts. Do **not** use the memory adapter in production.

### AuthAdapter

`AuthAdapter` is the contract connecting AdaptiveJS auth to your persistence layer. The core package stays completely storage-agnostic.

Required methods:
- `getUser(userId)`
- `getSession(sessionId)`
- `createSession(session)`
- `updateSession(session)`
- `deleteSession(sessionId)`

Optional methods:
- `deleteUserSessions(userId)`
- `deleteUserSessionsExcept(userId, exceptSessionId)`
- `listUserSessions(userId)`

---

## Quick Start & Server Setup

CSRF protection is **mandatory at boot**. If `csrf.allowedOrigins` is not provided or empty, `createAuth()` fails fast:

```ts
// src/auth.ts
import { createAuth } from "@adaptive-js/extension-auth/server";
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";

export const auth = createAuth({
  adapter: createMemoryAuthAdapter(),
  csrf: {
    allowedOrigins: ["https://app.example.com"]
  },
  sessionDuration: 60 * 60 * 24 * 30,         // 30 days idle timeout
  absoluteSessionDuration: 60 * 60 * 24 * 90, // 90 days max session lifetime
  renewBefore: 60 * 60 * 24 * 7,              // rotate ID 7 days before expiry

  // Optional: Rate limit session creation (login brute-force protection)
  rateLimit: {
    createSession: {
      max: 10,
      windowMs: 15 * 60 * 1000 // 10 attempts per 15 minutes
    }
  },

  // Optional: Session binding (anti-hijacking)
  sessionBinding: {
    userAgent: true
  },

  // Optional: Risk event hooks
  onPasswordChanged(userId) { /* ... */ },
  onRoleChanged(userId) { /* ... */ },
  onSuspiciousActivity(userId, reason) { /* ... */ },

  // Audit logging (best-effort)
  onAuditEvent(event) {
    console.info("auth event:", event);
  }
});
```

### Cookie Security & Production Defaults

By default, session cookies use:
- Name: `__Host-adaptive-session`
- `Path=/`
- `Secure: true`
- `HttpOnly: true`
- `SameSite: "Lax"`

The `__Host-` prefix protects against subdomain cookie shadowing and prohibits the `Domain` attribute. In production (`NODE_ENV=production`), disabling `Secure` or `HttpOnly` throws an explicit `AuthError("AUTH_CONFIGURATION_INVALID")`.

For non-HTTPS local development only:

```ts
cookie: {
  name: "adaptive.session.dev",
  secure: false
}
```

---

## Server Actions (`auth.action`)

The recommended way to author server actions. It automatically validates the user session and CSRF token before running your logic:

```ts
// src/actions/profile.ts
import { auth } from "../auth";

export const updateProfile = auth.action(async ({ session, formData, request, args }) => {
  // Session is guaranteed to be authenticated
  // CSRF token and origin have already been verified
  const name = formData?.get("name");
  await db.user.update({ where: { id: session.userId }, data: { name } });

  return { ok: true };
});
```

### Role Enforcement in Actions

```ts
export const deleteAccount = auth.action({ roles: ["admin"] }, async ({ session }) => {
  // Only accessible if session.user.roles includes "admin"
});
```

**CSRF Token Resolution:**
`auth.action` automatically extracts the token from either:
1. HTTP header `x-adaptive-csrf-token`
2. Form field `csrfToken` or `_csrf`
3. JSON argument object containing `csrfToken` or `_csrf`

---

## Protecting Pages (`auth.protectPage`)

Protect server-rendered pages without central route lists:

```tsx
// src/pages/dashboard.tsx
import { auth } from "../auth";

export default auth.protectPage(async ({ session }) => {
  return <h1>Welcome back, {session.user.name}</h1>;
});
```

### Configurable Unauthorized & Forbidden Behaviors

Customize what happens when a visitor is unauthenticated or lacks required roles:

```tsx
// src/pages/admin/index.tsx
import { auth } from "../../auth";

export default auth.protectPage(
  async ({ session }) => <AdminPanel user={session.user} />,
  {
    roles: ["admin"],
    // Redirect unauthenticated visitors to login with safe returnTo
    onUnauthenticated: "redirect",
    redirectTo: "/login",
    returnTo: true,

    // Return 403 Forbidden instead of 404
    onForbidden: "403"
  }
);
```

Available options:
- `onUnauthenticated`: `"404"` (default) | `"401"` | `"redirect"` | `(context) => any`
- `redirectTo`: string (defaults to `"/login"`)
- `returnTo`: boolean (automatically validates with `sanitizeReturnTo`)
- `onForbidden`: `"404"` (default) | `"403"` | `(context) => any`

---

## Session Lifecycle & High-Level Helpers

### Login & Logout

```ts
// Login
const { session, cookie } = await auth.login(user, request);
response.headers.append("Set-Cookie", cookie.header);

// Logout current device
const { cookie: blankCookie } = await auth.logout(request);
response.headers.append("Set-Cookie", blankCookie.header);

// Logout all devices
await auth.logoutEverywhere(userId);
```

### Risk Events (Automatic Invalidation)

When security-critical events happen, call these high-level methods to invalidate existing sessions and record audit trails:

```ts
await auth.passwordChanged(userId);       // Invalidates all sessions + audits "password-changed" + runs hook
await auth.roleElevated(userId);          // Invalidates all sessions + audits "role-elevated" + runs hook
await auth.forceReauth(userId, reason);   // Invalidates all sessions + audits reason + runs hook
await auth.mfaEnabled(userId);            // Invalidates all sessions + audits "mfa-enabled" + runs hook
```

### Updating Session Data

Update session metadata without rotating the session ID or CSRF token:

```ts
await auth.updateSessionData(sessionId, { mfaVerified: true });

// Or with a functional updater:
await auth.updateSessionData(sessionId, (prev) => ({
  cartCount: (prev.cartCount ?? 0) + 1
}));
```

### Automatic Cookie Renewal (`withSession`)

Session renewal rotates the session ID periodically. Use `withSession` to execute logic and ensure any renewed `Set-Cookie` is automatically applied to standard `Response` objects:

```ts
export async function handleRequest(request: Request) {
  return auth.withSession(request, async ({ session, freshCookie }) => {
    return new Response(JSON.stringify({ userId: session.userId }));
    // If session was renewed, fresh Set-Cookie header is appended automatically!
  });
}
```

#### Renewal Concurrency (Race Condition Mitigation)
When multiple parallel requests arrive during a renewal window, AdaptiveJS auth:
- **Deduplicates in-flight renewals:** concurrent requests share the same renewal operation.
- **Applies a 15-second grace period:** parallel requests carrying the previous session ID still succeed and receive the renewed session.

---

## Rate Limiting

Protect `createSession` and `auth.login` against brute-force attacks:

```ts
export const auth = createAuth({
  adapter,
  csrf: { allowedOrigins: ["https://app.example.com"] },
  rateLimit: {
    createSession: {
      max: 5,
      windowMs: 15 * 60 * 1000, // 5 attempts per 15 min per IP
      key: (ctx) => `${ctx.ip}:${ctx.userId ?? "anonymous"}`
    }
  }
});
```

When exceeded, `createSession` throws an `AuthError` with:
- `code: "RATE_LIMIT_EXCEEDED"`
- `status: 429`
- `retryAfterSeconds`

---

## Session Binding (Anti-Hijacking)

Optionally bind sessions to the client's User-Agent, IP, or custom fingerprint:

```ts
export const auth = createAuth({
  adapter,
  csrf: { allowedOrigins: ["https://app.example.com"] },
  sessionBinding: {
    userAgent: true,
    // ip: true,         // Caution: mobile networks and CGNAT frequently change IPs
    // fingerprint: true // Custom header x-client-fingerprint
  }
});
```

If a session is presented with a mismatched User-Agent, it is immediately deleted and rejected (`session.rejected` audit event).

---

## Intended URL (Post-Login Redirects)

```ts
import {
  buildLoginReturnUrl,
  readReturnToFromSearchParams,
  sanitizeReturnTo
} from "@adaptive-js/extension-auth";

const loginUrl = buildLoginReturnUrl("/login", "/account/settings");
// "/login?returnTo=%2Faccount%2Fsettings"

const safePath = sanitizeReturnTo("https://evil.example.com");
// null — open redirects and external URLs are strictly rejected
```

---

## Client State (`@adaptive-js/extension-auth/client`)

Presentational state for client components:

```tsx
"hydrate";

import { createAuthClient, toAuthClientState } from "@adaptive-js/extension-auth/client";

export const { AuthProvider, useAuth } = createAuthClient({
  autoClearOnExpired: true,
  onExpired() {
    window.location.href = "/login?expired=1";
  }
});
```

Using in components:

```tsx
function UserGreeting() {
  const auth = useAuth();

  if (!auth.authenticated()) {
    return <a href="/login">Sign in</a>;
  }

  return (
    <div>
      <p>Hello, {auth.user()?.name}!</p>
      {auth.isExpired() && <span>Session has expired</span>}
    </div>
  );
}
```

> [!NOTE]
> Client state is purely for UI responsiveness. The server always re-verifies session validity and role permissions on every request.

---

## Error Handling

All auth errors throw `AuthError`:

```ts
import { AuthError } from "@adaptive-js/extension-auth";

try {
  await auth.requireSession(request);
} catch (error) {
  if (error instanceof AuthError) {
    console.error(error.code, error.status, error.message);
  }
}
```

Codes:
- `AUTHENTICATION_REQUIRED` (401)
- `AUTHORIZATION_FAILED` (403)
- `SESSION_USER_NOT_FOUND` (401)
- `CSRF_TOKEN_INVALID` (403)
- `CSRF_ORIGIN_INVALID` (403)
- `CSRF_CONFIGURATION_INVALID` (500)
- `AUTH_CONFIGURATION_INVALID` (500)
- `RATE_LIMIT_EXCEEDED` (429)
- `SESSION_BINDING_MISMATCH` (401)

---

## Testing

Run the official test suite covering CSRF, cookies, rate limiting, session binding, concurrency, and risk events:

```bash
npm test
```
