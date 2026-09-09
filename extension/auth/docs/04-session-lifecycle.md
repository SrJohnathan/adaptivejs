# 04 — Ciclo de vida da sessão

---

## Tempos

| Opção | Default | Significado |
|-------|---------|-------------|
| `sessionDuration` | 30 dias | Idle timeout (renovável) |
| `absoluteSessionDuration` | 90 dias | Teto absoluto (não renova além disso) |
| `renewBefore` | 7 dias | Quando `remaining <= renewBefore`, rotaciona o id |

Uma sessão ativa pode ser renovada várias vezes, mas **nunca** passa de `absoluteExpiresAt`.

---

## Criação

```ts
const { session, cookie } = await auth.login(user, request);
// ou
const { session, cookie } = await auth.createSession(user, { data: { theme: "dark" } }, request);

response.headers.append("Set-Cookie", cookie.header);
```

### Rate limit na criação

```ts
export const auth = createAuth({
  adapter,
  csrf: { allowedOrigins: [...] },
  rateLimit: {
    createSession: {
      max: 10,
      windowMs: 15 * 60 * 1000, // 15 min
      // key default: combina IP + userId quando possível
    },
  },
});
```

Isso protege o ponto de entrada de sessão (brute force / credential stuffing no endpoint que chama `createSession`).  
Complementa o rate limit por IP do `@adaptive-js/extension-security`.

---

## Leitura e renovação

```ts
const { session, freshCookie } = await auth.readSession(request);
// session pode ser null

const { session, freshCookie } = await auth.requireSession(request);
// lança AuthError se não houver sessão
```

### Race condition e grace window

Quando várias requests paralelas disparam renovação ao mesmo tempo, o módulo:

1. Serializa a renovação por `sessionId` (`renewalInFlight`)
2. Mantém o id antigo aceito por ~15s (`renewalGraceCache`)

Assim o browser não fica com cookie “órfão” de uma sessão já deletada.

**Sempre** propague `freshCookie` quando existir:

```ts
if (freshCookie) {
  response.headers.append("Set-Cookie", freshCookie.header);
}
```

Ou use o helper:

```ts
return auth.withSession(request, async ({ session }) => {
  return Response.json({ user: session.user });
  // freshCookie aplicado automaticamente quando possível
});
```

---

## Dados na sessão

```ts
// Guardar progresso de MFA, preferências, etc. sem rotacionar o id
await auth.updateSessionData(session.id, { mfaStep: "totp" });
await auth.updateSessionData(session.id, (prev) => ({
  cart: [...(prev.cart as any[] ?? []), item],
}));
```

O `csrfToken` **nunca** entra no tipo público `AuthSession` nem em `listUserSessions`.

---

## Invalidação

| Método | Efeito |
|--------|--------|
| `logout(request)` | Invalida sessão do cookie atual + cookie em branco |
| `logoutEverywhere(userId)` | Todas as sessões do usuário |
| `invalidateUserSessionsExcept(userId, currentId)` | Outros dispositivos, mantém o atual |
| `passwordChanged(userId)` | Todas + audit + hook |
| `roleElevated(userId)` | Todas + audit + hook |
| `mfaEnabled(userId)` | Todas + audit + hook |
| `forceReauth(userId)` | Todas + audit |

### Quando invalidar

| Evento | Chamada recomendada |
|--------|---------------------|
| Reset / troca de senha | `passwordChanged` |
| Mudança de role privilegiada | `roleElevated` |
| Ativação de MFA | `mfaEnabled` |
| Compromisso suspeito | `forceReauth` ou `suspiciousActivity` (via hook) |
| “Sair de todos os dispositivos” na UI | `logoutEverywhere` |

---

## Session binding (anti-sequestro)

Opt-in:

```ts
createAuth({
  adapter,
  csrf: { allowedOrigins: [...] },
  sessionBinding: {
    userAgent: true,
    // ip: true,        // evite em mobile/CGNAT
    // fingerprint: true // se o app enviar header x-client-fingerprint
  },
});
```

Se o binding não bater na `requireSession` / renovação → sessão invalidada + audit `session.rejected`.

---

## Listar sessões (UI de dispositivos)

```ts
const sessions = await auth.listUserSessions(userId);
// [{ id, userId, createdAt, expiresAt, absoluteExpiresAt }, ...]
// sem csrfToken
```

Requer que o adapter implemente `listUserSessions`.

---

## Audit

```ts
createAuth({
  // ...
  onAuditEvent(event) {
    // event.type: session.created | session.renewed | session.invalidated | ...
    logger.info(event);
  },
});
```

- Em produção, ausência de `onAuditEvent` gera **warning** no boot.
- Falhas no handler de audit **não** quebram o fluxo de autenticação (best-effort).
