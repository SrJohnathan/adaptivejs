# 05 — Adapters

No `@adaptive-js/extension-auth`, **tudo é baseado em Adapters**. Você passa um único adapter para `createAuth({ adapter })`.

Existem 3 formas de usar adapters:
1. **Adapter Interno** — Armazena usuários e sessões localmente no seu banco de dados ou memória (Memory, Postgres, Redis).
2. **Adapter Externo** — Conecta diretamente a APIs e microserviços externos (Rust Axum, Go, FastAPI), cuidando de login, tokens e sessões locais para o SSR.
3. **Custom Adapter** — Você implementa a interface `AuthAdapter` com a lógica específica da sua infraestrutura.

---

## 1. Contrato `AuthAdapter`

```ts
export interface AuthAdapter<
  TUser extends AuthUser = AuthUser,
  TData extends AuthSessionData = AuthSessionData
> {
  // Obrigatórios (Lifecycle de Sessão e Usuário)
  getUser(userId: string): MaybePromise<TUser | null>;
  getSession(sessionId: string): MaybePromise<StoredAuthSession<TData> | null>;
  createSession(session: StoredAuthSession<TData>): MaybePromise<void>;
  updateSession(session: StoredAuthSession<TData>): MaybePromise<void>;
  deleteSession(sessionId: string): MaybePromise<void>;

  // Opcionais (Device management / Logout global)
  deleteUserSessions?(userId: string): MaybePromise<void>;
  deleteUserSessionsExcept?(userId: string, exceptSessionId: string): MaybePromise<void>;
  listUserSessions?(userId: string): MaybePromise<ManagedUserSession[]>;
}
```

`StoredAuthSession` inclui `csrfToken` e (opcionalmente) `binding`.  
**Nunca** devolva `csrfToken` em APIs públicas ou no client.

---

## 2. Adapter Externo (`createExternalAuthAdapter`)

Quando a autenticação do seu sistema vive em uma **API externa** (como um microserviço em Rust Axum, Go ou Python), você usa `createExternalAuthAdapter`.

Ele implementa o contrato `AuthAdapter`, gerencia as sessões locais no servidor AdaptiveJS para SSR rápido e seguro, e expõe métodos para autenticar contra a API externa:

```ts
import { createAuth } from "@adaptive-js/extension-auth/server";
import { createExternalAuthAdapter } from "@adaptive-js/extension-auth/external-adapter";

export const adapter = createExternalAuthAdapter({
  baseUrl: process.env.AUTH_SERVICE_URL ?? "http://localhost:3001",
  loginPath: "/api/v1/auth/login",
  registerPath: "/api/v1/auth/register",
  mapUser: (res: any) => ({
    id: res.user.id,
    email: res.user.email,
    name: res.user.name,
    roles: res.user.roles ?? [],
  }),
  mapToken: (res: any) => res.token,
});

export const auth = createAuth({
  adapter, // <-- Único ponto de configuração! Sem providers.
  csrf: { allowedOrigins: ["http://localhost:3000"] },
});
```

### Operações com o Adapter Externo:

```ts
// 1. Login na API externa:
const { user, token } = await adapter.login({ email, password });
const { session, cookie } = await auth.createSession(user, {
  data: { authToken: token },
});

// 2. Ou login direto via helper:
const { session, cookie } = await auth.login({ email, password }, request);

// 3. Registro de novo usuário:
const { user, token } = await adapter.register({ email, password, name });
```

---

## 3. Adapters Internos (Memory / Banco de Dados)

### Memory (Apenas Dev e Testes)

```ts
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";

const adapter = createMemoryAuthAdapter({
  users: [{ id: "u1", email: "admin@example.com", roles: ["admin"] }],
  cleanupIntervalMs: 60_000,
});
```

> **Aviso:** Dados em memória são descartados ao reiniciar o processo. Use apenas em desenvolvimento ou testes.

### Exemplo Postgres

```ts
import type { AuthAdapter, StoredAuthSession, AuthUser } from "@adaptive-js/extension-auth";
import { pool } from "./db";

export function createPostgresAuthAdapter(): AuthAdapter<AuthUser> {
  return {
    async getUser(userId) {
      const { rows } = await pool.query(
        `select id, email, name, roles from users where id = $1`,
        [userId]
      );
      return rows[0] ?? null;
    },

    async getSession(sessionId) {
      const { rows } = await pool.query(
        `select id, user_id, data, created_at, expires_at, absolute_expires_at, csrf_token, binding
         from sessions where id = $1`,
        [sessionId]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        data: row.data ?? {},
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        absoluteExpiresAt: row.absolute_expires_at,
        csrfToken: row.csrf_token,
        binding: row.binding ?? undefined,
      };
    },

    async createSession(session) {
      await pool.query(
        `insert into sessions
         (id, user_id, data, created_at, expires_at, absolute_expires_at, csrf_token, binding)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          session.id,
          session.userId,
          JSON.stringify(session.data),
          session.createdAt,
          session.expiresAt,
          session.absoluteExpiresAt,
          session.csrfToken,
          session.binding ? JSON.stringify(session.binding) : null,
        ]
      );
    },

    async updateSession(session) {
      await pool.query(
        `update sessions set
           data = $2,
           expires_at = $3,
           absolute_expires_at = $4,
           csrf_token = $5,
           binding = $6
         where id = $1`,
        [
          session.id,
          JSON.stringify(session.data),
          session.expiresAt,
          session.absoluteExpiresAt,
          session.csrfToken,
          session.binding ? JSON.stringify(session.binding) : null,
        ]
      );
    },

    async deleteSession(sessionId) {
      await pool.query(`delete from sessions where id = $1`, [sessionId]);
    },

    async deleteUserSessions(userId) {
      await pool.query(`delete from sessions where user_id = $1`, [userId]);
    },

    async deleteUserSessionsExcept(userId, exceptSessionId) {
      await pool.query(
        `delete from sessions where user_id = $1 and id <> $2`,
        [userId, exceptSessionId]
      );
    },

    async listUserSessions(userId) {
      const { rows } = await pool.query(
        `select id, user_id, created_at, expires_at, absolute_expires_at
         from sessions where user_id = $1 order by created_at desc`,
        [userId]
      );
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        absoluteExpiresAt: r.absolute_expires_at,
      }));
    },
  };
}
```

---

## 4. Custom Adapter (Faça você mesmo)

Qualquer objeto que satisfaça `AuthAdapter` é um adapter válido. Você pode integrar com Redis, MongoDB, DynamoDB, Supabase, Firebase ou sua própria API corporativa:

```ts
import type { AuthAdapter } from "@adaptive-js/extension-auth";

export const myCustomAdapter: AuthAdapter = {
  async getUser(id) { /* busca usuário */ },
  async getSession(id) { /* busca sessão */ },
  async createSession(session) { /* salva sessão */ },
  async updateSession(session) { /* atualiza sessão */ },
  async deleteSession(id) { /* deleta sessão */ },
};

export const auth = createAuth({
  adapter: myCustomAdapter,
  csrf: { allowedOrigins: ["https://app.example.com"] },
});
```

---

## 5. Adapter no Contexto de Server Actions

Dentro de qualquer Server Action protegida com `auth.action`, o adapter configurado fica disponível no contexto:

```ts
export const updateProfile = auth.action(async ({ session, adapter, formData }) => {
  // Acesse diretamente seu adapter (interno, externo ou custom):
  // adapter.getUser(...), adapter.request(...), etc.
  return { ok: true };
});
```
