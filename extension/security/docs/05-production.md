# 05 — Produção (Security)

---

## Checklist

- [ ] `createSecurity` com `allowedOrigins` alinhados ao auth
- [ ] `setSecurityPlugin(security.asNitroPlugin())` no bootstrap
- [ ] Rate limit storage **Redis** (ou equivalente) em multi-instância
- [ ] HSTS ativo (HTTPS real)
- [ ] CSP testada no browser (hydração + scripts de terceiros necessários)
- [ ] `frameguard` adequado ao produto (deny vs sameorigin)
- [ ] Proxy confia / sobrescreve `X-Forwarded-For` corretamente
- [ ] Monitorar 429 e ajustar `max` / `windowMs`

---

## Dev vs prod (comportamento do módulo)

| Item | Development | Production |
|------|-------------|------------|
| Headers | aplicados | aplicados |
| HSTS | desligado | ligado (HTTPS) |
| Rate limit | 1000 / 200 req/min | 300 / 60 req/min |
| Validação de origins | formato | formato + fail no boot se inválido |
| Mensagens de erro | mais detalhadas | genéricas (“Too many requests.”) |

Force o modo com `isProduction: true` se o `NODE_ENV` não for confiável no runtime.

---

## CDN e assets

```ts
createSecurity({
  csp: {
    imgSrc: ["'self'", "https://cdn.example.com"],
    fontSrc: ["'self'", "https://cdn.example.com"],
    scriptSrc: ["'self'"], // nonce continua sendo injetado pelo buildCspHeader
  },
});
```

Sempre teste a home e uma action no Chrome DevTools → painel de CSP violations.

---

## Desligar proteções

Só com motivo documentado:

```ts
createSecurity({
  frameguard: false,
  csp: false,
  rateLimit: false,
});
```

Cada `false` é um risco consciente, não um default.
