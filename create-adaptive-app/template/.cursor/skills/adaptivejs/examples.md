# AdaptiveJS examples (from hello2)

Short patterns distilled from `examples/hello2`. Prefer these over React habits.

## Callbacks + reactive UI

```tsx
"hydrate";

import { useReactive } from "@adaptive-js/web";

export function CallbacksDemo() {
  const [value, setValue] = useReactive("");
  const [clicks, setClicks] = useReactive(0);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setClicks((n) => n + 1);
      }}
    >
      <textarea
        onInput={(event) => {
          const target = event.currentTarget as HTMLTextAreaElement;
          setValue(target.value);
        }}
      />
      <button type="button" onClick={() => setClicks((n) => n + 1)}>
        click
      </button>
      <p>{() => value() || "vazio"}</p>
      <p>{() => String(clicks())}</p>
    </form>
  );
}
```

## createHandler ↔ useHandler

```tsx
// receiver
createHandler("notify", () => {
  store.notifyCount[1]((current) => current + 1);
});

// sender
const notify = useHandler("notify");
notify();
```

## ListCanvas

```tsx
"hydrate";

import { convertItemNode, ItemList, ListCanvas } from "@adaptive-js/components";

const Item: ItemList<{ item: { label: string; value: string }; index: number }> = ({
  item,
  index,
}) => (
  <>
    <h6>{item.label}</h6>
    <p>{item.value}</p>
    <span>{index % 2 === 0 ? "even" : "odd"}</span>
  </>
);

<ListCanvas
  items={rows}
  height={320}
  itemHeight={72}
  item={(item, index) => convertItemNode(Item, { item, index })}
  onItemClick={(item, index) => console.log(index, item)}
/>
```

## TableCanvas

```tsx
"hydrate";

import { TableCanvas, type TableColumn } from "@adaptive-js/components";

const columns: TableColumn<UserRow>[] = [
  { key: "id", header: "ID", width: 90, align: "right" },
  { key: "name", header: "Nome", width: 220 },
  { key: "email", header: "Email" },
];

<TableCanvas rows={rows} columns={columns} height={280} rowHeight={42} />
```

## Client editor (useDOMEffect)

```tsx
"client";

import { useDOMEffect, useRef, useReactive } from "@adaptive-js/web";

export function CodeEditor() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [code, setCode] = useReactive("console.log('hi')");

  useDOMEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // create imperative editor on el
    return () => {
      // dispose
    };
  });

  return <div ref={editorRef} />;
}
```

## Global client deps

```ts
// dependency.ts — automatic global client entry
import "beercss";
```

No `"client"` and no `export {}` required.
