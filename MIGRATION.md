# Migracao para Adaptive

## Renomeacao principal

- `tsx5-base` -> `@adaptivejs/ft`
- `tsx5-server` -> `@adaptivejs/ssr`
- `tsx5-vite-plugin` -> nao e mais dependencia central
- scope oficial npm -> `@adaptivejs/*`

## Mudanca de direcionamento

O projeto deixou de girar em torno de Vite e passou a ter uma stack propria:

- runtime client em `ft`
- SSR em `ssr`
- build do app em `scripts/build-app.mjs`
- CLI em `scripts/adaptive-cli.mjs`
- scaffolder em `create-adaptive-app`

## Naming novo da API

Prefira:

- `useReactive` em vez de `useState`
- `useReactiveStore` em vez de `useStateAlt`
- `AdaptiveObserver` em vez de `TSX5Observer`

Os aliases antigos ainda podem existir internamente para compatibilidade, mas a direcao publica da lib agora e `Adaptive`.

## Client components

Antes, as demos client-side dependiam mais de:

- `div id="..."`
- `mount(...)` manual
- `<script type="module" src="..."></script>` escrito na pagina

Agora a direcao correta e:

1. marcar o componente com `"client";`
2. importar o componente numa pagina SSR
3. usar o componente direto no JSX

Exemplo:

```tsx
import Counter from "../components/Counter";

export default function Page() {
  return <Counter />;
}
```

Com isso, o Adaptive gera:

- stub server-side
- boundary automatico
- bundle client do componente
- hidratacao automatica

## Server-only modules

Agora tambem existe suporte inicial a modulos server-only com:

```ts
"server";
```

Uso recomendado:

- actions em `src/actions/index.ts`
- utilitarios que so devem existir no servidor

O build client bloqueia import acidental desses modulos.

Isso nao fica preso a um unico arquivo. Agora voce pode distribuir modulos server-only em qualquer pasta dentro de `src`, por exemplo:

- `src/actions/users.ts`
- `src/features/auth/server.ts`
- `src/lib/newsletter.ts`

Desde que o arquivo tenha `"server";`, o builder registra esse modulo e o proxy client consegue chamar as funcoes exportadas.

## Sem Vite como base obrigatoria

Hoje o core esta preparado para funcionar sem Vite:

- transformacao com `oxc-transform`
- typecheck com `tsc`
- bundle client com `esbuild`
- dev server controlado pela propria CLI

Se no futuro voces quiserem integrar outra camada de tooling, isso pode ser adicional, mas nao precisa ser a espinha dorsal da framework.

## O que ja foi migrado conceitualmente

- runtime JSX proprio
- reatividade propria
- SSR por arquivos
- actions no servidor
- API declarativa estilo Compose
- client components por arquivo
- exemplo rodando em dev e release

## Proximos focos recomendados

1. amadurecer a hidratacao para casos mais complexos
2. evoluir o live reload para um HMR mais fino
3. melhorar docs de API publica
4. fortalecer testes do runtime e do SSR
