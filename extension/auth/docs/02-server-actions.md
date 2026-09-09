# 02 — Server Actions

Como proteger mutações de forma que o desenvolvedor **não consiga esquecer** CSRF ou sessão.

---

## Por que `auth.action` existe

O erro mais comum (e mais perigoso) em apps com sessão + cookie é:

```ts
// ❌ ERRADO — sessão ok, CSRF esquecido
export async function updateProfile(formData: FormData, request: Request) {
  const { session } = await auth.requireSession(request);
  // ... mutação sem requireCsrf
}
```

`auth.action` fecha esse buraco:

```ts
export const updateProfile = auth.action(async ({ session, formData }) => {
  // CSRF + sessão já validados
});
```

Ordem interna garantida:

1. `requireSession`
2. `requireRole` (se você passou `roles`)
3. `requireCsrf` (Origin + token)
4. Anexa `freshCookie` se a sessão foi renovada
5. Executa o seu handler

---

## Uso básico

```ts
import { auth } from "../auth";

export const updateProfile = auth.action(async ({ session, formData, request }) => {
  const name = String(formData?.get("name") ?? "").trim();
  if (!name) throw new Error("Name required");

  await db.users.update(session.userId, { name });
  return { ok: true };
});
```

### Com role

```ts
export const deleteUser = auth.action(
  { roles: ["admin"] },
  async ({ session, formData }) => {
    const targetId = String(formData?.get("userId"));
    await db.users.delete(targetId);
    return { ok: true };
  }
);
```

---

## Enviando o token CSRF

### Form HTML / Server Action clássica

```tsx
const { session } = await auth.requireSession(request);
const csrfToken = await auth.getCsrfToken(session);

<form action={updateProfile}>
  <input type="hidden" name="csrfToken" value={csrfToken} />
  <input name="name" />
  <button>Salvar</button>
</form>
```

O helper tenta ler o token de:

- campo `csrfToken` / `csrf` no `FormData`
- header `x-adaptive-csrf-token` (nome configurável)

### Fetch / JSON

```ts
await fetch("/_action", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-adaptive-csrf-token": csrfToken,
  },
  body: JSON.stringify({ action: "updateProfile", name: "Ada" }),
  credentials: "include",
});
```

A request **precisa** ter header `Origin` válido (bate com `allowedOrigins`). Sem Origin → rejeitado.

---

## `protectAction` vs `auth.action`

| Helper | Sessão | Roles | CSRF | Quando usar |
|--------|--------|-------|------|-------------|
| `auth.action` | ✅ | ✅ opcional | ✅ | **Mutações** (recomendado) |
| `auth.protectAction` | ✅ | ✅ opcional | ❌ | Só leitura autenticada / casos especiais |

Se a action muda estado, prefira sempre `auth.action`.

---

## Renovação de cookie dentro da action

Se a sessão estiver perto de expirar, `requireSession` pode rotacionar o id e devolver `freshCookie`.

`auth.action` tenta aplicar esse cookie no contexto (Response / `appendSetCookie`).  
Se o runtime do AdaptiveJS expuser outro mecanismo, use `withSession` manualmente:

```ts
return auth.withSession(request, async ({ session, freshCookie }) => {
  // ...
  const res = Response.json({ ok: true });
  if (freshCookie) res.headers.append("Set-Cookie", freshCookie.header);
  return res;
});
```

---

## Erros que você vai ver

| Código | Status | Causa típica |
|--------|--------|--------------|
| `AUTHENTICATION_REQUIRED` | 401 | Sem cookie / sessão expirada |
| `AUTHORIZATION_FAILED` | 403 | Role insuficiente |
| `CSRF_ORIGIN_INVALID` | 403 | Origin ausente ou não listado |
| `CSRF_TOKEN_INVALID` | 403 | Token ausente ou errado |
| `CSRF_CONFIGURATION_INVALID` | 500 | `allowedOrigins` mal configurado no boot |

Trate `AuthError` no boundary de actions e devolva JSON consistente:

```ts
import { AuthError } from "@adaptive-js/extension-auth";

try {
  return await updateProfile(formData, event);
} catch (err) {
  if (err instanceof AuthError) {
    return Response.json(
      { ok: false, error: err.code, message: err.message },
      { status: err.status }
    );
  }
  throw err;
}
```

---

## Anti-patterns

1. **Mutação com GET** — nunca.
2. **Confiar só em SameSite** — insuficiente sozinho.
3. **CSRF token no localStorage** — use cookie de sessão + token por sessão no form/header.
4. **`protectAction` em escrita** — falta CSRF.
5. **Validar role só no client** — role sempre no server (`auth.action` / `requireRole`).

---

## Próximo

- [03 — Proteger páginas](./03-protecting-pages.md)
- [04 — Ciclo de vida da sessão](./04-session-lifecycle.md)
