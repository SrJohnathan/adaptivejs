# 08 — Integração: auth + security + Nitro

Este é o desenho recomendado para um app AdaptiveJS em produção.

---

## Responsabilidades

| Módulo | Cuida de |
|--------|----------|
| `@adaptive-js/extension-auth` | Sessão, cookie, CSRF, roles, invalidação, `auth.action` |
| `@adaptive-js/extension-security` | Headers (CSP, HSTS, …), rate limit por IP/rota, nonce de hidratação |
| Adapter Nitro / core | Wiring de request/response, plugin de security, Server Actions |

Eles **não** se substituem. Auth não seta CSP; security não valida CSRF de sessão.

---

## Arquivos canônicos

```ts
// src/config/origins.ts
export const ALLOWED_ORIGINS = ["https://app.example.com"] as const;
```

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
  onAuditEvent(event) {
    // envie para seu logger / SIEM
  },
});
```

```ts
// src/security.ts
import { createSecurity } from "@adaptive-js/extension-security";
import { ALLOWED_ORIGINS } from "./config/origins";

export const security = createSecurity({
  allowedOrigins: [...ALLOWED_ORIGINS],
  // rateLimit: { storage: redisStorage } em multi-instância
});
```

```ts
// server/entry.ts (ou bootstrap Nitro)
import { setSecurityPlugin } from "@adaptive-js/adapter-nitro";
import { security } from "../src/security";

setSecurityPlugin(security.asNitroPlugin());
```

A partir daí, em cada SSR:

1. Nonce aleatório por request
2. Nonce no `<script>` de hidratação
3. Mesmo nonce em `Content-Security-Policy: script-src 'nonce-…'`

---

## Ordem sugerida no handler (uso manual)

Se não usar o plugin automático:

```ts
export default eventHandler(async (event) => {
  security.applyHeaders(event);          // 1. headers
  await security.rateLimit(event);       // 2. rate limit global

  if (event.method === "POST" && event.path === "/_action") {
    await security.protectAction(event, {
      actionName: /* do body */,
    });
    // dentro da action: auth.action já faz sessão + CSRF
    return handleAction(event);
  }

  return handleSsr(event);
});
```

---

## Login end-to-end (visão única)

1. User POST `/login` com email/senha  
2. Seu código valida credencial  
3. `auth.login(user, request)` → cookie de sessão  
4. Security já limitou tentativas por IP (e auth pode limitar por user/IP no `createSession`)  
5. Redirect para `sanitizeReturnTo(returnTo) ?? "/dashboard"`  
6. Dashboard usa `auth.protectPage`  
7. Form de perfil usa `auth.action` + hidden CSRF  
8. Security aplica CSP/headers em todas as respostas  

---

## Dev vs produção

| Tema | Dev | Produção |
|------|-----|----------|
| Origin | `http://localhost:3000` | HTTPS reais |
| Cookie | nome sem `__Host-`, `secure: false` | default `__Host-` |
| Adapter | memory | Postgres/Redis |
| Rate limit storage | memory | Redis |
| HSTS (security) | off | on (só HTTPS) |
| Audit | console | logger real |

---

## Erros frequentes de integração

1. **Origins diferentes** entre auth e security → CSRF passa, ou rate limit/CORS mental fica inconsistente.  
2. **Esquecer `setSecurityPlugin`** → CSP sem nonce, scripts de hidratação bloqueados.  
3. **Memory adapter em prod** → sessões somem no deploy.  
4. **Rate limit só no security** → login ainda pode ser abuseado por userId se não houver limite no `createSession`.  
5. **Action sem `auth.action`** → CSRF esquecido.

---

## Próximos docs

- Auth: [01 Getting Started](./01-getting-started.md), [07 Checklist](./07-security-checklist.md)
- Security: veja `extension/security/docs/`
- Visão unificada do monorepo: `docs/security-and-auth.md`
