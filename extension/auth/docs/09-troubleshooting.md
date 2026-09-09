# 09 — Troubleshooting

---

## “CSRF_ORIGIN_INVALID”

**Causas comuns**

- Request sem header `Origin` (alguns clientes, redirects, ferramentas)
- Origin não está em `csrf.allowedOrigins` (http vs https, www vs apex, porta)
- Typo na lista de origins

**O que fazer**

- Confirme no DevTools o header `Origin` da action
- Normalize: `createAuth` já valida e normaliza via `URL.origin`
- Em dev, inclua `http://localhost:PORT` explicitamente

---

## “CSRF_TOKEN_INVALID”

- Token não foi enviado (faltou hidden input ou header)
- Token de **outra** sessão (usuário com duas abas, sessão renovada e form antigo)
- Comparação falhou (encoding, espaços)

**Mitigação**

- Sempre ler token fresco do server ao renderizar o form
- Preferir header `x-adaptive-csrf-token` em clients SPA se o form for longe da renderização

---

## Sessão “some” após alguns requests

- `freshCookie` não foi aplicado na resposta → browser continua com id antigo já invalidado (após grace)
- Use `auth.action`, `protectPage` ou `withSession` para não esquecer

---

## “AUTHENTICATION_REQUIRED” logo após login

- `Set-Cookie` não foi enviado ou foi sobrescrito
- Cookie `Secure` em página HTTP
- Path/Domain do cookie não batem com a URL
- Prefixo `__Host-` em HTTP local → use cookie de dev

---

## Rate limit 429 inesperado

- IP extraído de `X-Forwarded-For` sem proxy confiável (IP do proxy ou de atacante)
- Configure o trust do proxy no edge e teste `extractClientIp`
- Storage memory reinicia com o processo (contadores zeram) — em prod use Redis

---

## Role nunca autoriza

- `user.roles` não vem do adapter (`getUser` incompleto)
- String diferente (`Admin` vs `admin`) — comparação é exata

---

## protectPage sempre 404

- Session null (cookie não chega no server component)
- Role faltando com default `onForbidden: "404"`
- `readSession` lançou `AuthError` (user deleted) → tratado como unauthenticated

Teste com `onUnauthenticated: "401"` temporariamente para distinguir.

---

## CSP bloqueia hidratação

- Security plugin não registrado → nonce no script ≠ nonce no header (ou sem nonce)
- `script-src` custom sem incluir o nonce
- Confirme `setSecurityPlugin(security.asNitroPlugin())`

---

## Audit não aparece

- Handler não configurado
- Handler lançou (é best-effort — erro é engolido)
- Você filtrou o tipo errado no logger

---

## Como debugar rápido

1. Logar `event.type` em `onAuditEvent`
2. Inspecionar `Set-Cookie` e `Origin` nas actions
3. `auth.readSession(request)` num endpoint de debug (só em dev)
4. Rodar a suíte `npm test` no pacote `extension-auth` (csrf, sessions, security)
