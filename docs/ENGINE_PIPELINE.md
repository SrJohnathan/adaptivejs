# AdaptiveJS Engine Pipeline

End-to-end map of how AdaptiveJS turns app source into HTML on the server and a live UI in the browser.

This document lists **principal files only**, so maintainers can make focused changes without opening every module.

---

## 1. Big picture

```text
 App source (TSX/TS)
        │
        ▼
 ┌────────────────── build time (@adaptive-js/ci) ──────────────────┐
 │  directives → thunk transform → oxc-transform → server graph     │
 │  client/hydrate stubs → Rolldown client bundles + manifests      │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────── request time (core + adapter) ─────────────────┐
 │  match route → run page module → renderToString (+ markers)      │
 │  assemble HTML template + data island + script tags              │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────── browser (@adaptive-js/web) ────────────────────┐
 │  parse hydration payload → load client modules → hydrate DOM     │
 │  attach reactivity → SPA navigations reuse same contract         │
 └──────────────────────────────────────────────────────────────────┘
```

**Packages involved**

| Package | Role |
|---------|------|
| `@adaptive-js/jsx` | Low-level JSX factory / types (`createElement`, node shape) |
| `@adaptive-js/web` | Client runtime: reactivity, hydration, router, public jsx-runtime |
| `@adaptive-js/core` | Server router, `renderToString`, server actions |
| `@adaptive-js/shared` | Shared types, routing matchers, hydration payload helpers |
| `@adaptive-js/ci` | Dev server, production build, oxc + Rolldown orchestration |
| `@adaptive-js/adapter-nitro` | Production HTTP/SSR adapter (Nitro) |

---

## 2. Source model (what developers write)

### 2.1 Pages and components

Typical app layout (scaffold):

```text
src/
  pages/           # file-based routes
  components/
  actions/         # optional server actions
  auth.ts / security.ts
```

Pages are TSX modules whose **default export** is the page component (often wrapped by `auth.protectPage` etc.).

### 2.2 Directives (build-time behavior switches)

| Directive (file top) | Meaning |
|----------------------|---------|
| `"hydrate"` | Component runs on server **and** hydrates on client (SSR HTML + client continuity) |
| `"client"` | Client-only boundary: server emits a placeholder boundary; real UI mounts in the browser |
| `"use server"` / `"server"` | Server action / server-only module (not shipped as app UI bundle logic) |

Detection and stub generation live in:

- `packages/ci/src/transpile-jsx.ts` — `getHydratableDirective`, `createServerClientStub`
- `packages/ci/src/utilly.ts` — directive parsing helpers
- `packages/ci/src/esm-rolldown.ts` — `hasServerDirective`, `isServerActionModule`

### 2.3 JSX runtime

- Compiler/transform targets the classic automatic runtime imports.
- Public surface for apps is often `@adaptive-js/web/jsx-runtime` (re-exports).
- Core element shape comes from `@adaptive-js/jsx`.

**Principal files**

- `packages/jsx/src/jsx-runtime.ts`
- `packages/web/src/jsx-runtime.ts`
- `packages/ci/src/transpile-jsx.ts` (`normalizePublicJsxImports`)

### 2.4 Optional `@thunk` (reactivity sugar)

JSDoc / comment `@thunk` on a component tells the **thunk transform** to wrap JSX value expressions in `() => …` so the reactive runtime can track them.

**Principal file:** `packages/ci/src/thunk-transform.ts`

---

## 3. Build pipeline (`@adaptive-js/ci`)

Entry points:

- Dev: `packages/ci/src/dev-server.ts`, `rebuild-dev.ts`, `build.ts` (`buildAppDev`)
- Prod: `packages/ci/src/build.ts` (`buildApp`), `nitro.ts`

### 3.1 Stage A — Per-file server transpile

For each source file under `src/`:

```text
read .tsx/.ts
  → applyThunkTransform (if @thunk)
  → oxc-transform (TS/TSX → JS + sourcemap)
  → rewrite relative imports (.ts → .js) + normalize jsx import specifiers
  → write into server output graph
```

**If the file is `"hydrate"` or `"client"`:**

1. Emit a **server stub** as the main server module:
   - `createHydrateComponent(moduleId, exportName, serverImpl?)` or
   - `createClientComponent(moduleId, exportName)`
2. For `"hydrate"`, also emit a companion `*.__client_ssr.js` with the real component implementation for SSR.

**Principal files**

- `packages/ci/src/transpile-jsx.ts` — `buildServerFile`, `buildTransformedFile`, `createServerClientStub`
- `packages/ci/src/thunk-transform.ts`
- `packages/ci/src/utilly.ts`

**Tooling:** [oxc-transform](https://github.com/oxc-project/oxc) (`transform()` from `oxc-transform`).

### 3.2 Stage B — Client bundle (Rolldown)

Client entries are discovered from hydrate/client boundaries and page client graphs, then bundled with **Rolldown**.

```text
collect client entry module IDs
  → rolldown build (ESM, code splitting)
  → client dist: JS chunks, CSS handling, manifests
```

**Principal files**

- `packages/ci/src/esm-rolldown.ts` — `bundleClientEntries`, CSS plugin, server-only proxy plugin
- `packages/ci/src/build.ts` — orchestrates server tree build + client bundle + metadata

**Outputs (typical)**

```text
.adaptivejs/ or adaptive-runtime/
  server/                 # transpiled server modules (oxc output)
  client/                 # Rolldown bundles
    index.html            # template shell
    manifest.json         # entry → chunk mapping
    asset-manifest.json
    build-meta.json       # build id (cache bust / live reload)
```

### 3.3 Stage C — Dev vs prod differences

| Concern | Dev | Prod |
|---------|-----|------|
| HTTP | `dev-server.ts` (H3) | `adapter-nitro` handler |
| Rebuild | incremental `rebuild-dev.ts` | full `buildApp` |
| Live reload | `live-reload.ts` (SSE + optional inline client) | none |
| Assets | unminified / fast path | minify + compress paths in `build.ts` |

---

## 4. Request-time SSR (`@adaptive-js/core`)

### 4.1 Routing

`createRouter(url, routes, options)`:

1. Parse URL (path, query)
2. Match file-based / configured routes (`matchRouteServer`)
3. Dynamic-import the **server** page module
4. Call the page (async component) with request context
5. Handle redirects, not-found, metadata
6. `renderToString` / `renderToStringWithMetadata`
7. Resolve client entry scripts + styles from manifests
8. Return `{ html, status, params, query, clientEntries, clientStyles, setCookies, metadata, … }`

**Principal files**

- `packages/core/src/ssr/create-route.ts` — `createRouter`
- `packages/core/src/ssr/parse.ts` — path matching
- `packages/shared/src/routing.ts` — shared match helpers (as used by server/client)
- `packages/core/src/ssr/response.ts` — response shaping helpers

### 4.2 `renderToString`

Walks the Adaptive virtual tree (JSX nodes / components / primitives) and produces HTML **plus hydration structure**:

- Comment **markers** for reactive regions and boundaries (start/end pairs with ids)
- `data-aid` attributes for hydrateable nodes
- **Hydration manifest** entries (what the client must wire)
- Special handling for **client** vs **hydrate** boundaries (`renderClientBoundary`)

**Principal files**

- `packages/core/src/ssr/render-to-string.ts` — main renderer
- `packages/core/src/hydration/client-boundary.ts` — boundary mode constants / markers
- `packages/core/src/hydration/hydration-manifest.ts` — manifest shape
- `packages/core/src/hydration/hydration-supported-props.ts` — which props survive hydration

Mental model:

```text
VNode tree
  → HTML strings
  → <!-- adaptive markers --> around reactive / boundary regions
  → manifest describing ids, kinds, props snapshots
```

### 4.3 Server actions

POST to `/_action` (name may vary by adapter):

- Origin / content-type baseline checks (framework)
- Resolve and run server action module
- Often combined with `extension-auth` (`auth.action`) and `extension-security` (`protectAction`)

**Principal file:** `packages/core/src/actions/handle_actions_request.ts`

---

## 5. HTML assembly (adapter layer)

SSR result is injected into an HTML shell.

### 5.1 Template

Default shell concept:

```html
<!doctype html>
<html>
  <head>
    <!--adaptive-head-->
    <!--hydration-script-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
  </body>
</html>
```

### 5.2 Hydration payload (route bootstrap)

**Not** executable inline JS. JSON data island:

```html
<script type="application/json" id="__ADAPTIVE_HYDRATION__">
  {"route":"/login","params":{},"query":{}}
</script>
```

Built by `@adaptive-js/shared` so **dev and prod share one contract**.

**Principal files**

- `packages/shared/src/hydration-payload.ts` — `buildHydrationPayloadHtml`, `parseHydrationPayload`, `applyHydrationPayloadToWindow`
- `packages/ci/src/dev-server.ts` — dev HTML assembly
- `packages/adapter-nitro/src/handler.ts` — production HTML assembly + optional security nonce/CSP

### 5.3 Client scripts and styles

From manifests:

```html
<link rel="stylesheet" href="…">
<script type="module" src="…"></script>
```

### 5.4 Security (optional but recommended)

`setSecurityPlugin(security.asNitroPlugin())`:

- Per-request CSP **nonce**
- Security headers on the response  
Data island does **not** need a script nonce (`type="application/json"` is not executed).

**Principal files**

- `packages/adapter-nitro/src/handler.ts` — plugin slot + `applyHeaders`
- `extension/security` — `createSecurity`, CSP, rate limit

---

## 6. Browser runtime (`@adaptive-js/web`)

### 6.1 Boot sequence

```text
1. Parse HTML (DOM already has SSR markup + markers)
2. applyHydrationPayloadToWindow(document)
   → window.__ROUTE__ / __PARAMS__ / __QUERYS__
3. Load ESM client entries (type="module")
4. Router init + hydrateClientComponents / hydrate walk
5. Reactive system attaches effects to marked regions
```

**Principal files**

- `packages/web/src/front/router.ts` — path/query/params, SPA navigation
- `packages/web/src/hydration/hidrate.ts` — DOM hydration engine (large)
- `packages/web/src/hydration/boundary-component.ts` — client/hydrate boundaries
- `packages/web/src/hydration/client-component.ts` — `createClientComponent`
- `packages/web/src/hydration/hydrate-component.ts` — `createHydrateComponent` (if split)
- `packages/web/src/hydration/client-boundary.ts` — marker constants (client side)
- `packages/web/src/reactive/*` — signals / effects / observers

### 6.2 Hydration strategy (summary)

1. Locate boundary / reactive markers in the DOM  
2. Match them to the client VNode / component for that `moduleId`  
3. Reuse existing DOM where possible; patch text/attrs where needed  
4. Bind events and reactive subscriptions  
5. Record mismatches for debugging (`__ADAPTIVE_HYDRATION_MISMATCHES__`)

Server and client must agree on **marker format**, **ids**, and **manifest**. Changing one side without the other breaks hydration.

### 6.3 Client-side navigation

Router fetches HTML for the next URL, swaps `#root` content, then:

- Reads the new `#__ADAPTIVE_HYDRATION__` island (no `eval`)
- Imports any new module scripts
- Re-hydrates as needed

**Principal file:** `packages/web/src/front/router.ts`

---

## 7. Reactivity model (short)

- Values used in JSX may be plain values or **thunks** `() => value` (often from `@thunk` transform).
- The reactive runtime tracks reads inside effects and updates DOM regions delimited by markers.
- SSR renders the **current** value; the client resumes updates without a full remount when hydration succeeds.

**Principal files**

- `packages/web/src/reactive/reactive.ts`
- `packages/web/src/reactive/events.ts`
- `packages/web/src/reactive/adaptive-observer.ts`
- `packages/web/src/hydration/keyed-reactive-block.ts`

---

## 8. End-to-end timeline (one page request)

| Step | Where | Principal files |
|------|--------|-----------------|
| 1. HTTP request | Dev server or Nitro | `ci/src/dev-server.ts`, `adapter-nitro/src/handler.ts` |
| 2. Route match + page import | core SSR | `core/src/ssr/create-route.ts`, `parse.ts` |
| 3. Run page component | app `src/pages/…` + stubs | app sources, `web` boundary factories |
| 4. Render HTML + markers | core | `core/src/ssr/render-to-string.ts` |
| 5. Build data island + inject template | adapter / ci | `shared/src/hydration-payload.ts`, `dev-server.ts`, `handler.ts` |
| 6. Optional security headers | security + nitro | `extension/security`, `handler.ts` |
| 7. Browser parses HTML | browser | — |
| 8. Apply payload + load modules | web | `router.ts`, client chunks from Rolldown |
| 9. Hydrate + react | web | `hidrate.ts`, `boundary-component.ts`, `reactive/*` |

---

## 9. “Where do I change X?” cheat sheet

| Goal | Start here |
|------|------------|
| TSX compile / syntax transform | `ci/src/transpile-jsx.ts`, oxc options |
| Auto-wrap reactive JSX | `ci/src/thunk-transform.ts` |
| Client/hydrate server stubs | `transpile-jsx.ts` → `createServerClientStub` |
| Client split / CSS / manifests | `ci/src/esm-rolldown.ts` |
| Full build orchestration | `ci/src/build.ts` |
| Route matching / page load | `core/src/ssr/create-route.ts` |
| HTML output & markers | `core/src/ssr/render-to-string.ts` |
| Hydration payload format | `shared/src/hydration-payload.ts` |
| Dev HTML response | `ci/src/dev-server.ts` |
| Prod HTML response | `adapter-nitro/src/handler.ts` |
| DOM hydrate algorithm | `web/src/hydration/hidrate.ts` |
| Boundary semantics | `web/src/hydration/boundary-component.ts` |
| SPA navigation | `web/src/front/router.ts` |
| Server actions protocol | `core/src/actions/handle_actions_request.ts` |
| CSP / headers | `extension/security`, nitro `setSecurityPlugin` |

---

## 10. Invariants (do not break casually)

1. **Server stub moduleId** must match **client Rolldown entry** ids used at hydrate time.  
2. **Marker pairs** emitted by `renderToString` must match what `hidrate.ts` understands.  
3. **Hydration payload** must stay a non-executable JSON island (or update client + CSP docs together).  
4. **`"client"`** boundaries must not run browser-only code during SSR (stub design).  
5. **`"hydrate"`** boundaries need a real SSR implementation companion (`*.__client_ssr.js`).  
6. Dev and prod HTML assembly must preserve the same placeholders: `<!--app-html-->`, `<!--hydration-script-->`, `#root`.

---

## 11. Related docs

- Auth/Security product guides: `extension/auth/docs/*`, `extension/security/docs/*`
- Unified security story: `docs/security-and-auth.md` (when present in the monorepo)

---

*This map is intentionally incomplete on leaf utilities. Prefer principal files above; drill into imports only when changing a specific stage.*
