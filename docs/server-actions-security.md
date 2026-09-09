# Segurança das Server Actions — AdaptiveJS

**Escopo analisado**
- `packages/core/src/actions/handle_actions_request.ts`
- `packages/adapter-nitro/src/handler.ts`
- `packages/ci/src/dev-server.ts`
- `packages/ci/src/esm-rolldown.ts` (geração do manifest)
- `extension/auth/src/server.ts` (`auth.action`)

**Data da análise:** 2026-09-05  
**Última atualização da implementação:** 2026-09-07

---

## Checklist de implementação

- [x] Origin check no endpoint `/_action` (Host + `allowedOrigins`)
- [x] Integração `auth.action()` (CSRF + sessão automáticos)
- [x] Falha no boot se `csrf.allowedOrigins` não estiver configurado (quando auth estiver presente)
- [x] Rate limiting mínimo por IP no core (120 req/min)
- [x] Mensagens de erro genéricas em produção
- [x] Validação obrigatória de Content-Type (`application/json` ou `multipart/form-data`)
- [x] Geração do manifest `server-modules.json` no build e no dev-server
- [x] Manifest obrigatório em produção (sem fallback silencioso)
- [x] Allowlist via manifest também em dev (quando manifest existe)
- [x] Fetch Metadata (`Sec-Fetch-Site: cross-site` → 403)
- [x] `allowedOrigins` configurável via `adaptive.config` e `ADAPTIVE_ACTION_ALLOWED_ORIGINS`
- [ ] Documentação do “Happy Path” seguro no README principal
- [x] Testes de segurança no core (`handle_actions_request.test.ts`)
- [x] Adapters Nitro e dev-server passam metadados de request + allowedOrigins

---

## Fluxo interno atual no `/_action`

1. Validar método (POST)
2. Validar Content-Type (obrigatório)
3. Rejeitar `Sec-Fetch-Site: cross-site`
4. Validar Origin (quando presente) contra Host + allowlist
5. Rate limit por IP
6. Resolver módulo + action (manifest em produção; manifest ou `actions/` em dev)
7. Executar handler (actions autenticadas usam `auth.action()` para CSRF + sessão)
8. Tratar erros sem vazar detalhes em produção

---

## Configuração de origens adicionais

```ts
// adaptive.config.ts
export default {
  actions: {
    allowedOrigins: ["https://trusted-partner.com"],
  },
};
```

Ou via variável de ambiente:

```bash
ADAPTIVE_ACTION_ALLOWED_ORIGINS=https://trusted-partner.com,https://staging.example.com
```

Quando `@adaptive-js/extension-auth` está instalado, use a mesma lista em `csrf.allowedOrigins`.

---

## API recomendada para actions autenticadas

```ts
import { auth } from "../auth";

export const updateProfile = auth.action(async ({ session, args }) => {
  // CSRF + sessão já validados
  return { ok: true, userId: session.userId };
});

export const adminOnly = auth.action({ roles: ["admin"] }, async ({ session }) => {
  return { ok: true, admin: session.userId };
});
```

---

## Itens P2 pendentes

- Schema de input (Zod / Valibot) integrado ao runtime
- Rate limit configurável por action via `extension-security`
- Helper `action.public()` explícito para actions sem auth

---

*Documento original gerado a partir da análise do código na branch `master`. Implementação iniciada em 2026-09-07.*
