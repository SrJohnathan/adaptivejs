# 03 — Protegendo páginas

`auth.protectPage` roda **no server**, antes de qualquer HTML de página protegida ser enviado.

---

## Uso mínimo

```tsx
import { auth } from "../auth";

export default auth.protectPage(async ({ session }) => {
  return <h1>Olá, {session.user.name}</h1>;
});
```

Sem sessão → resposta de **não encontrado** (404) por padrão.  
Isso evita vazar a existência da rota para usuários anônimos.

---

## Roles

```tsx
export default auth.protectPage(
  async ({ session }) => <AdminPanel user={session.user} />,
  { roles: ["admin"] }
);
```

Se o usuário está autenticado mas sem a role → comportamento de `onForbidden` (default: 404).

---

## Comportamentos configuráveis

```ts
type ProtectPageOptions = {
  roles?: string[];
  onUnauthenticated?: "404" | "401" | "redirect" | ((ctx) => any);
  onForbidden?: "404" | "403" | ((ctx) => any);
  redirectTo?: string;
  returnTo?: boolean; // usa sanitizeReturnTo automaticamente
};
```

### Exemplos

**Redirect para login guardando o destino:**

```tsx
export default auth.protectPage(
  async ({ session }) => <PrivatePage />,
  {
    onUnauthenticated: "redirect",
    redirectTo: "/login",
    returnTo: true,
  }
);
```

**401 explícito (APIs / JSON):**

```tsx
export default auth.protectPage(
  async ({ session }) => <ApiStylePage />,
  { onUnauthenticated: "401" }
);
```

**Handler custom:**

```tsx
export default auth.protectPage(
  async ({ session }) => <Page />,
  {
    onUnauthenticated: (ctx) => {
      return { __type: "redirect", location: "/login" };
    },
  }
);
```

---

## Return URL seguro

Nunca redirecione para URL vinda do query string sem sanitizar.

```ts
import {
  buildLoginReturnUrl,
  readReturnToFromSearchParams,
  sanitizeReturnTo,
} from "@adaptive-js/extension-auth/server";

// Montar link de login
const loginUrl = buildLoginReturnUrl("/login", "/dashboard/settings");
// → /login?returnTo=%2Fdashboard%2Fsettings

// Depois do login
const raw = readReturnToFromSearchParams(url.searchParams);
const safe = sanitizeReturnTo(raw); // null se for externo / perigoso
const destination = safe ?? "/dashboard";
```

`sanitizeReturnTo` **só aceita paths relativos same-origin**.  
`https://evil.com` → `null`.

---

## Cookie renovado na página

Se a sessão for renovada durante o `readSession`, `protectPage` chama `context.appendSetCookie` quando disponível.  
Garanta que o runtime da página exponha esse callback (o adapter Nitro / core do AdaptiveJS costuma fazer isso).

---

## O que `protectPage` NÃO substitui

- Não protege Server Actions → use `auth.action`.
- Não é middleware global de todas as rotas → proteja página a página (ou componha um helper de layout).
- Não valida CSRF (páginas GET de leitura não precisam; mutações sim).

---

## Padrão recomendado de pastas

```text
src/pages/
  login.tsx          ← pública
  dashboard.tsx      ← auth.protectPage(...)
  admin/
    index.tsx        ← auth.protectPage(..., { roles: ["admin"] })
```

Nunca faça a checagem só no client:

```tsx
// ❌ ERRADO
if (!useAuth().authenticated()) return <Login />;
```

O HTML/dados sensíveis já teriam sido renderizados no server ou vazado na hidratação.
