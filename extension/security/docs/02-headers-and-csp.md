# 02 — Headers e CSP

---

## Headers aplicados por default

| Header | Default |
|--------|---------|
| X-Frame-Options | DENY |
| Content-Security-Policy | ver abaixo |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), … |
| Strict-Transport-Security | max-age=31536000; includeSubDomains *(só prod + HTTPS)* |
| Cross-Origin-Opener-Policy | same-origin |
| Cross-Origin-Resource-Policy | same-origin |
| Cross-Origin-Embedder-Policy | off (opt-in) |

---

## CSP e nonce

```ts
const nonce = security.generateNonce();
security.applyHeaders(event, { nonce });
// ou
const csp = security.buildCspHeader(nonce);
```

Default de diretivas (resumo):

```text
default-src 'self';
script-src 'nonce-…' 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

### Customizar

```ts
createSecurity({
  csp: {
    imgSrc: ["'self'", "https://cdn.example.com"],
    connectSrc: ["'self'", "https://api.example.com"],
    frameAncestors: ["'self'"], // se precisar de iframe same-origin
  },
  frameguard: "sameorigin",
});
```

Desligar CSP (não recomendado):

```ts
createSecurity({ csp: false });
```

### style-src e 'unsafe-inline'

O default permite inline styles por compatibilidade com muitos apps.  
Quando puder, migre para nonces/hashes em estilo e remova `'unsafe-inline'`.

---

## Frameguard

```ts
frameguard: "deny" | "sameorigin" | false
```

- `deny` → X-Frame-Options DENY + CSP `frame-ancestors 'none'`
- `sameorigin` → permite embed do próprio origin

---

## HSTS

Só emitido quando `isProduction` e a request é HTTPS.

```ts
hsts: {
  maxAge: 31_536_000,
  includeSubDomains: true,
  preload: false,
}
```

`hsts: false` desliga.

---

## COOP / CORP / COEP

```ts
coop: "same-origin",           // default
corp: "same-origin",           // default
coep: false,                   // opt-in: "require-corp" | "credentialless"
```

Ligar COEP habilita `SharedArrayBuffer`, mas quebra embeds de terceiros sem CORP adequado.

---

## Permissions-Policy

```ts
permissionsPolicy: {
  camera: [],
  microphone: [],
  geolocation: [],
  // [] = bloqueado para todos
  // ["self"] = só o próprio origin
}
```

`permissionsPolicy: false` desliga o header.
