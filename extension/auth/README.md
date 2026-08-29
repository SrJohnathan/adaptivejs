# @adaptive-js/extension-auth

Server-first authentication primitives for AdaptiveJS.

The package intentionally separates server authority from client UI state:

- `@adaptive-js/extension-auth/server` creates, reads, renews and invalidates sessions.
- `@adaptive-js/extension-auth/client` exposes authenticated user state to hydrated UI.
- `@adaptive-js/extension-auth/memory-adapter` is a development-only session adapter.
- `@adaptive-js/extension-auth` contains shared types, cookie helpers and errors.

## Architecture

```text
                  @adaptive-js/extension-auth
                              │
                         AuthAdapter
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
       MemoryAuthAdapter             Adapter da aplicação
                │                           │
                ▼                           ▼
       Dev Server / testes          produção / backend real
       sem backend
```

### MemoryAuthAdapter

Use `createMemoryAuthAdapter()` only for:

- Dev Server
- local development
- tests
- prototyping without a backend

It keeps users and sessions in memory. Data is lost when the process restarts.
Do **not** use it in production.

### AuthAdapter

`AuthAdapter` is the contract that connects AdaptiveJS auth to your real storage or backend.
Production apps implement their own adapter (database, Redis, internal API, etc.).
The core package stays storage-agnostic.

Optional adapter methods:

- `deleteUserSessions(userId)`
- `deleteUserSessionsExcept(userId, exceptSessionId)`
- `listUserSessions(userId)`

Adapters that do not implement optional methods keep working. Server APIs that depend on
a missing method throw a clear runtime error.

## Server setup

```ts
import { createAuth } from "@adaptive-js/extension-auth/server";
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";

const adapter = createMemoryAuthAdapter({
  users: [
    {
      id: "user-1",
      email: "john@example.com",
      roles: ["admin"]
    }
  ]
});

export const auth = createAuth({
  adapter,
  csrf: {
    allowedOrigins: ["https://app.example.com"]
  },
  sessionDuration: 60 * 60 * 24 * 30,
  absoluteSessionDuration: 60 * 60 * 24 * 90,
  beforeCreateSession({ user, request }) {
    // Hook for rate limiting, captcha, fraud checks, etc.
  },
  onAuditEvent(event) {
    console.info("auth event", event);
  }
});
```

By default, the session cookie is named `__Host-adaptive-session` and uses
`Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`. The `__Host-` prefix
prevents a `Domain` attribute and protects the cookie from subdomain cookie
shadowing. Keep that default in production.

For local HTTP development only, use a non-prefixed cookie name explicitly:

```ts
cookie: {
  name: "adaptive.session.dev",
  secure: false
}
```

After validating credentials in a server action, create a session and append its
cookie header to the HTTP response:

```ts
const { session, cookie } = await auth.createSession(user);

response.headers.append("Set-Cookie", cookie.header);
```

Read and protect requests on the server:

```ts
const { session, freshCookie } = await auth.requireSession(request);

auth.requireRole(session, "admin");

if (freshCookie) {
  response.headers.append("Set-Cookie", freshCookie.header);
}
```

## Protecting pages on the server

Use `auth.protectPage()` to protect an individual page without maintaining a
central list of routes. The wrapper reads the request session before the page
is rendered and passes the authenticated session to the page.

When there is no valid session — or the required role is missing — it returns a
real HTTP `404` via `{ __type: "not-found" }`, which uses the app's
`src/pages/404.tsx` when present. No protected page HTML or hydration entry is
sent to the browser.

```ts
// src/auth.ts
import { createAuth } from "@adaptive-js/extension-auth/server";
import { createDatabaseAuthAdapter } from "./auth-adapter";

export const auth = createAuth({
  adapter: createDatabaseAuthAdapter(),
  csrf: { allowedOrigins: ["https://app.example.com"] }
});
```

```tsx
// src/pages/dashboard.tsx
import { auth } from "../auth";

export default auth.protectPage(async ({ session }) => {
  return <h1>Welcome, {session.user.name}</h1>;
});
```

Roles are enforced in the same server-side wrapper:

```tsx
// src/pages/admin/index.tsx
import { auth } from "../../auth";

export default auth.protectPage(
  async ({ session }) => <AdminPanel user={session.user} />,
  { roles: ["admin"] }
);
```

`protectPage()` is exported only from `@adaptive-js/extension-auth/server`.
Never substitute this check with client-side conditional rendering.

Session renewal rotates the session ID. Always append `freshCookie` when it is
returned. Sessions have both an idle timeout
(`sessionDuration`) and an absolute lifetime (`absoluteSessionDuration`), so
regular activity cannot extend a session forever.

A production `AuthAdapter` can map renewal to its own backend session or refresh
mechanism. The memory adapter keeps local renewal for development.

## Intended URL (return after login)

Use helpers from `@adaptive-js/extension-auth/server` or `@adaptive-js/extension-auth`:

```ts
import {
  buildLoginReturnUrl,
  readReturnToFromSearchParams,
  sanitizeReturnTo
} from "@adaptive-js/extension-auth/server";

const loginUrl = buildLoginReturnUrl("/login", "/private/page");
// /login?returnTo=%2Fprivate%2Fpage

const safePath = sanitizeReturnTo("https://attacker.com");
// null — external URLs are rejected
```

Only same-origin relative paths are accepted. `protectPage()` behavior is unchanged;
compose these helpers in your login route and post-login redirect logic.

## Session management

Invalidate the current session:

```ts
const blankCookie = await auth.invalidateRequestSession(request);
response.headers.append("Set-Cookie", blankCookie.header);
```

Sign out everywhere:

```ts
await auth.invalidateUserSessions(userId);
```

Sign out other devices, keep the current session:

```ts
await auth.invalidateUserSessionsExcept(userId, session.id);
```

List active sessions for account/device UIs:

```ts
const sessions = await auth.listUserSessions(userId);
```

Public session listings never include `csrfToken` or other internal secrets.

## CSRF protection

Configure trusted browser origins when creating auth:

```ts
createAuth({
  adapter,
  csrf: {
    allowedOrigins: ["https://app.example.com"]
  }
});
```

If `csrf` is provided, `createAuth()` validates `allowedOrigins` immediately:

- an empty list fails at boot;
- invalid origin strings fail at boot;
- at least one valid origin is required.

Use `requireCsrf` on every authenticated state-changing request. It validates
the configured request origin and a per-session token using a timing-safe
comparison. The token can be sent in the configured header
(`x-adaptive-csrf-token` by default) or passed as the third argument when a
server action reads it from form data.

### Origin header policy

Requests **must** include a valid `Origin` header that matches `allowedOrigins`.
There is no automatic fallback to `Referer`. Requests without `Origin` are rejected.

Render the token from the server:

```tsx
const { session } = await auth.requireSession(request);
const csrfToken = await auth.getCsrfToken(session);

return (
  <form method="post">
    <input type="hidden" name="csrfToken" value={csrfToken} />
    <button>Update profile</button>
  </form>
);
```

Verify it in the action before changing state:

```ts
const { session } = await auth.requireSession(request);
const form = await request.formData();

await auth.requireCsrf(request, session, String(form.get("csrfToken") ?? ""));

// Perform the mutation only after authentication, authorization and CSRF checks.
```

Do not use `SameSite` as the only CSRF defense, and never use state-changing `GET`
routes.

OAuth authorization flows will use their own `state` and PKCE mechanisms in a future
`@adaptive-js/extension-auth-oauth` package. That is separate from application-session CSRF.

## Operational security

This package manages sessions; it does not validate passwords or perform login.
Apply rate limiting, credential-stuffing protection, password hashing, MFA and
reauthentication in the credential endpoint that calls `createSession`.

Use `beforeCreateSession` to integrate external controls before a session is stored:

- rate limiting
- anti brute-force
- captcha
- fraud detection
- IP throttling

Use `onAuditEvent` to record session creation, renewal, expiration, invalidation
and rejected CSRF/session checks. Audit callbacks are **best-effort**: if your audit
handler throws, the auth operation still completes. There is no internal retry.

After a password reset, role elevation or other risk event, call
`invalidateUserSessions(userId)` and require the user to authenticate again.

## Client state

```tsx
"hydrate";

import {
  createAuthClient,
  getAuthStateExpiresInMs,
  isAuthStateExpired,
  toAuthClientState
} from "@adaptive-js/extension-auth/client";

export const { AuthProvider, useAuth } = createAuthClient();
```

Client state is presentational. Permissions and session validity must always be
checked again on the server.

`toAuthClientState(session)` only exposes `id`, `email`, `name` and `roles` by
default. Pass an explicit selector when the UI needs additional safe fields.

React to expiration without polling:

```tsx
const auth = useAuth();

if (isAuthStateExpired(auth.state())) {
  auth.clear();
  // redirect, refetch, etc.
}

const remainingMs = getAuthStateExpiresInMs(auth.state());
```

The app decides whether to logout, refresh, refetch or redirect when the session expires.

## Future OAuth

The core package defines `OAuthIdentity` conceptually for a future
`@adaptive-js/extension-auth-oauth` extension. External identity is based on
`(provider, providerAccountId)`, not email alone. Provider access tokens must not
be exposed to the client.
