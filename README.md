<img src="avatar.png" width="120" />

# AdaptiveJS

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

AdaptiveJS is a framework for building server-rendered web applications with a direct authoring model:

- pages live in `src/pages`
- global dependencies can live in `dependency.ts`
- global CSS lives in `public/styles.css`
- interactive UI is built with TSX
- reactivity is explicit through getters and setters

The framework is intentionally close to the DOM. Instead of hiding rendering behind large abstractions, AdaptiveJS tries to keep:

- HTML honest on the server
- hydration explicit on the client
- reactivity small and understandable

## Core execution modes

AdaptiveJS currently works with three important authoring modes.

### `server`

Best suited for server-only logic.

Typical use:

- server actions
- backend utilities
- request-side helpers
- `.ts` files with no client interaction

### `hydrate`

Used for SSR-first UI that should become interactive on the client.

Behavior:

- HTML is rendered on the server
- the client reuses that HTML
- events, refs and reactive bindings are attached after load

This is the main mode for progressive interactive UI.

### `client`

Used for client-first components.

Behavior:

- the component mounts directly in the browser
- it does not rely on existing SSR HTML for that subtree

This is useful for browser-heavy widgets or components that are naturally client-only.

## Example

```tsx
import { useReactive } from "@adaptive-js/web";

export default function Page() {
  const [count, setCount] = useReactive(0);

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

## Project structure

Typical app structure:

```txt
my-app/
  public/
    styles.css
  src/
    pages/
      index.tsx
  dependency.ts
  index.html
  package.json
```

### `src/pages`

Application routes are discovered from `src/pages`.

Examples:

- `src/pages/index.tsx` -> `/`
- `src/pages/about.tsx` -> `/about`

### `dependency.ts`

This file is the global client dependency entry of the app.

Good use cases:

- global libraries
- global side effects
- theme bootstrapping
- app-wide styling dependencies

It does not need `"client"` or `export {}`.

### `public/styles.css`

This is the official global stylesheet for the app.

It can be plain CSS or processed with Tailwind when the app chooses that style path.

## Reactivity

AdaptiveJS uses fine-grained reactivity through getters and setters.

Main primitives:

- `useReactive`
- `useEffect`
- `useLayoutEffect`
- `useEffectDep`
- `useDOMEffect`
- `useClientEffect`
- `useMemo`
- `batch`
- `createStore`

The mental model is simple:

- the getter is the live read
- the setter updates the source
- reactivity activates when the getter is read inside a reactive boundary

## Hydration model

AdaptiveJS uses a DOM-first hydration strategy.

That means:

- the server sends real HTML
- the client does not recreate the DOM unnecessarily
- hydration binds events, refs, dynamic props and reactive ranges onto existing nodes

This direction matters a lot to the project. The goal is to preserve server output and make hydration explicit, predictable and debuggable.

## Packages in this monorepo

### Core packages

- `@adaptive-js/core`
  - SSR, routing and core framework primitives
- `@adaptive-js/shared`
  - shared runtime helpers used across packages
- `@adaptive-js/jsx`
  - JSX runtime and TSX typing surface
- `@adaptive-js/web`
  - main web runtime, hydration and reactivity
- `@adaptive-js/adapter-nitro`
  - Nitro adapter for SSR/server deployment
- `@adaptive-js/ci`
  - build and dev tooling for AdaptiveJS apps
- `@adaptive-js/components`
  - high-performance primitives such as virtual/canvas lists and tables

### Extensions

- `@adaptive-js/extension-auth`
  - server-first sessions, authorization and reactive client auth state
- `@adaptive-js/extension-i18n`
  - reactive i18n utilities
- `@adaptive-js/extension-lucide-animation-icons`
  - animated icons for AdaptiveJS apps

### Scaffold

- `create-adaptive-app`
  - scaffolds a new AdaptiveJS project

## Creating a new app

```bash
npm create adaptive-app@latest
```

Local development of the scaffold in this monorepo uses:

```bash
node create-adaptive-app/index.mjs my-app --local
```

Style modes supported by the scaffold:

- `tailwind`
- `beer`
- `none`

Only one style path should be chosen per app.

## Monorepo scripts

From the root:

```bash
npm run build
```



The release flow is handled by:

- `scripts/npm-release.mjs`

## Positioning

AdaptiveJS is not trying to be a clone of React, Solid or Next.

The closest mental model today is:

- fine-grained reactivity with explicit reads
- SSR and routing for application structure
- DOM-first hydration instead of heavy client re-render assumptions

The project started as a way to demonstrate architectural and framework knowledge, but it has been steadily turning into a real open source codebase with its own direction.

## License

MIT
