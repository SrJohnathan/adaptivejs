# 07 — Checklist de segurança (produção)

Use este checklist antes de cada release. Itens marcados com **P0** são bloqueantes.

---

## Boot e configuração

- [ ] **P0** — `csrf.allowedOrigins` com origins HTTPS reais (sem wildcard)
- [ ] **P0** — Adapter de produção (não memory)
- [ ] **P0** — Cookie com `Secure` + `HttpOnly` (default `__Host-adaptive-session`)
- [ ] **P0** — `onAuditEvent` configurado (warning em prod se faltar)
- [ ] Cookie name sem `Domain` quando usar prefixo `__Host-`
- [ ] `sessionDuration` / `absoluteSessionDuration` conscientes do risco do produto

---

## Sessão e cookie

- [ ] **P0** — Toda resposta que pode renovar sessão propaga `freshCookie`
- [ ] Preferir `auth.withSession` / `auth.action` / `protectPage` para não esquecer cookie
- [ ] Logout devolve cookie em branco
- [ ] “Sair de todos os dispositivos” chama `logoutEverywhere` / `passwordChanged` conforme o caso

---

## CSRF e mutações

- [ ] **P0** — Toda mutação autenticada passa por `auth.action` **ou** `requireSession` + `requireCsrf`
- [ ] Forms enviam token CSRF (hidden ou header)
- [ ] Requests de action têm header `Origin` válido
- [ ] Nenhuma mutação via GET
- [ ] Não usar `protectAction` sozinho para escrita (ele não exige CSRF)

---

## Autorização

- [ ] **P0** — Roles checadas no server (`auth.action` / `protectPage` / `requireRole`)
- [ ] UI esconde botões por UX, mas nunca é a única barreira
- [ ] Após elevação de role → `roleElevated(userId)`

---

## Eventos de risco

- [ ] **P0** — Reset/troca de senha → `passwordChanged`
- [ ] Ativação de MFA → `mfaEnabled`
- [ ] Compromisso / atividade suspeita → `forceReauth`
- [ ] Session binding só se o produto realmente precisar (cuidado com IP)

---

## Rate limiting

- [ ] Rate limit em `createSession` (auth) **ou** no endpoint de login
- [ ] Rate limit de superfície (IP / `/_action`) via `@adaptive-js/extension-security`
- [ ] Em multi-instância: storage Redis (não memory) nos dois módulos

---

## Client

- [ ] `toAuthClientState` não vaza campos sensíveis
- [ ] Expiração tratada na UI (clear / redirect)
- [ ] CSRF token não fica em estado global desnecessário

---

## Integração

- [ ] **P0** — Mesma lista `ALLOWED_ORIGINS` em auth e security
- [ ] Security plugin registrado no Nitro (`setSecurityPlugin` / `asNitroPlugin`)
- [ ] CSP com nonce alinhado ao script de hidratação

---

## Testes

- [ ] CSRF rejeita origin inválido / token inválido
- [ ] Sessão expirada não autoriza
- [ ] Role insuficiente → 403/404 conforme config
- [ ] `sanitizeReturnTo` rejeita URL externa
- [ ] Cookie flags em produção (Secure/HttpOnly)
- [ ] Race de renovação (grace) não desloga request paralela

---

## Operação

- [ ] Logs/audit de `session.rejected`, `csrf.rejected`, `session.invalidated`
- [ ] Job de limpeza de sessões expiradas no storage
- [ ] Rotação de segredos / procedimento de incidente documentado (invalidar todas as sessões)
