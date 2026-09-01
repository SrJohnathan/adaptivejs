# AGENTS.md — AdaptiveJS

Guia para agentes e LLMs trabalhando neste repositório.

Este projeto usa **AdaptiveJS**: SSR + hidratação DOM-first + reatividade explícita (getters/setters) + rotas por arquivo em `src/pages`.

**Obrigatório:** leia `.cursor/skills/adaptivejs/SKILL.md` antes de escrever código AdaptiveJS.
Exemplos extras: `.cursor/skills/adaptivejs/examples.md`.

Não assuma React/Next/Solid. Prefira as APIs de `@adaptive-js/web` e as extensões `@adaptive-js/*` quando existirem no `package.json`.

---

## Primeiros passos (sempre)

1. Leia `README.md` e `package.json` para saber estilo (tailwind/beer/none) e extensões instaladas.
2. Suba o app:
   ```bash
   npm install
   npm run dev
   ```
3. Confirme a home em `src/pages/index.tsx` e o 404 em `src/pages/404.tsx`.
4. Antes de criar features grandes, respeite a estrutura:
   - páginas → `src/pages/**`
   - UI reutilizável → `src/components/**`
   - lógica server-only → módulos com diretiva `"server"` / `"use server"`
   - CSS global → `public/styles.css`
   - deps globais de client → `dependency.ts`

### Regras rápidas do framework

- Rotas vêm de `src/pages` (file-based). `src/pages/404.tsx` é especial: status 404, não rota `/404`.
- Interatividade: componentes com `"hydrate"` (SSR + bind) ou `"client"` (monta no browser).
- Estado: `useReactive`, `useEffect`, `useMemo`, `batch`, `createStore` de `@adaptive-js/web`.
- Getters são a leitura ao vivo: `count()`, não `count`.
- Comunicação entre componentes: `createHandler` / `useHandler`.
- Redirect SSR: `redirect()` de `@adaptive-js/core` (quando disponível no fluxo da página).
- Página inexistente ou `{ __type: "not-found" }` → renderiza `src/pages/404.tsx`.
- Auth (se instalado): proteja no **server** com `auth.protectPage(...)`. Nunca confie só em check client.
- Não invente APIs de React (`useState`, `useEffect` do React, Next `app/` router, etc.).

### Exemplo mínimo interativo

```tsx
"hydrate";

import { useReactive } from "@adaptive-js/web";

export function Counter() {
  const [count, setCount] = useReactive(0);

  return (
    <button onClick={() => setCount((value) => value + 1)}>
      {() => `Count: ${count()}`}
    </button>
  );
}
```

### Nova página

```tsx
// src/pages/pricing.tsx → /pricing
export default function PricingPage() {
  return (
    <main>
      <h1>Pricing</h1>
    </main>
  );
}
```

---

## Trilha: construir um SaaS pequeno

Objetivo: um SaaS mínimo com landing, auth, área logada, billing stub e settings.

Siga na ordem. Cada etapa deve compilar e abrir no browser antes da próxima.

### Etapa 0 — Base do produto

- [ ] Defina o produto em 1 frase (ex.: “notas privadas com compartilhamento”).
- [ ] Ajuste `src/pages/index.tsx` para landing (hero, CTA, link para login/signup).
- [ ] Garanta `src/pages/404.tsx` amigável.
- [ ] Mantenha estilos em `public/styles.css` (Tailwind se o scaffold usou Tailwind).

### Etapa 1 — Modelo de domínio

Crie tipos e um repositório simples (começando em memória):

```txt
src/
  domain/
    types.ts          # User, Workspace, Plan, Subscription
    store.ts          # memória ou adapter DB
  server/
    users.ts
    workspaces.ts
```

Sugestão de entidades mínimas:

- `User` — id, email, name, roles
- `Workspace` — id, name, ownerId
- `Membership` — userId, workspaceId, role (`owner` | `member`)
- `Plan` — `free` | `pro`

### Etapa 2 — Auth server-first

Se `@adaptive-js/extension-auth` estiver instalado:

1. Configure `src/auth.ts` (memory adapter no dev; adapter real depois).
2. Cookie de desenvolvimento:
   ```ts
   cookie: { name: "adaptive.session.dev", secure: false }
   ```
3. Em produção: cookie `__Host-...` + `secure: true` + `csrf.allowedOrigins`.
4. Crie páginas:
   - `src/pages/login.tsx`
   - `src/pages/signup.tsx` (opcional no MVP)
5. Server actions para login/logout/signup (módulos `"use server"`).
6. Após credenciais válidas: `auth.createSession(user)` e `Set-Cookie`.
7. Proteja a área logada:

```tsx
// src/pages/app/index.tsx
import { auth } from "../../auth";

export default auth.protectPage(async ({ session }) => {
  return <h1>Olá, {session.user.email}</h1>;
});
```

Sem sessão válida → HTTP 404 via `src/pages/404.tsx` (não vaze HTML da página protegida).

Sem a extensão auth: implemente cookie de sessão próprio no server, mas mantenha a mesma regra — proteção no servidor.

### Etapa 3 — App shell logado

- [ ] `src/pages/app/index.tsx` — dashboard
- [ ] `src/pages/app/settings.tsx` — perfil / workspace
- [ ] Layout visual compartilhado em `src/components/app-shell.tsx` (`"hydrate"` se precisar de UI interativa)
- [ ] Navegação: Dashboard · Settings · Billing · Logout

### Etapa 4 — Recurso principal do SaaS (CRUD)

Escolha **um** recurso (ex.: Notes, Projects, Links).

- [ ] `src/pages/app/notes/index.tsx` — listagem
- [ ] `src/pages/app/notes/[id].tsx` — detalhe/edição (rota dinâmica)
- [ ] Mutations via server actions (`"use server"`)
- [ ] Autorização: só membros do workspace veem/editam

Padrão dinâmico AdaptiveJS:

- `src/pages/app/notes/[id].tsx` → `/app/notes/:id`

### Etapa 5 — Billing (stub)

Não precisa integrar Stripe de verdade no dia 1.

- [ ] `src/pages/app/billing.tsx`
- [ ] Planos `free` / `pro` no domínio
- [ ] Botão “Upgrade” que chama server action e atualiza o plano em memória/DB
- [ ] Gate de feature: server checa plano antes de ações premium

Depois: troque o stub por webhook/checkout real.

### Etapa 6 — i18n e polish (opcional)

Se `@adaptive-js/extension-i18n` existir:

- [ ] Use `I18nProvider` / `useI18n` de `src/i18n.ts`
- [ ] Textos em `language/<locale>/*.json`
- [ ] Landing + app shell traduzíveis

Se icons existir:

- [ ] Use `@adaptive-js/extension-lucide-animation-icons` em CTAs/nav

### Etapa 7 — Produção

- [ ] Trocar memory auth adapter por persistência real
- [ ] CSRF `allowedOrigins` com o domínio real
- [ ] Cookie seguro `__Host-`
- [ ] `npm run build` + `npm run preview`
- [ ] Deploy com adapter Nitro / Netlify (veja `netlify.toml` se presente)

---

## Checklist MVP SaaS

| Item | Rota / arquivo | Pronto? |
|---|---|---|
| Landing | `/` | |
| Login | `/login` | |
| Dashboard protegido | `/app` | |
| Recurso CRUD | `/app/...` | |
| Settings | `/app/settings` | |
| Billing stub | `/app/billing` | |
| 404 | `src/pages/404.tsx` | |
| Auth server-side | `src/auth.ts` + `protectPage` | |

---

## O que evitar

- Copiar padrões de React Router / Next App Router sem adaptar ao file routing do AdaptiveJS.
- Proteger páginas só no client (`if (!user) return <Login />`) sem `protectPage`/check server.
- Colocar lógica de negócio sensível em componentes `"client"` / `"hydrate"`.
- Esquecer que getters reativos precisam ser lidos como função: `value()`.
- Criar rota `/404` manual — use `src/pages/404.tsx`.
- Commits ou mudanças fora do pedido do usuário.

---

## Referência rápida de pacotes

| Pacote | Papel |
|---|---|
| `@adaptive-js/web` | JSX, hydrate, reatividade, handlers |
| `@adaptive-js/ci` | `dev` / `build` / `preview` / `start` |
| `@adaptive-js/adapter-nitro` | SSR deployment |
| `@adaptive-js/extension-auth` | sessões, CSRF, `protectPage` |
| `@adaptive-js/extension-i18n` | i18n reativo + loader |
| `@adaptive-js/extension-lucide-animation-icons` | ícones animados |

Repo do framework: https://github.com/antonioweb/adaptivejs
