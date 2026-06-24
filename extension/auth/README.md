# @adaptive-js/extension-auth

Server-first authentication primitives for AdaptiveJS.

The package intentionally separates server authority from client UI state:

- `@adaptive-js/extension-auth/server` creates, reads, renews and invalidates sessions.
- `@adaptive-js/extension-auth/client` exposes authenticated user state to hydrated UI.
- `@adaptive-js/extension-auth/memory-adapter` is a development-only session adapter.
- `@adaptive-js/extension-auth` contains shared types, cookie helpers and errors.

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
  cookie: {
    secure: process.env.NODE_ENV === "production"
  }
});
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

The memory adapter is not suitable for production. A production adapter should
store sessions in a database or durable key-value store.

## Client state

```tsx
"hydrate";

import { createAuthClient } from "@adaptive-js/extension-auth/client";

export const { AuthProvider, useAuth } = createAuthClient();
```

Client state is presentational. Permissions and session validity must always be
checked again on the server.

`toAuthClientState(session)` only exposes `id`, `email`, `name` and `roles` by
default. Pass an explicit selector when the UI needs additional safe fields.
