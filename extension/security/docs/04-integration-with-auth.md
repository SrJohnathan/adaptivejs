# 04 — Integração com extension-auth

---

## Fonte única de origins

```ts
// src/config/origins.ts
export const ALLOWED_ORIGINS = ["https://app.example.com"] as const;
```

```ts
// auth
createAuth({
  adapter,
  csrf: { allowedOrigins: [...ALLOWED_ORIGINS] },
});

// security
createSecurity({
  allowedOrigins: [...ALLOWED_ORIGINS],
});
```

Auth usa a lista para **CSRF (Origin)**.  
Security usa para contexto de configuração / consistência documental e futuros guards.  
Manter listas diferentes é a forma mais rápida de criar bugs “só em prod”.

---

## Quem faz o quê no `/_action`

1. **Security** `protectAction` → rate limit por IP (e por nome da action)  
2. **Auth** `auth.action` → sessão + role + CSRF  

Ordem recomendada no pipeline: security rate limit **antes** de executar a action autenticada.

---

## Nitro

```ts
setSecurityPlugin(security.asNitroPlugin());
```

Auth continua sendo chamado nas pages/actions; security cuida dos headers em **todas** as respostas SSR.

---

## Erros

| Pacote | Classe | Exemplos |
|--------|--------|----------|
| auth | `AuthError` | `CSRF_TOKEN_INVALID`, `AUTHENTICATION_REQUIRED` |
| security | `SecurityError` | `RATE_LIMIT_EXCEEDED` |

Trate os dois no boundary de actions:

```ts
import { AuthError } from "@adaptive-js/extension-auth";
import { SecurityError, toSecurityResponseBody } from "@adaptive-js/extension-security";

if (err instanceof SecurityError) {
  return Response.json(toSecurityResponseBody(err), { status: err.status });
}
if (err instanceof AuthError) {
  return Response.json(
    { ok: false, error: err.code, message: err.message },
    { status: err.status }
  );
}
```

Guia completo de integração: `extension/auth/docs/08-integration.md` e `docs/security-and-auth.md` no monorepo.
