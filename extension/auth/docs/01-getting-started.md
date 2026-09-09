# 01 — Getting Started (Happy Path)

Guia oficial para colocar autenticação segura no ar com o mínimo de código e o máximo de proteção.

> **Objetivo deste doc:** você termina com login, página protegida, Server Action segura e logout funcionando — sem esquecer CSRF, cookie ou invalidação.

---

## 1. Instalação

```bash
npm install @adaptive-js/extension-auth
```

Em produção você também vai querer o módulo de headers/rate limit de superfície:

```bash
npm install @adaptive-js/extension-security
```

---

## 2. Constantes compartilhadas

Crie um arquivo único de origens confiáveis. Auth (CSRF) e Security (rate limit / CSP context) devem usar a **mesma lista**.

```ts
// src/config/origins.ts
export const ALLOWED_ORIGINS = [
  "https://app.example.com",
  // em dev local (HTTP) use cookie sem prefixo __Host- — veja seção Cookie
] as const;
```

---

## 3. Criar o `auth`

```ts
// src/auth.ts
import { createAuth } from "@adaptive-js/extension-auth/server";
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";
import { ALLOWED_ORIGINS } from "./config/origins";

// ⚠️ Memory adapter = só dev/teste. Em produção use seu adapter (Postgres/Redis).
const adapter = createMemoryAuthAdapter({
  users: [
    {
      id: "user-1",
      email: "admin@example.com",
      name: "Admin",
      roles: ["admin"],
    },
  ],
});

export const auth = createAuth({
  adapter,
  csrf: {
    allowedOrigins: [...ALLOWED_ORIGINS],
  },
  // Opcional, mas recomendado em produção:
  onAuditEvent(event) {
    console.info("[auth]", event.type, event);
  },
});
```

### O que acontece no boot

- Se `csrf.allowedOrigins` estiver ausente ou vazio → **falha imediata** (`AuthError`).
- Cookie padrão: `__Host-adaptive-session` com `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
- Em produção, configurações que desabilitam `Secure` ou `HttpOnly` são **rejeitadas**.

### Dev em HTTP local

O prefixo `__Host-` exige HTTPS. Em localhost use:

```ts
export const auth = createAuth({
  adapter,
  csrf: { allowedOrigins: ["http://localhost:3000"] },
  cookie: {
    name: "adaptive.session.dev",
    secure: false,
  },
});
```

---

## 4. Login (criar sessão)

O pacote **não valida senha**. Você valida credenciais no seu endpoint e só então chama `auth.login` / `createSession`.

```ts
// src/actions/login.ts
import { auth } from "../auth";

export async function loginAction(email: string, password: string, request: Request) {
  // 1. Valide credenciais no seu backend / banco
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Response("Invalid credentials", { status: 401 });
  }

  // 2. Crie a sessão (rate limit de createSession roda aqui se configurado)
  const { session, cookie } = await auth.login(user, request);

  // 3. Devolva a resposta com o Set-Cookie
  return new Response(JSON.stringify({ ok: true, user: { id: session.user.id } }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie.header,
    },
  });
}
```

---

## 5. Página protegida

```tsx
// src/pages/dashboard.tsx
import { auth } from "../auth";

export default auth.protectPage(async ({ session }) => {
  return (
    <main>
      <h1>Olá, {session.user.name ?? session.user.email}</h1>
      <p>Roles: {session.user.roles?.join(", ")}</p>
    </main>
  );
});
```

Sem sessão válida → **404** por padrão (não vaza que a rota existe).

Com role:

```tsx
export default auth.protectPage(
  async ({ session }) => <AdminPanel user={session.user} />,
  { roles: ["admin"] }
);
```

Redirect para login:

```tsx
export default auth.protectPage(
  async ({ session }) => <Dashboard user={session.user} />,
  {
    onUnauthenticated: "redirect",
    redirectTo: "/login",
    returnTo: true, // grava o path atual de forma segura
  }
);
```

---

## 6. Server Action segura (`auth.action`)

Este é o caminho recomendado para qualquer mutação autenticada.

```ts
// src/actions/update-profile.ts
import { auth } from "../auth";

export const updateProfile = auth.action(async ({ session, formData }) => {
  // Neste ponto já foram executados, nesta ordem:
  // 1. requireSession
  // 2. requireCsrf (Origin + token)
  // 3. (roles, se você passou { roles: [...] })

  const name = String(formData?.get("name") ?? "");
  await saveUserName(session.userId, name);
  return { ok: true };
});
```

No formulário, sempre envie o token CSRF:

```tsx
// Em uma página protegida / server component
const { session } = await auth.requireSession(request);
const csrfToken = await auth.getCsrfToken(session);

return (
  <form action={updateProfile}>
    <input type="hidden" name="csrfToken" value={csrfToken} />
    <input name="name" defaultValue={session.user.name ?? ""} />
    <button type="submit">Salvar</button>
  </form>
);
```

> **Nunca** confie só em `SameSite`. O token + Origin são a defesa real.

---

## 7. Logout

```ts
// Logout só deste dispositivo
export async function logoutAction(request: Request) {
  const { cookie } = await auth.logout(request);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Set-Cookie": cookie.header, // cookie em branco
    },
  });
}

// Logout em todos os dispositivos
await auth.logoutEverywhere(userId);
```

---

## 8. Eventos de risco (invalidação automática)

Depois de qualquer evento sensível, use os helpers — **não** chame `invalidateUserSessions` na mão na maior parte dos casos:

```ts
await auth.passwordChanged(userId);   // reset / troca de senha
await auth.roleElevated(userId);      // promoveu a admin
await auth.mfaEnabled(userId);        // ativou MFA
await auth.forceReauth(userId);       // força re-login geral
```

Cada um invalida **todas** as sessões do usuário e emite audit.

---

## 9. Cliente (UI hidratada)

```tsx
// src/auth-client.ts
"hydrate";
import { createAuthClient, toAuthClientState } from "@adaptive-js/extension-auth/client";

export const { AuthProvider, useAuth } = createAuthClient();
```

No layout / root:

```tsx
import { AuthProvider, toAuthClientState } from "./auth-client";
import { auth } from "./auth";

// No server: leia a sessão e passe o estado inicial
const { session } = await auth.readSession(request);

return (
  <AuthProvider initialState={toAuthClientState(session)}>
    {children}
  </AuthProvider>
);
```

No componente hidratado:

```tsx
const auth = useAuth();
if (!auth.authenticated()) return <a href="/login">Entrar</a>;
return <span>Olá, {auth.user()?.name}</span>;
```

> Estado no client é **apenas UI**. Permissão e validade sempre revalidadas no server.

---

## 10. Checklist mínimo antes de ir para produção

- [ ] `csrf.allowedOrigins` com as URLs reais (HTTPS)
- [ ] Adapter de produção (não `createMemoryAuthAdapter`)
- [ ] Cookie padrão `__Host-` (ou equivalente seguro)
- [ ] `onAuditEvent` configurado
- [ ] Login com rate limit (`rateLimit.createSession` ou `@adaptive-js/extension-security`)
- [ ] Mutações só via `auth.action` (ou `requireSession` + `requireCsrf` manual)
- [ ] `passwordChanged` / `roleElevated` / `mfaEnabled` nos fluxos de risco
- [ ] Plugin de security no Nitro (veja guia de integração)

---

## Próximos passos

- [02 — Server Actions](./02-server-actions.md)
- [05 — Adapters](./05-adapters.md)
- [07 — Checklist de segurança](./07-security-checklist.md)
- [08 — Integração auth + security + Nitro](./08-integration.md)
