# 06 — Client (UI hidratada)

O client **não** é autoridade. Ele só reflete estado para a UI.

---

## Setup

```ts
// src/auth-client.ts
"hydrate";

import {
  createAuthClient,
  toAuthClientState,
  isAuthStateExpired,
  getAuthStateExpiresInMs,
} from "@adaptive-js/extension-auth/client";

export const { AuthProvider, useAuth } = createAuthClient();
export { toAuthClientState, isAuthStateExpired, getAuthStateExpiresInMs };
```

---

## Provider com estado inicial do server

```tsx
// layout / root (server)
import { AuthProvider, toAuthClientState } from "./auth-client";
import { auth } from "./auth";

export default async function Root({ request, children }) {
  const { session, freshCookie } = await auth.readSession(request);
  // propague freshCookie na resposta HTTP se existir

  return (
    <AuthProvider initialState={toAuthClientState(session)}>
      {children}
    </AuthProvider>
  );
}
```

`toAuthClientState` por padrão só expõe `id`, `email`, `name`, `roles`.  
Para mais campos seguros:

```ts
toAuthClientState(session, (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  roles: user.roles,
  avatarUrl: user.avatarUrl, // campo que você considera seguro
}));
```

**Nunca** selecione `passwordHash`, tokens, etc.

---

## useAuth

```tsx
"hydrate";
import { useAuth, isAuthStateExpired } from "../auth-client";

export function UserMenu() {
  const auth = useAuth();

  if (!auth.authenticated()) {
    return <a href="/login">Entrar</a>;
  }

  const state = auth.state();
  if (isAuthStateExpired(state)) {
    auth.clear();
    // redirecione ou mostre “sessão expirada”
    return <a href="/login">Sessão expirada — entrar de novo</a>;
  }

  return (
    <div>
      <span>{auth.user()?.name}</span>
      <form action="/logout" method="post">
        <button>Sair</button>
      </form>
    </div>
  );
}
```

### API do hook

| Método | Descrição |
|--------|-----------|
| `state()` | Snapshot `{ authenticated, user, expiresAt }` |
| `user()` | `user` ou `null` |
| `authenticated()` | boolean |
| `setState(state)` | atualiza (ex.: após login client-side) |
| `clear()` | volta ao estado vazio |

---

## Expiração

```ts
const ms = getAuthStateExpiresInMs(auth.state());
// null se não autenticado / sem expiresAt

if (isAuthStateExpired(auth.state())) {
  auth.clear();
}
```

Hoje a reatividade (auto-clear / redirect) fica a cargo do app.  
Você pode combinar com um `setTimeout` baseado em `getAuthStateExpiresInMs` se quiser UX mais automática.

---

## Regras de ouro

1. **Nenhuma decisão de autorização só no client.**
2. Após login via action, atualize o provider (`setState`) **ou** faça navigation completa para re-ler a sessão no server.
3. Logout deve invalidar no server e limpar o estado client (`clear` + cookie blank).
4. Não espelhe `csrfToken` no client state global — leia do server na hora de montar o form.
