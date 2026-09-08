# @adaptive-js/extension-security

> Módulo de segurança de aplicação para AdaptiveJS — **secure by default**.

Security headers, rate limiting e guards de runtime prontos para uso. Um `createSecurity()` sem opções já aplica proteções sólidas. Você só configura o que precisa mudar.

---

## Instalação

```bash
npm install @adaptive-js/extension-security
```

---

## Quick start

```ts
// src/security.ts
import { createSecurity } from "@adaptive-js/extension-security";

export const security = createSecurity();
```

Isso é suficiente para um projeto. Os defaults cobrem os headers mais importantes com valores seguros.

---

## Integração com o adapter Nitro

Para que os headers sejam aplicados automaticamente em todas as respostas — incluindo o nonce correto no `<script>` de hidratação — registre o plugin no bootstrap do servidor:

```ts
// server/entry.ts (ou equivalente)
import { setSecurityPlugin } from "@adaptive-js/adapter-nitro";
import { security } from "../src/security";

setSecurityPlugin(security.asNitroPlugin());
```

A partir desse ponto, em cada renderização SSR:
1. Um nonce criptograficamente aleatório é gerado por requisição
2. O nonce aparece no `<script nonce="…">` de hidratação (`window.__ROUTE__`, `__PARAMS__`, `__QUERYS__`)
3. O mesmo nonce é incluído em `Content-Security-Policy: script-src 'nonce-…'`

---

## Integração com `@adaptive-js/extension-auth`

Compartilhe a lista de origens entre os dois módulos:

```ts
// src/auth.ts
import { createAuth } from "@adaptive-js/extension-auth/server";
import { memoryAdapter } from "@adaptive-js/extension-auth";

export const auth = createAuth({
  adapter: memoryAdapter(),
  csrf: {
    allowedOrigins: ["https://app.example.com"],
  },
});
```

```ts
// src/security.ts
import { createSecurity } from "@adaptive-js/extension-security";

export const security = createSecurity({
  allowedOrigins: ["https://app.example.com"],
});
```

A `allowedOrigins` que o auth usa para validar CSRF e a que o security usa para rate limiting seguem a mesma fonte de verdade — basta extrair a lista para uma constante compartilhada.

---

## Uso manual no handler

Se preferir controle explícito em vez do `asNitroPlugin()`:

```ts
import { eventHandler } from "h3";
import { security } from "../src/security";

export default eventHandler(async (event) => {
  // 1. Headers em toda resposta
  security.applyHeaders(event);

  // 2. Rate limit global por IP
  await security.rateLimit(event);

  // 3. Guard adicional no endpoint de actions
  if (event.method === "POST" && event.path === "/_action") {
    await security.protectAction(event, { actionName: body.action });
    return handleAction(event);
  }

  return handleSsr(event);
});
```

---

## API

### `createSecurity(options?)`

Factory principal. Valida a configuração no boot (fail-closed) e retorna um `SecurityInstance`.

```ts
import { createSecurity } from "@adaptive-js/extension-security";

const security = createSecurity({
  allowedOrigins: ["https://app.example.com"],
});
```

---

### `SecurityInstance`

#### `security.applyHeaders(target, options?)`

Aplica todos os headers de segurança configurados na resposta.

```ts
// Com nonce (para scripts inline)
const nonce = security.generateNonce();
security.applyHeaders(event, { nonce });

// Sem nonce (para respostas não-HTML)
security.applyHeaders(event);
```

#### `security.rateLimit(request, context?)`

Avalia o rate limit global por IP. Lança `SecurityError` (status 429) se excedido. Aplica automaticamente os headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` e `Retry-After`.

```ts
await security.rateLimit(event);

// Com chave customizada (ex: por usuário autenticado)
await security.rateLimit(event, { key: `user:${session.userId}` });
```

#### `security.protectAction(request, context?)`

Guard completo para o endpoint `/_action`. Aplica rate limit por IP (pool global) e por IP + action name (pool específico).

```ts
await security.protectAction(event, {
  actionName: "updateProfile",
  moduleId: "actions/user",
});
```

#### `security.install(adapter)`

Instala hooks automáticos em um adapter Nitro ou `http.Server`. Alternativa ao `asNitroPlugin()` quando não precisa de nonce.

```ts
// Nitro
security.install(nitroApp);

// Node http.Server
security.install(server);
```

#### `security.generateNonce()`

Gera um nonce base64 criptograficamente aleatório (16 bytes). Use para injetar em scripts inline.

```ts
const nonce = security.generateNonce();
// ex: "k3j9mBzXqP2wL8nR5tY1cA=="
```

#### `security.buildCspHeader(nonce?)`

Monta o valor do header `Content-Security-Policy` com ou sem nonce.

```ts
const csp = security.buildCspHeader(nonce);
// "default-src 'self'; script-src 'nonce-k3j9...' 'self'; ..."
```

#### `security.asNitroPlugin()`

Retorna um `NitroSecurityPlugin` para uso com `setSecurityPlugin()` do adapter Nitro.

```ts
import { setSecurityPlugin } from "@adaptive-js/adapter-nitro";

setSecurityPlugin(security.asNitroPlugin());
```

---

## Opções de configuração

```ts
const security = createSecurity({
  // Anti-iframe / clickjacking
  // "deny" → X-Frame-Options: DENY + CSP frame-ancestors 'none'
  // "sameorigin" → X-Frame-Options: SAMEORIGIN
  // false → desabilitado
  frameguard: "deny",

  // Content-Security-Policy
  // false → desabilitado
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc:  ["'self'", "'unsafe-inline'"],
    imgSrc:    ["'self'", "data:", "https:"],
    fontSrc:   ["'self'"],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri:   ["'self'"],
    formAction: ["'self'"],
    objectSrc: ["'none'"],
  },

  // Strict-Transport-Security (só emite em HTTPS)
  // false → desabilitado
  hsts: {
    maxAge: 31_536_000,      // 1 ano
    includeSubDomains: true,
    preload: false,
  },

  // X-Content-Type-Options: nosniff
  nosniff: true,

  // Referrer-Policy
  referrerPolicy: "strict-origin-when-cross-origin",

  // Permissions-Policy
  // false → desabilitado
  // [] → feature bloqueada para todas as origens
  // ["self"] → permitida apenas para o próprio origin
  permissionsPolicy: {
    camera:       [],
    microphone:   [],
    geolocation:  [],
    payment:      [],
    usb:          [],
    "interest-cohort": [],
  },

  // Cross-Origin-Opener-Policy
  // false → desabilitado
  coop: "same-origin",

  // Cross-Origin-Resource-Policy
  // false → desabilitado
  corp: "same-origin",

  // Cross-Origin-Embedder-Policy (opt-in — quebra embeds de terceiros)
  // false → desabilitado por padrão
  coep: false,

  // Rate limiting
  // false → desabilitado
  rateLimit: {
    global:  { max: 300, windowMs: 60_000 }, // por IP, todas as rotas
    actions: { max: 60,  windowMs: 60_000 }, // por IP, endpoint /_action
  },

  // Origens confiáveis (compartilhar com extension-auth)
  allowedOrigins: ["https://app.example.com"],

  // Sobrescreve detecção automática de process.env.NODE_ENV
  isProduction: true,
});
```

---

## Defaults de produção

Sem nenhuma opção, `createSecurity()` aplica:

| Header | Valor |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'nonce-…' 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` *(só HTTPS)* |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| Rate limit global | 300 req/min por IP (prod) |
| Rate limit `/_action` | 60 req/min por IP (prod) |

Em desenvolvimento os limites sobem para 1000/200 req/min e HSTS é desligado.

---

## Comportamento por ambiente

| | Development | Production |
|--|-------------|------------|
| Headers de segurança | ✅ Aplicados | ✅ Aplicados |
| HSTS | ❌ Desligado (HTTP local) | ✅ Ligado (somente HTTPS) |
| Rate limit | Permissivo (1000/200 req/min) | Restritivo (300/60 req/min) |
| Logs de erro | Detalhados | Genéricos |
| Validação de origens | Apenas formato | Formato + reject em boot |

---

## Exemplos por caso de uso

### App com CDN e iframes controlados

```ts
export const security = createSecurity({
  allowedOrigins: ["https://app.example.com"],

  // Permitir iframes do próprio origin (ex: preview de conteúdo)
  frameguard: "sameorigin",

  csp: {
    imgSrc: ["'self'", "https://cdn.example.com"],
    frameAncestors: ["'self'"],
  },
});
```

### Rate limit com Redis (produção multi-instância)

```ts
import { createClient } from "redis";
import { createSecurity } from "@adaptive-js/extension-security";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

export const security = createSecurity({
  allowedOrigins: ["https://app.example.com"],
  rateLimit: {
    global:  { max: 500, windowMs: 60_000 },
    actions: { max: 100, windowMs: 60_000 },
    // Qualquer objeto com .increment(key, windowMs) funciona
    storage: {
      async increment(key, windowMs) {
        const pipeline = redis.multi();
        pipeline.incr(key);
        pipeline.pExpire(key, windowMs);
        const [count] = await pipeline.exec() as [number, number];
        const ttl = await redis.pTTL(key);
        return { count, resetAt: Date.now() + ttl };
      },
    },
  },
});
```

### Desabilitar proteções explicitamente

```ts
// Não recomendado — use só quando realmente necessário
export const security = createSecurity({
  frameguard: false,   // o dev assume o risco
  csp: false,          // útil em embeds/iframes controlados
  rateLimit: false,    // quando o rate limit é feito por proxy externo
});
```

### Com COEP (isolamento forte — opt-in)

Habilita `SharedArrayBuffer` e timers de alta resolução, mas bloqueia embeds de terceiros que não enviam `CORP`.

```ts
export const security = createSecurity({
  coep: "require-corp",
  corp: "same-origin",
  coop: "same-origin",
});
```

---

## Erros

```ts
import { SecurityError } from "@adaptive-js/extension-security";

try {
  await security.rateLimit(event);
} catch (err) {
  if (err instanceof SecurityError) {
    console.log(err.code);   // "RATE_LIMIT_EXCEEDED" | "ACTION_GUARD_REJECTED" | ...
    console.log(err.status); // 429 | 403 | 500
  }
}
```

### Serialização de erro para resposta

```ts
import { SecurityError, toSecurityResponseBody } from "@adaptive-js/extension-security";

try {
  await security.protectAction(event, { actionName: body.action });
} catch (err) {
  if (err instanceof SecurityError) {
    return Response.json(toSecurityResponseBody(err), { status: err.status });
    // { ok: false, error: "RATE_LIMIT_EXCEEDED", message: "Too many requests." }
  }
  throw err;
}
```

---

## Utilitários standalone

Os builders de header são exportados individualmente caso você queira usá-los fora de um `SecurityInstance`:

```ts
import {
  buildCspHeader,
  buildHstsHeader,
  buildFrameguardHeader,
  buildPermissionsPolicyHeader,
  generateNonce,
  MemoryRateLimitStorage,
} from "@adaptive-js/extension-security";

const nonce = generateNonce();
const csp = buildCspHeader({ defaultSrc: ["'self'"], scriptSrc: ["'self'"] }, nonce);
const hsts = buildHstsHeader({ maxAge: 31_536_000, includeSubDomains: true });
const pp = buildPermissionsPolicyHeader({ camera: [], microphone: [] });
```

---

## Relação com outros módulos

| Módulo | Responsabilidade |
|--------|-----------------|
| `@adaptive-js/extension-auth` | Identidade, sessão, CSRF token |
| `@adaptive-js/core` | Baseline do endpoint `/_action` (Origin check, Content-Type, erros genéricos em produção) |
| **`@adaptive-js/extension-security`** | Headers de browser, Permissions-Policy, rate limiting, nonce, integração com adapter |

> `extension-security` **complementa**, não substitui, o `extension-auth`. Sessão e CSRF continuam sendo responsabilidade do módulo auth.

---

## Licença

MIT
