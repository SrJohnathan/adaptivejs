---
name: adaptivejs
description: >-
  Author AdaptiveJS apps with SSR, DOM-first hydration, fine-grained reactivity,
  and file-based routing. Use when writing or editing AdaptiveJS/TSX pages,
  hydrate/client components, useReactive/createStore/handlers, src/pages routes,
  404.tsx, server actions, @adaptive-js/web, @adaptive-js/components, extension-auth,
  extension-i18n, or when the user mentions AdaptiveJS / Adaptive.
---

# AdaptiveJS

AdaptiveJS is **not** React, Next, Solid, or Vue. Do not invent React APIs.

Mental model:

- SSR HTML is honest
- `"hydrate"` reuses that HTML and binds events/reactivity
- `"client"` mounts only in the browser
- reactivity uses **getters/setters**: read `count()`, write `setCount(...)`
- routes come from `src/pages/**` (file-based)

Canonical live demos: look at `examples/hello2` in the AdaptiveJS monorepo when available.

For app workflow / SaaS trail, also read `AGENTS.md` in the project root.

## Project layout

```txt
dependency.ts          # global client entry (no "client" needed)
public/styles.css      # global CSS (Tailwind: @import "tailwindcss")
src/pages/index.tsx    # /
src/pages/about.tsx    # /about
src/pages/404.tsx      # HTTP 404 page (NOT a /404 route)
src/components/*.tsx   # reusable UI
```

Dynamic routes: `src/pages/notes/[id].tsx` → `/notes/:id`.

## Directives

| Directive | Use |
|---|---|
| (none / server page) | SSR page/default export in `src/pages` |
| `"hydrate"` / `'hydrate'` | SSR + client bind (main interactive mode) |
| `"client"` | Browser-only subtree (`window`, Monaco, EditorJS, etc.) |
| `"server"` / `"use server"` | Server-only module / actions (RPC from client) |

## Core APIs (`@adaptive-js/web`)

| API | Role |
|---|---|
| `useReactive(init)` | `[get, set]` signal |
| `createStore({...})` | object of `[get, set]` tuples per key |
| `useRef(init)` | `{ current }` |
| `useEffect` / `useLayoutEffect` | effects with deps |
| `useClientEffect` | client-only effect |
| `useDOMEffect` | imperative DOM setup + cleanup |
| `useMemo` | memo |
| `batch` / `untrack` | batch updates / read without tracking |
| `createHandler` / `useHandler` | broadcast callbacks between components |
| `createContext` / `useContext` | scoped context (`Provider({ value, children })`) |

## Basic patterns

### Reactive hydrate component

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

Rules:

- Read signals as functions: `count()`
- Reactive text/children often use `{() => ...}`
- Prefer updater form: `setCount((v) => v + 1)`

### Page (SSR)

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

### Handlers (broadcast)

```tsx
"hydrate";
import { createHandler, useHandler, useReactive } from "@adaptive-js/web";

export function Receiver() {
  const [msg, setMsg] = useReactive("idle");
  createHandler("notify", () => setMsg("ping"));
  return <p>{() => msg()}</p>;
}

export function Sender() {
  const notify = useHandler("notify");
  return <button onClick={() => notify()}>Ping</button>;
}
```

### Store

```tsx
"hydrate";
import { createStore } from "@adaptive-js/web";

const store = createStore({ count: 0, label: "hi" });
store.count[0]();           // get
store.count[1]((n) => n + 1); // set
store.label[1]("yo");
```

### Client-only (browser APIs)

```tsx
"client";

import { useClientEffect, useRef } from "@adaptive-js/web";

export function BrowserOnly() {
  const root = useRef<HTMLDivElement | null>(null);

  useClientEffect(() => {
    // safe: window / third-party editors live here
    return () => {};
  }, []);

  return <div ref={root} />;
}
```

### Lists / tables (`@adaptive-js/components`)

```tsx
"hydrate";
import { ListCanvas, convertItemNode, type ItemList } from "@adaptive-js/components";

const Item: ItemList<{ item: { label: string }; index: number }> = ({ item }) => (
  <p>{item.label}</p>
);

<ListCanvas
  items={rows}
  height={320}
  itemHeight={72}
  item={(item, index) => convertItemNode(Item, { item, index })}
/>
```

Also: `TableCanvas`, `TableVirtual`, `ListVirtual`.

### Auth (if `@adaptive-js/extension-auth` installed)

```tsx
import { auth } from "../auth";

export default auth.protectPage(async ({ session }) => {
  return <h1>{session.user.email}</h1>;
});
```

No session / missing role → HTTP 404 via `src/pages/404.tsx`. Protect on the **server**, never only on the client.

### 404

Missing route or `{ __type: "not-found" }` renders `src/pages/404.tsx`.

## Do / Don't

**Do**

- Use `@adaptive-js/web` JSX (`jsxImportSource` already set in tsconfig)
- Put routes in `src/pages`
- Use `"hydrate"` for progressive interactivity
- Keep secrets and auth checks on the server

**Don't**

- Use React `useState` / Next `app/` conventions / Solid stores
- Read signals without calling them (`count` instead of `count()`)
- Treat `src/pages/404.tsx` as a normal `/404` page route
- Put `window` access in SSR/hydrate top-level without `"client"`

## Richer examples

When the AdaptiveJS monorepo is available, study:

| File | Shows |
|---|---|
| `examples/hello2/src/components/Button.tsx` | `useReactive` + `useHandler` |
| `examples/hello2/src/components/Button2.tsx` | `createStore` + `createHandler` |
| `examples/hello2/src/components/CallbacksDemo.tsx` | `onInput` / `onClick` / `onSubmit` / `onScroll` |
| `examples/hello2/src/components/ListDemo.tsx` | `ListCanvas` (1M rows) |
| `examples/hello2/src/components/TableDemo.tsx` | `TableCanvas` / `TableVirtual` |
| `examples/hello2/src/components/CodeEditor.tsx` | `"client"` + `useDOMEffect` / Monaco |
| `examples/hello2/src/components/ClientOnlyProbe.tsx` | `"client"` + `window` |

More snippets: [examples.md](examples.md)
