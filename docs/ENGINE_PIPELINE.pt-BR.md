# Pipeline do motor AdaptiveJS

Mapa de ponta a ponta: como o AdaptiveJS transforma o código da aplicação em HTML no servidor e em UI viva no browser.

Lista só os **arquivos principais**, para atualizações pontuais sem abrir o monorepo inteiro.

---

## 1. Visão geral

```text
 Código da app (TSX/TS)
        │
        ▼
 ┌────────────────── build (@adaptive-js/ci) ───────────────────────┐
 │  diretivas → thunk transform → oxc-transform → grafo server      │
 │  stubs client/hydrate → bundles Rolldown + manifests             │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────── request (core + adapter) ──────────────────────┐
 │  match de rota → módulo da page → renderToString (+ markers)     │
 │  monta HTML (template + data island + scripts)                   │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────── browser (@adaptive-js/web) ────────────────────┐
 │  lê payload de hidratação → carrega módulos → hidrata DOM        │
 │  reatividade → navegação SPA reutiliza o mesmo contrato          │
 └──────────────────────────────────────────────────────────────────┘
```

**Pacotes**

| Pacote | Papel |
|--------|------|
| `@adaptive-js/jsx` | Factory JSX / tipos de nó |
| `@adaptive-js/web` | Runtime de client: reatividade, hidratação, router |
| `@adaptive-js/core` | Router server, `renderToString`, server actions |
| `@adaptive-js/shared` | Tipos compartilhados, match de rotas, payload de hidratação |
| `@adaptive-js/ci` | Dev server, build, orquestração oxc + Rolldown |
| `@adaptive-js/adapter-nitro` | Adapter HTTP/SSR de produção (Nitro) |

---

## 2. Modelo de código-fonte

### 2.1 Pages e componentes

```text
src/
  pages/           # rotas por arquivo
  components/
  actions/         # server actions (opcional)
```

Page = módulo TSX com **export default** do componente (pode usar `auth.protectPage`, etc.).

### 2.2 Diretivas (mudam o build)

| Diretiva | Significado |
|----------|-------------|
| `"hydrate"` | Roda no server **e** hidrata no client |
| `"client"` | Boundary só de client: server emite placeholder; UI real no browser |
| `"use server"` / `"server"` | Módulo/action só de servidor |

**Arquivos principais**

- `packages/ci/src/transpile-jsx.ts` — detecção + stub
- `packages/ci/src/utilly.ts` — parse de diretivas
- `packages/ci/src/esm-rolldown.ts` — `hasServerDirective`, `isServerActionModule`

### 2.3 JSX runtime

- Transform aponta para o runtime automático de JSX.
- Superfície pública frequente: `@adaptive-js/web/jsx-runtime`.
- Forma do elemento: `@adaptive-js/jsx`.

**Arquivos:** `packages/jsx/src/jsx-runtime.ts`, `packages/web/src/jsx-runtime.ts`, normalização em `transpile-jsx.ts`.

### 2.4 `@thunk` (açúcar de reatividade)

Comentário/JSDoc `@thunk` no componente → **thunk transform** envolve expressões JSX em `() => …` para o runtime reativo.

**Arquivo:** `packages/ci/src/thunk-transform.ts`

---

## 3. Pipeline de build (`@adaptive-js/ci`)

Entradas:

- Dev: `dev-server.ts`, `rebuild-dev.ts`, `build.ts` (`buildAppDev`)
- Prod: `build.ts` (`buildApp`), `nitro.ts`

### 3.1 Etapa A — Transpile server (por arquivo)

```text
lê .tsx/.ts
  → applyThunkTransform (se @thunk)
  → oxc-transform (TS/TSX → JS + sourcemap)
  → reescreve imports relativos + normaliza specifiers JSX
  → grava grafo server
```

**Se o arquivo for `"hydrate"` ou `"client"`:**

1. Stub no server: `createHydrateComponent` / `createClientComponent`
2. Em `"hydrate"`, também gera `*.__client_ssr.js` com a implementação real para SSR

**Arquivos:** `transpile-jsx.ts`, `thunk-transform.ts`, `utilly.ts`  
**Ferramenta:** `oxc-transform`.

### 3.2 Etapa B — Bundle client (Rolldown)

```text
coleta entries client (boundaries hydrate/client)
  → rolldown (ESM, split)
  → dist client: chunks, CSS, manifests
```

**Arquivos:** `esm-rolldown.ts` (`bundleClientEntries`), `build.ts` (orquestração)

**Saídas típicas**

```text
server/          # módulos server (saída oxc)
client/
  index.html
  manifest.json
  asset-manifest.json
  build-meta.json
```

### 3.3 Dev vs produção

| Tema | Dev | Prod |
|------|-----|------|
| HTTP | `dev-server.ts` | `adapter-nitro` |
| Rebuild | incremental | build completo |
| Live reload | `live-reload.ts` | — |
| Assets | caminho rápido | minify/compress em `build.ts` |

---

## 4. SSR em tempo de request (`@adaptive-js/core`)

### 4.1 Routing

`createRouter(url, routes, options)`:

1. Parse da URL  
2. Match de rota  
3. Import dinâmico do módulo **server** da page  
4. Executa a page (async)  
5. Redirect / 404 / metadata  
6. `renderToString`  
7. Resolve scripts/styles via manifests  
8. Retorna `{ html, status, params, query, clientEntries, … }`

**Arquivos:** `core/src/ssr/create-route.ts`, `parse.ts`, helpers em `shared`

### 4.2 `renderToString`

Percorre a árvore Adaptive e gera HTML **com estrutura de hidratação**:

- Markers de comentário (pares início/fim + ids)
- `data-aid` em nós hidratáveis
- Manifest de hidratação
- Boundaries **client** vs **hydrate**

**Arquivos:** `render-to-string.ts`, `core/src/hydration/client-boundary.ts`, `hydration-manifest.ts`

### 4.3 Server actions

POST `/_action` → `handle_actions_request.ts`  
Integra com auth/security nas apps.

---

## 5. Montagem do HTML (adapter)

### 5.1 Template

Placeholders: `<!--adaptive-head-->`, `<!--hydration-script-->`, `<!--app-html-->`, `#root`.

### 5.2 Payload de hidratação

**Data island** (não executa JS):

```html
<script type="application/json" id="__ADAPTIVE_HYDRATION__">
  {"route":"/login","params":{},"query":{}}
</script>
```

**Arquivos:** `shared/src/hydration-payload.ts`, `ci/src/dev-server.ts`, `adapter-nitro/src/handler.ts`

### 5.3 Scripts e CSS do client

Tags `link` + `script type="module"` a partir dos manifests.

### 5.4 Security (opcional)

`setSecurityPlugin` → nonce CSP + headers.  
A data island **não** precisa de nonce.

---

## 6. Runtime no browser (`@adaptive-js/web`)

### 6.1 Boot

```text
1. DOM já tem HTML SSR + markers
2. applyHydrationPayloadToWindow(document)
3. Carrega entries ESM
4. Router init + hidratação de boundaries
5. Efeitos reativos nos trechos marcados
```

**Arquivos:** `front/router.ts`, `hydration/hidrate.ts`, `boundary-component.ts`, `client-component.ts`, `reactive/*`

### 6.2 Hidratação (resumo)

1. Achar markers no DOM  
2. Casar com componente client (`moduleId`)  
3. Reusar DOM; patch quando necessário  
4. Eventos + subscriptions  
5. Mismatches em `__ADAPTIVE_HYDRATION_MISMATCHES__`

Server e client precisam concordar em **markers**, **ids** e **manifest**.

### 6.3 Navegação SPA

Fetch HTML → troca `#root` → lê nova data island (sem `eval`) → importa módulos novos → re-hidrata.

**Arquivo:** `front/router.ts`

---

## 7. Reatividade (curto)

- JSX pode usar valor ou thunk `() => …` (muitas vezes via `@thunk`).
- Runtime registra leituras em effects e atualiza regiões marcadas.
- SSR grava o valor atual; o client continua sem remount completo se a hidratação fechar.

**Arquivos:** `reactive/reactive.ts`, `events.ts`, `adaptive-observer.ts`, `keyed-reactive-block.ts`

---

## 8. Linha do tempo de um request

| Passo | Onde | Arquivos principais |
|------|------|---------------------|
| 1. HTTP | Dev / Nitro | `dev-server.ts`, `handler.ts` |
| 2. Rota + import | core | `create-route.ts` |
| 3. Page | app + stubs | `src/pages`, factories em `web` |
| 4. HTML + markers | core | `render-to-string.ts` |
| 5. Template + island | ci / nitro | `hydration-payload.ts`, `dev-server.ts`, `handler.ts` |
| 6. Headers | security | `extension/security`, plugin nitro |
| 7–9. Browser | web | `router.ts`, `hidrate.ts`, `reactive/*` |

---

## 9. “Onde eu mudo X?”

| Objetivo | Comece em |
|----------|-----------|
| Compile TSX | `ci/src/transpile-jsx.ts` |
| Thunk reativo | `ci/src/thunk-transform.ts` |
| Stubs client/hydrate | `createServerClientStub` em `transpile-jsx.ts` |
| Bundle client / CSS | `ci/src/esm-rolldown.ts` |
| Orquestração de build | `ci/src/build.ts` |
| Match de rota | `core/src/ssr/create-route.ts` |
| HTML + markers | `core/src/ssr/render-to-string.ts` |
| Formato do payload | `shared/src/hydration-payload.ts` |
| HTML no dev | `ci/src/dev-server.ts` |
| HTML em prod | `adapter-nitro/src/handler.ts` |
| Algoritmo de hydrate | `web/src/hydration/hidrate.ts` |
| Boundaries | `web/src/hydration/boundary-component.ts` |
| SPA | `web/src/front/router.ts` |
| Server actions | `core/src/actions/handle_actions_request.ts` |
| CSP | `extension/security` + `setSecurityPlugin` |

---

## 10. Invariantes

1. `moduleId` do stub server = id de entry no client (Rolldown).  
2. Markers do `renderToString` = o que `hidrate.ts` entende.  
3. Payload de rota = data island JSON (ou mude client + CSP juntos).  
4. `"client"` não executa código de browser no SSR.  
5. `"hydrate"` precisa do companion `*.__client_ssr.js`.  
6. Dev e prod preservam `<!--app-html-->`, `<!--hydration-script-->`, `#root`.

---

## 11. Docs relacionados

- Auth/Security: `extension/auth/docs/*`, `extension/security/docs/*`
- Visão de segurança unificada: `docs/security-and-auth.md`

---

*Mapa propositalmente incompleto em utilitários folha. Use os arquivos principais; só desça nos imports ao alterar uma etapa específica.*
