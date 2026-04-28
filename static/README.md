# @adaptivejs/static

`@adaptivejs/static` is the deploy-output layer for Adaptive apps.

It takes the base application build and turns it into target-specific output for:

- `node`
- `netlify`
- `vercel`
- `static`

Internally it uses Nitro as the server/deploy adapter layer.

## What it does

`@adaptivejs/static` sits after the base Adaptive build.

The base build still produces:

- `dist/client`
- `dist/server`
- `dist/server-entry.js`
- `dist/ir`

Then `@adaptivejs/static` materializes preset-specific output under:

- `.adaptivejs/output/<preset>`

Examples:

- `.adaptivejs/output/node`
- `.adaptivejs/output/netlify`
- `.adaptivejs/output/vercel`

It also writes framework-owned adapter and cache artifacts under:

- `.adaptivejs/adapters/...`
- `.adaptivejs/cache/...`

## Presets

### `node`

Generates a Node-oriented SSR output with its own server entry.

Example:

```bash
adaptive build --preset node
adaptive preview --preset node
```

Typical output:

- `.adaptivejs/output/node/server/index.mjs`

### `netlify`

Generates Netlify-oriented output including:

- server function payload
- public assets
- runtime client assets in `/_adaptive`
- `_redirects`

Example:

```bash
adaptive build --preset netlify
adaptive preview --preset netlify
```

Typical output:

- `.adaptivejs/output/netlify`

### `vercel`

Generates Vercel-oriented output from the same Adaptive base build.

Example:

```bash
adaptive build --preset vercel
adaptive preview --preset vercel
```

Typical output:

- `.adaptivejs/output/vercel`

### `static`

Builds a static-oriented output path.

Example:

```bash
adaptive build --static
```

Important note:

- the `static` preset still depends on explicit prerender strategy to become fully static HTML for all routes
- for real SSR deploys, prefer `node`, `netlify` or `vercel`

## Asset model

Client runtime assets are published under:

- `/_adaptive`

This keeps:

- public assets in the public root
- framework client runtime in a stable reserved namespace

## Local preview

The CLI can preview preset output locally:

```bash
adaptive preview --preset node
adaptive preview --preset netlify
adaptive preview --preset vercel
```

This is useful to validate:

- server rendering
- client asset wiring
- runtime hydration
- deploy-target output shape

## Relationship to `@adaptivejs/cli`

Most users do not call `@adaptivejs/static` directly.

Instead, they use:

```bash
adaptive build --preset netlify
adaptive build --preset vercel
adaptive build --preset node
```

The CLI delegates preset output generation to `@adaptivejs/static`.
