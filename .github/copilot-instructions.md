# Copilot / AI agent instructions (concise)

Purpose: help an AI contributor be productive quickly in this monorepo.

- **Big picture:** This repo is a TypeScript monorepo using npm workspaces. Key packages live under `packages/` and each package is a tiny TS project (source in `src/`, output in `dist/`). `packages/ci` is a CLI/runtime used by `examples/*` (examples invoke the built `packages/ci/dist/index.js`). The repo also contains an app scaffold in `create-adaptive-app` and extension tooling under `extension/`.

- **Primary packages:**
  - `packages/core` — core runtime utilities.
  - `packages/shared` — shared types/helpers used across packages.
  - `packages/jsx` — JSX runtime/transform helpers.
  - `packages/web` — web-specific runtime pieces.
  - `packages/components` — UI components.
  - `packages/ci` — CLI and build/dev tooling (important integration point).
  - `packages/adapter-nitro` — adapter integration.
  - `extension/lucide-animation-icons` — icon conversion + generated icon components.

- **Build / dev workflow (exact):**
  - Build all workspaces: run `npm run build` at repo root. This triggers `tsc -p tsconfig.json` in each package.
  - Build a single package: `npm --workspace @adaptivejs/ci run build` (or `npm --prefix packages/ci run build`).
  - Examples rely on the built CI package: after building, run an example from its folder (or via prefix):
    - `cd examples/hello2 && npm run dev` (this runs `node ../../packages/ci/dist/index.js dev .` as defined in that example's `package.json`).
  - Typecheck inside any package: `tsc -p tsconfig.json --noEmit`.

- **Important patterns & conventions:**
  - Each package exposes compiled code in `dist/` and types in `dist/*.d.ts` — edits go in `src/` and require `npm run build` to generate `dist/`.
  - Examples reference local packages with `file:` dependencies (see `examples/hello2/package.json` and `examples/hello-beer/package.json`). That means example scripts expect the local package artifacts (or the `dist/` CLI) to exist.
  - The repo prefers `tsc -p tsconfig.json` per-package instead of a single top-level bundler; follow existing `tsconfig.json` layout when adding files.
  - `packages/ci` acts as the glue/runner; if you change runtime behavior for examples, start by reading `packages/ci/src` and rebuilding `packages/ci`.
  - Icon generation: see `extension/lucide-animation-icons/scripts/convert-icons.mjs` and the `src/generated` / `src/icons` outputs — treat the script as the source of truth for generated icon components.

- **Where to look for examples of patterns:**
  - Example app entry: `examples/hello2/src/pages/index.tsx` and `examples/hello-beer/src/pages/index.tsx`.
  - CLI/runner implementation: `packages/ci/src` and its `package.json` (`main: dist/index.js`).
  - Package build pattern: any `packages/*/package.json` shows `"build": "tsc -p tsconfig.json"`.

- **When making changes:**
  - Add code under the appropriate package `src/` and update types/exports in `package.json` only when necessary.
  - Rebuild the modified package (`npm --workspace <pkg> run build`) before running dependent examples.
  - For changes affecting examples or dev server behavior, rebuild `packages/ci` first.

- **What not to assume:**
  - There is no global bundler step for examples; they expect the `packages/ci` artefact. Do not attempt to run example dev commands without first ensuring `packages/ci/dist/index.js` exists.

If anything here is unclear or you want the file to include more examples (e.g., typical PR checklist, linting commands, or common refactor patterns), tell me what to add and I will iterate.
