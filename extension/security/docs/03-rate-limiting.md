# 03 — Rate limiting

---

## Defaults

| Ambiente | Global (por IP) | Actions `/_action` (por IP) |
|----------|-----------------|-----------------------------|
| Production | 300 / min | 60 / min |
| Development | 1000 / min | 200 / min |

Janela: fixed window (`windowMs`).

---

## API

```ts
// Global
await security.rateLimit(event);
// ou chave custom (ex.: usuário autenticado)
await security.rateLimit(event, { key: `user:${session.userId}` });

// Guard de actions (global pool de actions + pool por action name)
await security.protectAction(event, {
  actionName: "updateProfile",
  moduleId: "user",
});
```

Em excesso → `SecurityError` com `code: "RATE_LIMIT_EXCEEDED"`, status **429**, headers:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After`

---

## Storage

Default: **in-memory** (ok para single process / dev).

Produção multi-instância:

```ts
import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

export const security = createSecurity({
  rateLimit: {
    global: { max: 500, windowMs: 60_000 },
    actions: { max: 100, windowMs: 60_000 },
    storage: {
      async increment(key, windowMs) {
        const pipeline = redis.multi();
        pipeline.incr(key);
        pipeline.pExpire(key, windowMs);
        const results = await pipeline.exec();
        const count = Number(results?.[0]?.[1] ?? 1);
        const ttl = await redis.pTTL(key);
        return { count, resetAt: Date.now() + Math.max(ttl, 0) };
      },
    },
  },
});
```

Qualquer objeto com `increment(key, windowMs) => { count, resetAt }` serve.

---

## IP do cliente

`extractClientIp` olha, nesta ordem:

1. `X-Forwarded-For` (primeiro hop)
2. `X-Real-IP`
3. `CF-Connecting-IP`

**Importante:** só confie nesses headers se o edge/proxy estiver configurado corretamente. Caso contrário um cliente pode forjar o IP.

---

## Relação com rate limit do auth

| Camada | Onde | Chave típica | Objetivo |
|--------|------|--------------|----------|
| Security | todas as rotas / `/_action` | IP | Abuso de superfície |
| Auth | `createSession` | IP + userId | Credential stuffing no login |

Use **os dois**.

---

## Desligar

```ts
createSecurity({ rateLimit: false });
// ou
rateLimit: { global: false, actions: false }
```

Só faça isso se outro sistema (API gateway, Cloudflare) já cobre de forma equivalente.
