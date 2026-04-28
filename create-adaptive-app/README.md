# create-adaptive-app

Official starter generator for Adaptive applications.

Generated apps use the public npm scope:

- `@adaptivejs/*`

## What it generates

A new project already comes with:

- `server.ts`
- `src/pages`
- `src/components`
- `src/layout.ts`
- `src/actions`
- `public`
- scripts for `dev`, `build`, `start`
- `netlify.toml`
- scripts for `build:netlify` and `preview:netlify`

The template demonstrates:

- basic SSR pages
- declarative UI with `compose`
- reactive hooks
- client components via `"client";`
- server modules via `"server";`
- direct client-to-server action imports
- `AdaptiveFormData`
- route-level metadata with `generateMetadata(...)`

## Usage

```bash
npx create-adaptive-app my-app
```

Then:

```bash
cd my-app
npm install
npm run dev
```

## Netlify

The starter already includes Netlify-oriented basics:

- `netlify.toml`
- `build:netlify`
- `preview:netlify`

To generate Netlify output:

```bash
npm run build:netlify
```

## Server modules

The starter includes `src/actions/index.ts`, but server modules are not limited to that path.

Examples of valid server modules:

- `src/actions/users.ts`
- `src/features/auth/server.ts`
- `src/lib/newsletter.ts`

As long as the file lives under `src` and declares `"server";`, client code can import its functions.

## Environment variables

The template includes `.env.example`.

You can use files such as:

- `.env`
- `.env.local`
- `.env.development`
- `.env.development.local`
- `.env.production`
- `.env.production.local`

Only variables prefixed with `ADAPTIVE_PUBLIC_` are exposed to the client bundle.

## Goal

The goal of the starter is to avoid hand-assembling a new project.

It should give you a project that is:

- organized
- runnable immediately
- aligned with the public Adaptive CLI
- ready to evolve into SSR and deploy-preset workflows
