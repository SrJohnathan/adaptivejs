# Reveal

Conditional rendering for AdaptiveJS with **stable on/off branches**.

While the condition stays on the same side (`true` or `false`), the active branch is **not** torn down or re-created—even if signals used only to *compute* the condition keep changing (e.g. `count` going `1 → 2 → 3`). Switching sides runs real mount / unmount (`init` setup and cleanup).

---

## Why Reveal?

Adaptive does not re-render whole components when a signal changes. Reactive updates happen inside **thunks** (function children):

```tsx
{() => count() > 0 ? <Test /> : <div>TEX</div>}
```

By default, that thunk re-runs on every `count` change and **replaces** the whole subtree. That re-fires `init()` on `<Test />` even when the branch is still “show Test”.

`Reveal` + branch **keys** (`on` / `off`) tell the runtime: *same branch key → keep the DOM and effect scope; different key → destroy and mount the other branch.*

---

## Import

```ts
import { Reveal } from "@adaptive-js/web";
// or your local path, e.g. "./reveal.js"
```

`Reveal.If` and `Reveal.Else` are markers used only to label branches. `When` / `Branch` are aliases of `Reveal` if exported.

---

## Basic usage

```tsx
import { Reveal, signal, init } from "@adaptive-js/web";

const Test = () => {
  init(() => {
    console.log("mounted");
    return () => console.log("unmounted");
  });
  return <div>BeerCSS</div>;
};

// @thunk  (optional if you always pass a function to `when`)
export const Counter = () => {
  const [count, setCount] = signal(0);

  return (
    <article>
      <Reveal when={() => count() > 0}>
        <Reveal.If>
          <Test />
        </Reveal.If>
        <Reveal.Else>
          <div>TEX</div>
        </Reveal.Else>
      </Reveal>

      <button onClick={() => setCount(count() + 1)}>+</button>
      <button onClick={() => setCount(0)}>Reset</button>
      <p>{() => count()}</p>
    </article>
  );
};
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `when` | `boolean \| (() => boolean)` | Condition. Prefer a **function** so it stays reactive inside the thunk. |
| `fallback` | `any` | Optional. Used as the off branch when you omit `Reveal.Else`. |
| `children` | `any` | Prefer `Reveal.If` / `Reveal.Else`. Without markers, all children are the **on** branch. |

---

## Shorthand without Else

```tsx
<Reveal when={() => open()} fallback={<p>Closed</p>}>
  <Panel />
</Reveal>
```

Or with markers and no fallback:

```tsx
<Reveal when={() => open()}>
  <Reveal.If>
    <Panel />
  </Reveal.If>
</Reveal>
```

When `when` is false and there is no else/fallback, nothing is rendered.

---

## Expected lifecycle

| Transition | Log / behavior |
|------------|----------------|
| `when` false → true | mount on-branch → `init` runs (“mounted”) |
| `when` stays true (`count` 1→2→3) | **no** remount, **no** extra `init` |
| `when` true → false | `init` cleanup (“unmounted”), on-branch destroyed |
| `when` false → true again | **new** mount → `init` runs again |

There is **no** keep-alive cache: hidden branches are not kept in memory.

---

## How it works (runtime)

1. `Reveal` returns a **thunk** that reads `when` and returns the active branch vnode.
2. Branch vnodes are tagged with stable keys: **`on`** / **`off`** (`withBranchKey`).
3. Client: `mountKeyedReactiveFunction` in `renderToDOM` compares keys; same key → skip DOM replace.
4. Hydrate: `hydrateReactiveContentWithMarkers` uses the same `getVNodeKey` rule before `replaceReactiveRangeContent`.

Directives:

- `"client"` — client-only mount via `renderToDOM`.
- `"hydrate"` — SSR HTML + hydrate instructions; keyed path must be applied on markers as well.

---

## Manual alternative (without Reveal)

```tsx
{() =>
  count() > 0
    ? <Test key="on" />
    : <div key="off">TEX</div>
}
```

Same stability rules if the keyed reactive block is enabled. `Reveal` only structures the API and applies keys for you.

---

## Notes

- Prefer `when={() => ...}` over a bare boolean unless the boolean is already updated inside a reactive parent thunk.
- Put interactive UI that must survive condition flips **outside** `Reveal`, or accept remount when the branch key changes.
- Lists (`.map`) use list reconciliation separately; `Reveal` is for **boolean** on/off branches.

---

# Reveal (Português)

Renderização condicional no AdaptiveJS com **branches on/off estáveis**.

Enquanto a condição permanece no mesmo lado (`true` ou `false`), o branch ativo **não** é destruído nem recriado—mesmo que signals usados só para *calcular* a condição mudem (ex.: `count` de `1 → 2 → 3`). Ao trocar de lado, ocorre mount / unmount de verdade (`init` e cleanup).

---

## Por que o Reveal?

O Adaptive **não** re-renderiza o componente inteiro quando um signal muda. Atualizações reativas acontecem em **thunks** (filhos função):

```tsx
{() => count() > 0 ? <Test /> : <div>TEX</div>}
```

Por padrão, esse thunk roda a cada mudança de `count` e **substitui** a subtree inteira. Isso dispara `init()` de novo no `<Test />` mesmo quando o branch continua sendo “mostrar Test”.

`Reveal` + **keys** de branch (`on` / `off`) dizem ao runtime: *mesma key → mantém DOM e scope de effects; key diferente → destrói e monta o outro branch.*

---

## Import

```ts
import { Reveal } from "@adaptive-js/web";
// ou caminho local, ex.: "./reveal.js"
```

`Reveal.If` e `Reveal.Else` são marcadores de branch. `When` / `Branch` são aliases de `Reveal`, se exportados.

---

## Uso básico

```tsx
import { Reveal, signal, init } from "@adaptive-js/web";

const Test = () => {
  init(() => {
    console.log("montou");
    return () => console.log("desmontou");
  });
  return <div>BeerCSS</div>;
};

// @thunk  (opcional se `when` já for função)
export const Counter = () => {
  const [count, setCount] = signal(0);

  return (
    <article>
      <Reveal when={() => count() > 0}>
        <Reveal.If>
          <Test />
        </Reveal.If>
        <Reveal.Else>
          <div>TEX</div>
        </Reveal.Else>
      </Reveal>

      <button onClick={() => setCount(count() + 1)}>+</button>
      <button onClick={() => setCount(0)}>Reset</button>
      <p>{() => count()}</p>
    </article>
  );
};
```

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `when` | `boolean \| (() => boolean)` | Condição. Prefira **função** para permanecer reativo dentro do thunk. |
| `fallback` | `any` | Opcional. Branch off se não houver `Reveal.Else`. |
| `children` | `any` | Prefira `Reveal.If` / `Reveal.Else`. Sem marcadores, todos os children são o branch **on**. |

---

## Atalho sem Else

```tsx
<Reveal when={() => open()} fallback={<p>Fechado</p>}>
  <Panel />
</Reveal>
```

Ou só o branch on:

```tsx
<Reveal when={() => open()}>
  <Reveal.If>
    <Panel />
  </Reveal.If>
</Reveal>
```

Com `when` false e sem else/fallback, não renderiza nada.

---

## Ciclo de vida esperado

| Transição | Log / comportamento |
|-----------|---------------------|
| `when` false → true | monta o branch on → roda `init` (“montou”) |
| `when` continua true (`count` 1→2→3) | **sem** remount, **sem** `init` extra |
| `when` true → false | cleanup do `init` (“desmontou”), branch on destruído |
| `when` false → true de novo | **novo** mount → `init` de novo |

**Não** há cache keep-alive: branch escondido não fica guardado em memória.

---

## Como funciona (runtime)

1. `Reveal` devolve um **thunk** que lê `when` e retorna o vnode do branch ativo.
2. Os vnodes dos branches recebem keys estáveis: **`on`** / **`off`** (`withBranchKey`).
3. Client: `mountKeyedReactiveFunction` no `renderToDOM` compara keys; mesma key → não troca o DOM.
4. Hydrate: `hydrateReactiveContentWithMarkers` usa o mesmo `getVNodeKey` antes de `replaceReactiveRangeContent`.

Diretivas:

- `"client"` — montagem só no browser via `renderToDOM`.
- `"hydrate"` — HTML do SSR + instructions; o path keyed também precisa estar nos markers.

---

## Alternativa manual (sem Reveal)

```tsx
{() =>
  count() > 0
    ? <Test key="on" />
    : <div key="off">TEX</div>
}
```

Mesmas regras de estabilidade se o bloco reativo keyed estiver ativo. O `Reveal` só organiza a API e aplica as keys.

---

## Observações

- Prefira `when={() => ...}` em vez de boolean solto, a menos que esse boolean já atualize dentro de um thunk pai reativo.
- UI que precisa sobreviver à troca de condição deve ficar **fora** do `Reveal`, ou aceite remount quando a key do branch mudar.
- Listas (`.map`) têm reconciliação própria; o `Reveal` é para branches booleanos **on/off**.
