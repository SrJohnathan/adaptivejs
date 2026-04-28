# Adaptive

Adaptive is an experimental application framework for server-rendered, reactive, multi-target UI.

At a high level, the project combines:

- fine-grained reactivity and direct rendering
- file-based SSR routing
- client component boundaries
- deployment presets for `node`, `netlify` and `vercel`
- a declarative UI layer that is not tied to the DOM as the only runtime

The npm scope is:

- `@adaptivejs/*`

## Mental model

Adaptive is closer to:

- Solid-style reactivity and directness
- Next-style application structure and SSR ergonomics

but it is not a React clone, Solid clone, or Next clone.

The main design goal is to keep the authoring model simple in TypeScript and TSX while allowing:

- server rendering
- client hydration
- route-level metadata
- deploy-target-specific output
- future non-web targets through a shared IR and common abstractions

## Package layout

Public packages today:

- `@adaptivejs/cli`
- `@adaptivejs/core`
- `@adaptivejs/common`
- `@adaptivejs/ui`
- `@adaptivejs/ft`
- `@adaptivejs/ssr`
- `@adaptivejs/static`
- `@adaptivejs/web`
- `create-adaptive-app`

Experimental or internal packages:

- `@adaptivejs/example`
- `@adaptivejs/mobile-android`
- `@adaptivejs/desktop`

### `@adaptivejs/core`

Shared framework primitives and IR-facing types.

Responsibilities:

- JSX runtime entrypoints
- IR primitives
- shared authoring types

### `@adaptivejs/common`

Common cross-target abstractions that should not live in a web-only package.

Examples:

- `AdaptiveFormData`
- platform API surfaces such as `App.*`

### `@adaptivejs/ui`

Declarative UI layer and common primitives.

Examples:

- `Column`
- `Row`
- `Text`
- `Button`
- `Surface`
- `AppBar`

### `@adaptivejs/ft`

Reactive runtime and client-side execution primitives.

Examples:

- hydration
- state
- effects
- client component registration
- server action client bridge

### `@adaptivejs/ssr`

Node SSR runtime and request handling utilities for the web target.

Examples:

- server creation
- route matching
- HTML template assembly
- metadata injection

### `@adaptivejs/web`

Official web target surface.

This is the package app authors normally consume for:

- JSX runtime
- SSR integration
- route rendering
- client component integration
- exported web-facing APIs

### `@adaptivejs/static`

Preset-based deploy output built on top of Nitro.

Current presets:

- `node`
- `netlify`
- `vercel`
- `static`

This package is responsible for turning the base Adaptive build into deploy-target-specific output.

### `create-adaptive-app`

Starter generator for new projects.

The template already includes:

- `adaptive dev`
- `adaptive build`
- `adaptive start`
- `adaptive build --preset netlify`
- `adaptive preview --preset netlify`
- `netlify.toml`

## What works today

Current working surface:

- TSX with a custom runtime
- `useReactive`
- `useEffect`
- `useLayoutEffect`
- `useContext`
- `useMemo`
- file-based routing via `src/pages`
- dynamic routes such as `[slug].tsx`
- server modules via `"server";`
- client components via `"client";`
- SSR and hydration on the web target
- route-level metadata via `generateMetadata(...)`
- deploy presets for `node`, `netlify` and `vercel`

## Build model

Adaptive uses a two-stage build model.

### Base build

`adaptive build` produces the framework's base application output:

- `dist/client`
- `dist/server`
- `dist/server-entry.js`
- `dist/ir`

### Preset build

`adaptive build --preset <target>` produces target-specific output under:

- `.adaptivejs/output/<preset>`

Examples:

- `.adaptivejs/output/node`
- `.adaptivejs/output/netlify`
- `.adaptivejs/output/vercel`

Adaptive-owned adapter and cache artifacts also live under:

- `.adaptivejs/adapters/...`
- `.adaptivejs/cache/...`

This keeps deploy artifacts grouped instead of scattering `.output`, `.adaptive-nitro`, and related folders at the app root.

## Preview model

Adaptive supports local preview for preset output.

Examples:

```bash
adaptive build --preset node
adaptive preview --preset node
```

```bash
adaptive build --preset netlify
adaptive preview --preset netlify
```

```bash
adaptive build --preset vercel
adaptive preview --preset vercel
```

## Metadata API

Routes or layouts can provide metadata using a callback similar in spirit to modern app routers:

```ts
export async function generateMetadata(context) {
  return {
    title: "My page",
    description: "Adaptive page description",
    canonical: "https://example.com",
    openGraph: {
      title: "My page",
      description: "Adaptive page description",
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}
```

Adaptive injects metadata into the HTML head during SSR.

To support this, the HTML template should contain:

```html
<!--adaptive-head-->
```

If the placeholder is missing, Adaptive falls back to injecting before `</head>`.

## Environment loading

The CLI loads `.env` files automatically in an order similar to modern SSR frameworks:

- `.env.development.local` or `.env.production.local`
- `.env.local`
- `.env.development` or `.env.production`
- `.env`

Commands:

- `adaptive dev` uses `development`
- `adaptive build` uses `production`
- `adaptive start` uses `production`

Only variables prefixed with `ADAPTIVE_PUBLIC_` are exposed to the client bundle.

## Monorepo development

Install and validate the monorepo:

```bash
npm install
npm run typecheck
npm run build
```

Run the example app:

```bash
cd D:\projetos\Adaptive\example
npm run dev
```

## Current direction

Adaptive is still experimental, but the current architecture is already shaped around:

1. shared authoring in TypeScript and TSX
2. a first-class web target
3. deploy presets as explicit build outputs
4. progressive movement toward non-web targets through shared abstractions and IR

Today the web target is the most complete part of the system.

The long-term direction is:

- `core` and `common` as shared foundation
- `ui` as shared declarative authoring layer
- `web` as the main production-ready target
- native targets evolving on top of the same semantics instead of the DOM being the only execution model
