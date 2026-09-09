# 01 — Getting Started (Security)

Headers, CSP com nonce, rate limit e guards de runtime — **secure by default**.

---

## Instalação

```bash
npm install @adaptive-js/extension-security
```

---

## Mínimo viável

```ts
// src/security.ts
import { createSecurity } from "@adaptive-js/extension-security";

export const security = createSecurity();
```

Sem opções já aplica:

- `X-Frame-Options: DENY`
- CSP restritiva (com suporte a nonce)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- Permissions-Policy bloqueando camera/mic/geolocation/…
- COOP / CORP `same-origin`
- Rate limit global e de actions (limites mais altos em dev)

---

## Ligar no Nitro (recomendado)

```ts
// server/entry.ts
import { setSecurityPlugin } from "@adaptive-js/adapter-nitro";
import { security } from "../src/security";

setSecurityPlugin(security.asNitroPlugin());
```

Efeito por request SSR:

1. Gera nonce criptográfico
2. Injeta no `<script nonce="…">` de hidratação
3. Coloca o mesmo nonce em `Content-Security-Policy`

Sem esse passo, CSP e script de hidratação podem divergir e a página quebra no browser.

---

## Com origins (alinhar ao auth)

```ts
import { createSecurity } from "@adaptive-js/extension-security";
import { ALLOWED_ORIGINS } from "./config/origins";

export const security = createSecurity({
  allowedOrigins: [...ALLOWED_ORIGINS],
});
```

---

## Uso manual (sem plugin)

```ts
export default eventHandler(async (event) => {
  const nonce = security.generateNonce();
  security.applyHeaders(event, { nonce });
  await security.rateLimit(event);

  if (event.method === "POST" && event.path === "/_action") {
    await security.protectAction(event, { actionName: "updateProfile" });
  }

  return render(event, { nonce });
});
```

---

## O que este módulo não faz

- Não gerencia sessão nem CSRF → `@adaptive-js/extension-auth`
- Não valida senha
- Não substitui WAF / rate limit de edge (Cloudflare, etc.) — complementa

---

## Próximos

- [02 — Headers e CSP](./02-headers-and-csp.md)
- [03 — Rate limiting](./03-rate-limiting.md)
- [04 — Integração com auth](./04-integration-with-auth.md)
