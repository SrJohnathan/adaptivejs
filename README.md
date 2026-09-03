


# AdaptiveJS

<img src="adaptivejs_chameleon_no_logo.png" width="500" />

AdaptiveJS is an experimental TypeScript and TSX framework focused on:

- server rendering
- DOM-first hydration
- fine-grained reactivity
- file-based routing
- a small, explicit web runtime

The public npm scope is:

- `@adaptive-js/*`

## Status

AdaptiveJS is still experimental.

The web stack is already usable for real projects, but the framework is still evolving quickly. Some APIs are stable enough to build on, while other areas are still being refined as the project grows.

## What AdaptiveJS is

AdaptiveJS is a framework for building server-rendered web applications with a direct authoring model. The central idea is not to replay a classic global VDOM story. It is to keep **server, client, and hydration** explicit, predictable, and honest about the DOM.

In practical terms:

- the HTML produced on the server is not treated as a disposable draft that the client must immediately rewrite
- the runtime tries to preserve more of what was already generated
- the code makes clear what is static, what is reactive, and what actually needs to hydrate

The name **Adaptive** is about choosing the right execution context per slice of UI: sometimes the server should resolve everything; sometimes a hydrated island is enough; sometimes a tree should be born entirely on the client. One rigid model for the whole app is not assumed.

Authoring stays close to the filesystem:

- pages live in `src/pages`
- global dependencies can live in `dependency.ts`
- global CSS lives in `public/styles.css`
- interactive UI is built with TSX
- reactivity is explicit through getters and setters

## The three directives

These three modes are the backbone of the architecture—not marketing labels.

### `"server"`

Prioritizes work that must stay on the server.

Typical use:

- server actions and backend-only modules
- database access, secrets, request helpers
- logic that must never ship to the browser

Mark a module with `"server"` at the top, or place it under an `actions/` folder (see [Server Actions](#server-actions)).

### `"hydrate"`

The characteristic Adaptive path for progressive UI.

Behavior:

- the server already delivers real HTML
- the client attaches events, refs, and reactive bindings onto that DOM
- the subtree is not needlessly recreated

Use `"hydrate"` when first paint from the server matters and interactivity should light up after load.

### `"client"`

Client-first components.

Behavior:

- the component mounts directly in the browser
- it does not rely on existing SSR HTML for that subtree

Useful for browser-heavy widgets or UI that is naturally client-only.

```tsx
"hydrate";
// or: "client";
// or, in a backend module: "server";

import { signal } from "@adaptive-js/web";

export default function Counter() {
  const [count, setCount] = signal(0);
  return (
    <button onClick={() => setCount(count() + 1)}>
      {() => count()}
    </button>
  );
}
```

## Example

```tsx
import { signal } from "@adaptive-js/web";

export default function Page() {
  const [count, setCount] = signal(0);

  return (
    <main>
      <strong>{() => `Count: ${count()}`}</strong>
      <button onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
    </main>
  );
}
```

Reactive text and expressions in JSX must be **thunks** (`() => ...`) so the runtime can subscribe when signals are read. See [`@thunk`](#thunk-opt-in-jsx-transform) for optional sugar.

## Project structure

Typical app structure:

```txt
my-app/
  public/
    styles.css
  src/
    actions/
      feed.ts
    pages/
      index.tsx
  dependency.ts
  index.html
  package.json
```

### `src/actions`

Files under `src/actions` (or any nested folder named `actions`) are server action modules by convention. They run only on the server and become RPC proxies on the client—no directive required.

### `src/pages`

Routes are discovered from `src/pages`.

Examples:

- `src/pages/index.tsx` → `/`
- `src/pages/about.tsx` → `/about`
- `src/pages/404.tsx` → custom HTTP 404 page (not a normal route)

### `dependency.ts`

Global client dependency entry for the app.

Good use cases:

- global UI libraries
- global side effects
- theme bootstrapping
- app-wide styling dependencies

It does not need `"client"` or `export {}`.

### `public/styles.css`

Official global stylesheet for the app (plain CSS or Tailwind when the app chooses that path).

## Reactivity

AdaptiveJS uses fine-grained reactivity through getters and setters. Components do **not** re-render as a whole when a signal changes; only reactive boundaries (thunks, `events`, keyed branches) re-run.

### State

| API | Role |
|-----|------|
| `signal(initial)` | Local reactive state for the current component scope |
| `rootSignal(initial)` | Module-level signal (not tied to a component instance) |
| `ref(initial?)` | Mutable box (`.current`) without reactivity |
| `memo(compute)` | Derived value; tracks signals read inside `compute` |
| `store(object)` | Object of signals from an initial plain object |
| `rootStore(object)` | Module-level store |
| `batch(fn)` | Group updates and flush effects once |

```tsx
import { signal, memo, store } from "@adaptive-js/web";

const [count, setCount] = signal(0);
const double = memo(() => count() * 2);
const form = store({ name: "", age: 0 });
```

### Effects and lifecycle

| API | Role |
|-----|------|
| `events(fn, deps?)` | Reactive effect; re-runs when tracked signals (or deps) change |
| `layoutEvents(fn, deps?)` | Same as `events`, layout phase |
| `init(fn)` | Runs when the component instance appears; cleanup on unmount / hide |

```tsx
import { signal, events, init } from "@adaptive-js/web";

export function Widget() {
  const [n, setN] = signal(0);

  init(() => {
    console.log("mounted");
    return () => console.log("unmounted");
  });

  events(() => {
    document.title = `Count ${n()}`;
  });

  return <button onClick={() => setN(n() + 1)}>{() => n()}</button>;
}
```

### JSX reads must be reactive boundaries

```tsx
// Correct — thunk re-subscribes when count() changes
<p>{() => count()}</p>

// Incorrect — evaluated once when the component function runs
<p>{count()}</p>
```

Conditionals and lists follow the same rule unless you use `@thunk` or `Reveal`.

## `@thunk` (opt-in JSX transform)

Mark a component with `// @thunk` (or JSDoc `@thunk`) so the build can wrap JSX expressions that need reactivity:

```tsx
// @thunk
export function Counter() {
  const [count, setCount] = signal(0);

  return (
    <div>
      {/* becomes () => count() */}
      <p>{count()}</p>

      {/* becomes () => (count() > 0 ? ... : ...) */}
      {count() > 0 ? <Panel /> : <p>Empty</p>}

      {/* becomes () => items().map(...) */}
      <ul>{items().map((item) => <li key={item.id}>{item.title}</li>)}</ul>
    </div>
  );
}
```

What `@thunk` can wrap inside the annotated component:

- bare calls: `value()`
- ternaries and `&&` / `||`
- arrays and `.map` / similar chains
- prop values that are calls (not `on*` / `ref`)

What it does **not** wrap:

- expressions that are already `() => ...`
- event handlers and refs
- static literals

Without `@thunk`, write thunks explicitly: `{() => count()}`.

The transform runs in `@adaptive-js/ci` on both server transpile and client (Rolldown) builds.

## Conditional UI: `Reveal`

For on/off branches that must not remount on every signal tick (for example `count` going `1 → 2 → 3` while the branch stays “on”):

```tsx
import { Reveal, signal, init } from "@adaptive-js/web";

function Panel() {
  init(() => {
    console.log("Panel mounted");
    return () => console.log("Panel unmounted");
  });
  return <div>Panel</div>;
}

export function Example() {
  const [count, setCount] = signal(0);

  return (
    <>
      <Reveal when={() => count() > 0}>
        <Reveal.If>
          <Panel />
        </Reveal.If>
        <Reveal.Else>
          <p>TEX</p>
        </Reveal.Else>
      </Reveal>
      <button onClick={() => setCount(count() + 1)}>+</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </>
  );
}
```

Behavior:

- `when` false → true: mount on-branch (`init` runs)
- `when` stays true while inputs change: **no** remount
- `when` true → false: real unmount (`init` cleanup), no keep-alive cache

Full documentation (English + Portuguese):

**[packages/web/docs/Reveal.md](https://github.com/SrJohnathan/adaptivejs/blob/master/packages/web/docs/Reveal.md)**

Manual equivalent with keys:

```tsx
{() =>
  count() > 0
    ? <Panel key="on" />
    : <p key="off">TEX</p>
}
```

## Callbacks between components

For decoupled communication between interactive components, AdaptiveJS provides scoped handlers through `createHandler` and `useHandler`.

`createHandler` registers a named callback on the current interactive component.  
`useHandler` returns a function that broadcasts a payload to every mounted registration with that name. Registrations last for the lifetime of that component and are removed when it unmounts.

```tsx
import { createHandler, useHandler, signal } from "@adaptive-js/web";

function NotificationPanel() {
  const [message, setMessage] = signal("Waiting for an event");

  createHandler<string>("notification", (nextMessage) => {
    setMessage(nextMessage ?? "New notification");
  });

  return <p>{() => message()}</p>;
}

function SaveButton() {
  const notify = useHandler<string>("notification");

  return (
    <button onClick={() => notify("Document saved")}>Save</button>
  );
}

export default function Page() {
  return (
    <main>
      <SaveButton />
      <NotificationPanel />
    </main>
  );
}
```

Handlers are a **broadcast** mechanism: every mounted component registered with the same name receives the payload. Use a unique, feature-level name to avoid unintended listeners.

## Server Actions

Server actions let interactive UI call backend logic without hand-written API routes.

### Two ways to define them

#### 1. `actions/` folder (convention)

Any file under `src/actions/` or any nested directory named `actions` (for example `src/modules/cart/actions/checkout.ts`) is a server action module. **No directive is required.**

```ts
// src/actions/feed.ts
export async function getFeedItems(limit = 10) {
  return [
    { id: 1, title: "Getting started with AdaptiveJS" },
    { id: 2, title: "Server Actions made simple" },
  ].slice(0, limit);
}

export async function createPost(title: string) {
  return { success: true, id: Date.now(), title };
}
```

#### 2. `"server"` at the top of any file

Any module **outside** an `actions/` folder can be a server action module by placing **`"server"`** at the top of the file.

```ts
// src/shared/feed-ops.ts
"server";

export async function likePost(postId: number) {
  return { postId, likes: 42 };
}
```

Prefer **`"server"`** in application code and documentation. The legacy alias `"use server"` is still recognized for compatibility, but **`"server"`** is the Adaptive convention.

| Location | Directive |
|----------|-----------|
| `**/actions/**/*.ts` | Optional (folder convention is enough) |
| Any other module | `"server"` at the top |

### Calling from components

Import and call server actions as normal async functions from `"hydrate"` or `"client"` UI:

```tsx
import { signal } from "@adaptive-js/web";
import { getFeedItems, createPost } from "../actions/feed";

export default function FeedPage() {
  const [posts, setPosts] = signal<Array<{ id: number; title: string }>>([]);
  const [loading, setLoading] = signal(false);

  async function handleLoad() {
    setLoading(true);
    try {
      setPosts(await getFeedItems(5));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const res = await createPost("New item from client");
    if (res.success) await handleLoad();
  }

  return (
    <main>
      <h1>Feed</h1>
      <button onClick={handleLoad} disabled={() => loading()}>
        {() => (loading() ? "Loading..." : "Load Posts")}
      </button>
      <button onClick={handleAdd}>Add Post</button>
      <ul>
        {() => posts().map((post) => <li key={post.id}>{post.title}</li>)}
      </ul>
    </main>
  );
}
```

### How it works

- **Client bundle safety**: server implementations are replaced with RPC proxies (`callServerAction`). Node-only code and secrets never ship to the browser.
- **RPC**: requests go to `/_action` with JSON, binary types, and `FormData` support.
- **Dev**: server action modules reload with the adaptive development pipeline.

## Hydration model

AdaptiveJS uses a DOM-first hydration strategy:

- the server sends real HTML
- the client does not recreate the DOM unnecessarily
- hydration binds events, refs, dynamic props, and reactive ranges onto existing nodes

Keyed reactive blocks and `Reveal` keep branch identity stable across signal updates on both `"client"` and `"hydrate"` paths.

## Tooling (`@adaptive-js/ci`)

- **Rolldown** for client bundles
- **oxc-transform** for server TSX
- **`@thunk`** transform (server + client)
- Dev live reload via `build-meta` and SSE (`/_adaptive/livereload`)
- Optional `adaptive.config.ts` / `.mjs` for app options (for example `client.external`)

```js
// adaptive.config.mjs
export default {
  client: {
    external: ["monaco-editor", /^monaco-editor\//],
  },
};
```

## Packages in this monorepo

### Core packages

- `@adaptive-js/core` — SSR, routing, and core framework primitives
- `@adaptive-js/shared` — shared runtime helpers
- `@adaptive-js/jsx` — JSX runtime and TSX typing surface
- `@adaptive-js/web` — web runtime, hydration, and reactivity
- `@adaptive-js/adapter-nitro` — Nitro adapter for SSR/server deployment
- `@adaptive-js/ci` — build and dev tooling
- `@adaptive-js/components` — high-performance primitives (virtual lists, tables, …)

### Extensions

- `@adaptive-js/extension-auth`
- `@adaptive-js/extension-i18n`
- `@adaptive-js/extension-lucide-animation-icons`

### Scaffold

- `create-adaptive-app` — scaffolds a new AdaptiveJS project

## Creating a new app

```bash
npm create adaptive-app@latest
```

Local scaffold in this monorepo:

```bash
node create-adaptive-app/index.mjs my-app --local
```

Style modes: `tailwind` | `beer` | `none` (one per app).

Optional extensions: `auth`, `i18n`, `icons`.

```bash
node create-adaptive-app/index.mjs my-app --local --style none --extensions auth,i18n,icons
```

## Monorepo scripts

From the root:

```bash
npm run build
```

Release flow: `scripts/npm-release.mjs`.

## Positioning

AdaptiveJS is not trying to be a clone of React, Solid, or Next.

The closest mental model today is:

- fine-grained reactivity with explicit reads (`signal`, getters)
- SSR and file-based routing for application structure
- DOM-first hydration instead of heavy client re-render assumptions
- three clear directives—`"server"`, `"hydrate"`, `"client"`—chosen per slice of the app
- opt-in authoring sugar (`@thunk`, `Reveal`) without hiding the runtime model

The project began as a place to explore architecture and runtime ideas. Over time it has been turning into a real open-source codebase: same technical direction, with more weight on clarity, maintenance, and collaboration.

<img src="avatar.png" width="120" /> 

## License

MIT

