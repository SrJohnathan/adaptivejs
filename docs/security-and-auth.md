# Segurança no AdaptiveJS — Auth + Security de ponta a ponta

Guia unificado para deixar um app **seguro por padrão** usando:

- `@adaptive-js/extension-auth`
- `@adaptive-js/extension-security`
- adapter Nitro

Se você só puder ler um documento, leia este e o [checklist do auth](../extension/auth/docs/07-security-checklist.md).

---

## 1. Modelo mental

```text
                    ┌─────────────────────────┐
   Browser ────────►│  Nitro / HTTP handler   │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     extension-security   Server Actions     extension-auth
     • headers / CSP      / pages            • sessão / cookie
     • rate limit IP      • render SSR       • CSRF
     • nonce hidratação                      • roles
                                             • invalidação
```

- **Security** protege a *superfície* (headers, abuso por IP, CSP).
- **Auth** protege a *identidade* (quem é o usuário, se o request é legítimo, se a sessão ainda vale).

---

## 2. Setup mínimo de produção

### 2.1 Origins compartilhadas

```ts
// src/config/origins.ts
export const ALLOWED_ORIGINS = ["https://app.example.com"] as const;
```

### 2.2 Auth

```ts
// src/auth.ts
import { createAuth } from "@adaptive-js/extension-auth/server";
import { createPostgresAuthAdapter } from "./auth-adapter";
import { ALLOWED_ORIGINS } from "./config/origins";

export const auth = createAuth({
  adapter: createPostgresAuthAdapter(),
  csrf: { allowedOrigins: [...ALLOWED_ORIGINS] },
  rateLimit: {
    createSession: { max: 10, windowMs: 15 * 60 * 1000 },
  },
  onAuditEvent(e) {
    logger.info("auth", e);
  },
});
```

### 2.3 Security

```ts
// src/security.ts
import { createSecurity } from "@adaptive-js/extension-security";
import { ALLOWED_ORIGINS } from "./config/origins";
import { redisRateLimitStorage } from "./redis";

export const security = createSecurity({
  allowedOrigins: [...ALLOWED_ORIGINS],
  rateLimit: {
    storage: redisRateLimitStorage,
  },
});
```

### 2.4 Nitro

```ts
import { setSecurityPlugin } from "@adaptive-js/adapter-nitro";
import { security } from "../src/security";

setSecurityPlugin(security.asNitroPlugin());
```

---

## 3. Fluxos que você precisa implementar

### Login

1. Validar senha (seu código)
2. `auth.login(user, request)` → `Set-Cookie`
3. Redirect com `sanitizeReturnTo`

### Página privada

```tsx
export default auth.protectPage(async ({ session }) => <Dashboard user={session.user} />);
```

### Mutação

```ts
export const save = auth.action(async ({ session, formData }) => { /* ... */ });
```

Form com `csrfToken` hidden.

### Troca de senha

```ts
await updatePassword(...);
await auth.passwordChanged(userId);
```

### Logout

```ts
const { cookie } = await auth.logout(request);
// Set-Cookie blank + redirect
```

---

## 4. O que cada request deve garantir

| Tipo | Security | Auth |
|------|----------|------|
| GET página pública | headers + rate limit global | — |
| GET página privada | headers + rate limit | `protectPage` / `requireSession` |
| POST login | rate limit | `createSession` (+ rate limit createSession) |
| POST action | `protectAction` | `auth.action` (sessão + CSRF + role) |

---

## 5. Checklist rápido (P0)

- [ ] Origins HTTPS iguais em auth e security
- [ ] Adapter de sessão de produção
- [ ] Cookie Secure/HttpOnly (`__Host-` quando possível)
- [ ] `auth.action` em toda mutação autenticada
- [ ] `passwordChanged` / `roleElevated` / `mfaEnabled` nos fluxos de risco
- [ ] Security plugin no Nitro (nonce CSP)
- [ ] Rate limit Redis se houver mais de uma instância
- [ ] `onAuditEvent` ligado

Checklist completo: [auth/docs/07-security-checklist.md](../extension/auth/docs/07-security-checklist.md)

---

## 6. Onde aprofundar

**Auth**

- [Getting Started](../extension/auth/docs/01-getting-started.md)
- [Server Actions](../extension/auth/docs/02-server-actions.md)
- [Adapters](../extension/auth/docs/05-adapters.md)
- [Troubleshooting](../extension/auth/docs/09-troubleshooting.md)

**Security**

- [Getting Started](../extension/security/docs/01-getting-started.md)
- [Headers e CSP](../extension/security/docs/02-headers-and-csp.md)
- [Rate limiting](../extension/security/docs/03-rate-limiting.md)

---

## 7. Princípios (não negociar)

1. **Server authority** — client só espelha UI  
2. **Secure by default** — o caminho fácil é o seguro  
3. **Fail closed** — config inválida quebra no boot, não em silêncio  
4. **Defense in depth** — CSRF + Origin + SameSite + rate limit + headers  
5. **Audit best-effort** — observabilidade sem derrubar auth  

Se um atalho violar um desses princípios, não é atalho: é dívida de segurança.
