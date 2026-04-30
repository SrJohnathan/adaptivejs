
<img src="avatar.png" width="120" />

# AdaptiveJS

AdaptiveJS is an experimental TypeScript and TSX framework for server-rendered applications with hydration, file-based routing, and fine-grained reactivity.

It is designed around a simple authoring model for the web today, while keeping room for multi-target execution through a shared IR architecture.

The public npm scope is:

- `@adaptivejs/*`

## What is AdaptiveJS?

AdaptiveJS is a framework built around a few core ideas:

- TypeScript and TSX as the default authoring model
- SSR with client hydration
- file-based routing from `src/pages`
- fine-grained reactive primitives instead of heavy view abstractions
- an experimental IR-oriented architecture for future non-web targets

Today, the web target is the most complete part of the system. The multi-target side is still experimental, but it already influences how the framework is structured.

## Why AdaptiveJS?

- Simple TSX authoring without large abstraction layers
- Built-in SSR, hydration, and file-based routing
- Fine-grained reactivity for interactive UI
- Explicit deploy presets for `node`, `netlify`, and `vercel`
- Future-ready architecture for multi-runtime and multi-target output via IR

## Example

```tsx
import { useReactive } from "@adaptivejs/web";
import { Button, Column, Text } from "@adaptivejs/ui";

export default function Page() {
  const [count, setCount] = useReactive(0);

  return (
          <Column>
            <Text>{() => `Count: ${count()}`}</Text>
            <Button onClick={() => setCount((value) => value + 1)}>
              Increment
            </Button>
          </Column>
  );
}
```

## Client and Hydrate Components

AdaptiveJS supports two execution modes for client-side behavior:

### "hydrate"

Keeps the HTML generated on the server and injects JavaScript behavior on the client.

- Uses SSR HTML as-is
- Attaches events, refs, and reactivity via hydration manifest
- Does not recreate DOM
- Removes temporary markers after hydration

```tsx
"hydrate";

export default function Counter() {
  return <button onClick={() => console.log("clicked")}>Click</button>;
}
```

### "client"

Creates and mounts the component directly on the client.

- DOM is generated in the browser
- Does not rely on existing SSR structure
- Used for client-only components

```tsx
"client";

export default function Widget() {
  return <div>Client only</div>;
}
```

### Summary

- "hydrate" → server HTML + JS binding
- "client" → client-side rendering

## Architecture

AdaptiveJS is organized as a layered system rather than a single monolithic package.

- `@adaptivejs/core`
  Shared primitives, JSX runtime entrypoints, and IR-facing types.
- `@adaptivejs/common`
  Cross-target abstractions such as `AdaptiveFormData` and platform-facing APIs.
- `@adaptivejs/ui`
  Declarative UI primitives like `Column`, `Row`, `Text`, `Button`, `Card`, and related building blocks.
- `@adaptivejs/ft`
  Fine-grained reactive runtime, client execution, effects, hydration, and client component registration.
- `@adaptivejs/ssr`
  Node SSR server, request handling, template assembly, and metadata injection.
- `@adaptivejs/static`
  Preset-oriented output pipeline for deploy targets such as `node`, `netlify`, and `vercel`.
- `@adaptivejs/web`
  Main web-facing package that application authors consume.
- `@adaptivejs/cli`
  CLI used for development, build, start, and preset output generation.

## Core Features

Current working surface:

- TSX pages and layouts
- file-based routing in `src/pages`
- dynamic routes such as `[slug].tsx`
- SSR and hydration
- client components via `"client";`
- hydrate components via `"hydrate";`
- server modules via `"server";`
- `useReactive`
- `useEffect`
- `useLayoutEffect`
- `createContext` and `useContext`
- route-level metadata with `generateMetadata(...)`
- deploy presets for `node`, `netlify`, and `vercel`

## Build and Output Model

AdaptiveJS uses a two-stage build model.

### Base build

```bash
adaptive build
```

This produces the framework build output under:

- `dist/client`
- `dist/server`
- `dist/server-entry.js`
- `dist/ir`

### Preset build

```bash
adaptive build --preset node
adaptive build --preset netlify
adaptive build --preset vercel
```

Preset outputs are grouped under:

- `.adaptivejs/output/node`
- `.adaptivejs/output/netlify`
- `.adaptivejs/output/vercel`

Adaptive-owned adapter and cache artifacts are also grouped under:

- `.adaptivejs/adapters/...`
- `.adaptivejs/cache/...`

## Metadata

Routes and layouts can export metadata using a callback similar to modern SSR routers:

```ts
export async function generateMetadata() {
  return {
    title: "My page",
    description: "AdaptiveJS page",
    canonical: "https://example.com",
    openGraph: {
      title: "My page",
      description: "AdaptiveJS page",
    },
  };
}
```

AdaptiveJS injects metadata during SSR using the `<!--adaptive-head-->` placeholder in the HTML template.

## Positioning

AdaptiveJS is not a React clone, not a Solid clone, and not a Next.js clone.

The closest mental model is:

- Solid-like reactivity and directness
- Next-like SSR, routing, and app structure
- an additional IR-oriented layer for future multi-target execution

That combination is the main identity of the project today.

## Status

AdaptiveJS is still experimental, but the current web stack is already usable for real SSR projects and deploy-preset workflows.

The broader multi-target architecture is under active development.

