# 05 — Adapters

O core do auth é **storage-agnostic**. Você implementa `AuthAdapter` para o seu banco.

---

## Contrato

```ts
interface AuthAdapter<TUser, TData> {
  // Obrigatórios
  getUser(userId: string): MaybePromise<TUser | null>;
  getSession(sessionId: string): MaybePromise<StoredAuthSession<TData> | null>;
  createSession(session: StoredAuthSession<TData>): MaybePromise<void>;
  updateSession(session: StoredAuthSession<TData>): MaybePromise<void>;
  deleteSession(sessionId: string): MaybePromise<void>;

  // Opcionais (mas necessários para logoutEverywhere / UI de dispositivos)
  deleteUserSessions?(userId: string): MaybePromise<void>;
  deleteUserSessionsExcept?(userId: string, exceptSessionId: string): MaybePromise<void>;
  listUserSessions?(userId: string): MaybePromise<ManagedUserSession[]>;
}
```

`StoredAuthSession` inclui `csrfToken` e (opcionalmente) `binding`.  
**Nunca** devolva `csrfToken` em APIs públicas ou no client.

---

## Memory (só dev)

```ts
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";

const adapter = createMemoryAuthAdapter({
  users: [{ id: "u1", email: "a@b.com", roles: ["admin"] }],
  cleanupIntervalMs: 60_000, // limpa sessões expiradas periodicamente
});
```

Dados morrem com o processo. **Proibido em produção.**

---

## Exemplo Postgres (esboço)

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
      } satisfies StoredAuthSession;
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

### Schema sugerido

```sql
create table sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null,
  expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  csrf_token text not null,
  binding jsonb,
  -- índices
);
create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);
```

Limpeza periódica de expiradas (cron / job):

```sql
delete from sessions
where expires_at < now() or absolute_expires_at < now();
```

---

## Redis (sessões)

Padrão comum: sessões no Redis, usuários no Postgres.

- Key: `session:{id}` → JSON do `StoredAuthSession`
- TTL: alinhado a `expiresAt` (com cuidado no absolute)
- Índice secundário: `user_sessions:{userId}` → set de session ids (para `deleteUserSessions`)

Renovação deve ser atômica o suficiente para não perder a sessão em race (o core já serializa por id na renovação).

---

## Checklist do adapter de produção

- [ ] `updateSession` implementado (usado por `updateSessionData` e grace de renovação)
- [ ] `deleteUserSessions` / `Except` / `listUserSessions` se a UI precisar
- [ ] Índice por `userId`
- [ ] Job de limpeza de expiradas
- [ ] `csrfToken` e `binding` nunca expostos em APIs
- [ ] Testes de concorrência na renovação
