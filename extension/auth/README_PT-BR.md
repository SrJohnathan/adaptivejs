# @adaptive-js/extension-auth

[🇧🇷 Português](./README_PT-BR.md) | [🇺🇸 English](./README.md)

Primitivas de autenticação e gerenciamento de sessões server-first, seguras por padrão, para aplicações AdaptiveJS.

O pacote separa intencionalmente a autoridade do servidor do estado de interface do cliente:

- `@adaptive-js/extension-auth/server` cria, lê, renova e invalida sessões, protege Server Actions e gerencia CSRF e cookies.
- `@adaptive-js/extension-auth/client` expõe o estado do usuário autenticado e detecção reativa de expiração de sessão para componentes hidratados no cliente.
- `@adaptive-js/extension-auth/memory-adapter` é um adaptador de sessão para desenvolvimento e testes, com limpeza proativa de sessões expiradas.
- `@adaptive-js/extension-auth` contém tipos compartilhados, utilitários de cookies, rate limiting, helpers de intended URL e erros.

---

## Arquitetura

```text
                  @adaptive-js/extension-auth
                               │
                          AuthAdapter
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
        MemoryAuthAdapter             Adapter da Aplicação
                 │                           │
                 ▼                           ▼
        Dev Server / testes          Produção / Banco de Dados
        (sem backend externo)        (Postgres, Redis, Mongo, etc.)
```

### MemoryAuthAdapter

Utilize `createMemoryAuthAdapter()` apenas para desenvolvimento local, testes e prototipagem rápida:

```ts
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";

const adapter = createMemoryAuthAdapter({
  users: [{ id: "u-1", email: "alice@example.com", roles: ["admin"] }],
  cleanupIntervalMs: 60_000 // Limpeza proativa de sessões expiradas a cada 60s
});
```

> [!WARNING]
> Os dados de sessão em memória são perdidos sempre que o processo é reiniciado. **Não utilize** o memory adapter em produção.

### AuthAdapter

`AuthAdapter` é o contrato que conecta a autenticação do AdaptiveJS à camada de persistência da sua aplicação. O core permanece agnóstico a banco de dados.

Métodos obrigatórios:
- `getUser(userId)`
- `getSession(sessionId)`
- `createSession(session)`
- `updateSession(session)`
- `deleteSession(sessionId)`

Métodos opcionais:
- `deleteUserSessions(userId)`
- `deleteUserSessionsExcept(userId, exceptSessionId)`
- `listUserSessions(userId)`

---

## Início Rápido & Configuração no Servidor

A proteção CSRF é **obrigatória na inicialização**. Se `csrf.allowedOrigins` não for fornecido ou for uma lista vazia, `createAuth()` falha imediatamente:

```ts
// src/auth.ts
import { createAuth } from "@adaptive-js/extension-auth/server";
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";

export const auth = createAuth({
  adapter: createMemoryAuthAdapter(),
  csrf: {
    allowedOrigins: ["https://app.example.com"]
  },
  sessionDuration: 60 * 60 * 24 * 30,         // 30 dias de inatividade
  absoluteSessionDuration: 60 * 60 * 24 * 90, // 90 dias de vida máxima da sessão
  renewBefore: 60 * 60 * 24 * 7,              // Rotaciona ID 7 dias antes de expirar

  // Opcional: Rate limiting na criação de sessões (proteção contra força bruta no login)
  rateLimit: {
    createSession: {
      max: 10,
      windowMs: 15 * 60 * 1000 // 10 tentativas a cada 15 minutos
    }
  },

  // Opcional: Vinculação de sessão (anti-sequestro de sessão)
  sessionBinding: {
    userAgent: true
  },

  // Opcional: Hooks para eventos de risco
  onPasswordChanged(userId) { /* ... */ },
  onRoleChanged(userId) { /* ... */ },
  onSuspiciousActivity(userId, reason) { /* ... */ },

  // Registro de auditoria (best-effort)
  onAuditEvent(event) {
    console.info("evento de autenticação:", event);
  }
});
```

### Segurança de Cookies & Padrões de Produção

Por padrão, os cookies de sessão utilizam:
- Nome: `__Host-adaptive-session`
- `Path=/`
- `Secure: true`
- `HttpOnly: true`
- `SameSite: "Lax"`

O prefixo `__Host-` protege contra ataques de cookie shadowing em subdomínios e proíbe o atributo `Domain`. Em produção (`NODE_ENV=production`), desabilitar `Secure` ou `HttpOnly` lança um erro `AuthError("AUTH_CONFIGURATION_INVALID")`.

Apenas para desenvolvimento local via HTTP sem TLS:

```ts
cookie: {
  name: "adaptive.session.dev",
  secure: false
}
```

---

## Server Actions (`auth.action`)

A forma recomendada de declarar server actions mutantes. Ela valida automaticamente a sessão do usuário e o token CSRF antes de executar a sua lógica:

```ts
// src/actions/profile.ts
import { auth } from "../auth";

export const updateProfile = auth.action(async ({ session, formData, request, args }) => {
  // A sessão do usuário está garantida e autenticada
  // O token CSRF e a origem já foram validados
  const name = formData?.get("name");
  await db.user.update({ where: { id: session.userId }, data: { name } });

  return { ok: true };
});
```

### Validação de Papéis (Roles) em Actions

```ts
export const deleteAccount = auth.action({ roles: ["admin"] }, async ({ session }) => {
  // Apenas executado se session.user.roles incluir "admin"
});
```

**Resolução do Token CSRF:**
O `auth.action` extrai o token automaticamente de:
1. Cabeçalho HTTP `x-adaptive-csrf-token`
2. Campo de formulário `csrfToken` ou `_csrf` em `FormData`
3. Propriedade `csrfToken` ou `_csrf` no objeto de argumentos JSON

---

## Protegendo Páginas (`auth.protectPage`)

Proteja páginas renderizadas no servidor sem precisar manter listas centrais de rotas:

```tsx
// src/pages/dashboard.tsx
import { auth } from "../auth";

export default auth.protectPage(async ({ session }) => {
  return <h1>Bem-vindo, {session.user.name}</h1>;
});
```

### Comportamento Configurável para Não Autenticado e Não Autorizado

Você pode personalizar o que acontece quando o visitante não possui sessão ou não tem o papel necessário:

```tsx
// src/pages/admin/index.tsx
import { auth } from "../../auth";

export default auth.protectPage(
  async ({ session }) => <AdminPanel user={session.user} />,
  {
    roles: ["admin"],
    // Redireciona visitantes não autenticados para o login com returnTo seguro
    onUnauthenticated: "redirect",
    redirectTo: "/login",
    returnTo: true,

    // Retorna 403 Forbidden em vez de 404 para usuários sem a role necessária
    onForbidden: "403"
  }
);
```

Opções disponíveis:
- `onUnauthenticated`: `"404"` (padrão) | `"401"` | `"redirect"` | `(context) => any`
- `redirectTo`: string (padrão `"/login"`)
- `returnTo`: boolean (valida automaticamente com `sanitizeReturnTo`)
- `onForbidden`: `"404"` (padrão) | `"403"` | `(context) => any`

---

## Ciclo de Vida da Sessão & Helpers de Alto Nível

### Login & Logout

```ts
// Login
const { session, cookie } = await auth.login(user, request);
response.headers.append("Set-Cookie", cookie.header);

// Logout no dispositivo atual
const { cookie: blankCookie } = await auth.logout(request);
response.headers.append("Set-Cookie", blankCookie.header);

// Desconectar de todos os dispositivos
await auth.logoutEverywhere(userId);
```

### Eventos de Risco (Invalidação Automática)

Quando ocorrerem eventos críticos de segurança, invoque estes métodos para invalidar sessões existentes e disparar auditoria:

```ts
await auth.passwordChanged(userId);       // Invalida sessões + audit "password-changed" + executa hook
await auth.roleElevated(userId);          // Invalida sessões + audit "role-elevated" + executa hook
await auth.forceReauth(userId, reason);   // Invalida sessões + audit motivo + executa hook
await auth.mfaEnabled(userId);            // Invalida sessões + audit "mfa-enabled" + executa hook
```

### Atualizando Dados da Sessão

Atualize dados de sessão sem rotacionar o identificador de sessão ou o token CSRF:

```ts
await auth.updateSessionData(sessionId, { mfaVerified: true });

// Ou com atualizador funcional:
await auth.updateSessionData(sessionId, (prev) => ({
  cartCount: (prev.cartCount ?? 0) + 1
}));
```

### Renovação Automática de Cookies (`withSession`)

A renovação de sessão rotaciona o ID da sessão periodicamente. Use `withSession` para executar lógica garantindo que qualquer cookie renovado (`freshCookie`) seja anexado automaticamente na resposta:

```ts
export async function handleRequest(request: Request) {
  return auth.withSession(request, async ({ session, freshCookie }) => {
    return new Response(JSON.stringify({ userId: session.userId }));
    // Se a sessão foi renovada, o Set-Cookie é injetado automaticamente nos headers da Response!
  });
}
```

#### Mitigação de Concorrência na Renovação (Race Condition)
Quando várias requisições paralelas chegam durante a janela de renovação:
- **Deduplicação de renovações em voo:** requisições concorrentes aguardam e compartilham a mesma operação de rotação.
- **Janela de carência de 15 segundos:** requisições paralelas enviadas com o ID de sessão anterior ainda são aceitas e recebem a sessão renovada.

---

## Rate Limiting

Proteja `createSession` e `auth.login` contra ataques de força bruta:

```ts
export const auth = createAuth({
  adapter,
  csrf: { allowedOrigins: ["https://app.example.com"] },
  rateLimit: {
    createSession: {
      max: 5,
      windowMs: 15 * 60 * 1000, // 5 tentativas a cada 15 min por IP
      key: (ctx) => `${ctx.ip}:${ctx.userId ?? "anonymous"}`
    }
  }
});
```

Quando o limite é excedido, lança `AuthError`:
- `code: "RATE_LIMIT_EXCEEDED"`
- `status: 429`
- `retryAfterSeconds`

---

## Session Binding (Anti-Sequestro de Sessão)

Vincule opcionalmente as sessões ao User-Agent, IP ou fingerprint do cliente:

```ts
export const auth = createAuth({
  adapter,
  csrf: { allowedOrigins: ["https://app.example.com"] },
  sessionBinding: {
    userAgent: true,
    // ip: true,         // Cuidado: redes móveis e CGNAT alternam IPs frequentemente
    // fingerprint: true // Cabeçalho customizado x-client-fingerprint
  }
});
```

Se a sessão for apresentada com um User-Agent divergente, ela é deletada imediatamente do storage e rejeitada (com evento de auditoria `session.rejected`).

---

## Intended URL (Redirecionamentos Pós-Login)

```ts
import {
  buildLoginReturnUrl,
  readReturnToFromSearchParams,
  sanitizeReturnTo
} from "@adaptive-js/extension-auth";

const loginUrl = buildLoginReturnUrl("/login", "/account/settings");
// "/login?returnTo=%2Faccount%2Fsettings"

const safePath = sanitizeReturnTo("https://evil.example.com");
// null — URLs externas e open redirects são estritamente rejeitados
```

---

## Estado no Cliente (`@adaptive-js/extension-auth/client`)

Estado puramente apresentacional para componentes hidratados:

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

Utilizando em componentes:

```tsx
function UserGreeting() {
  const auth = useAuth();

  if (!auth.authenticated()) {
    return <a href="/login">Entrar</a>;
  }

  return (
    <div>
      <p>Olá, {auth.user()?.name}!</p>
      {auth.isExpired() && <span>Sua sessão expirou</span>}
    </div>
  );
}
```

> [!NOTE]
> O estado no cliente serve exclusivamente para ergonomia de interface. O servidor sempre revalida a sessão e permissões em toda requisição.

---

## Tratamento de Erros

Todas as falhas conhecidas de autenticação lançam `AuthError`:

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

Códigos suportados:
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

## Testes

Para rodar a suíte oficial de testes (CSRF, cookies, rate limit, session binding, concorrência e eventos de risco):

```bash
npm test
```
