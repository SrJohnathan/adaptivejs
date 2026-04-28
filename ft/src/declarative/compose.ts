import { createElement, Fragment } from "../jsx-runtime.js";
import { TSX5Node } from "../global";

export function Column(children: () => TSX5Node[], props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("div", { ...props, style: { display: "flex", flexDirection: "column", gap: "0.5rem", ...style } }, ...children() as any);
}

export function Row(children: () => TSX5Node[], props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("div", { ...props, style: { display: "flex", flexDirection: "row", gap: "0.5rem", ...style } }, ...children() as any);
}

export function Text(content: string, props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("span", { ...props, style }, content as any);
}

export function Title(text: string, level: number = 1, props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  const tag = `h${level}` as keyof JSX.IntrinsicElements;
  return createElement(tag, { ...props, style }, text as any);
}

export function Button(label: string, props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("button", { ...props, style }, label as any);
}

export function Input(props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("input", { ...props, style });
}

export function Label(text: string, htmlFor: string, props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("label", { htmlFor, ...props, style }, text as any);
}

export function Textarea(props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("textarea", { ...props, style });
}

export function Select(
  options: Array<string | { label: string; value: string; group?: string; disabled?: boolean }>,
  props: Record<string, any> = {},
  style: Partial<CSSStyleDeclaration> = {}
): TSX5Node {
  const grouped: Record<string, Array<{ label: string; value: string; disabled?: boolean }>> = {};
  const flat: Array<{ label: string; value: string; disabled?: boolean }> = [];

  for (const option of options) {
    if (typeof option === "string") {
      flat.push({ label: option, value: option });
    } else if (option.group) {
      grouped[option.group] ??= [];
      grouped[option.group].push({ label: option.label, value: option.value, disabled: option.disabled });
    } else {
      flat.push({ label: option.label, value: option.value, disabled: option.disabled });
    }
  }

  const children: TSX5Node[] = [];
  if (flat.length) {
    children.push(...flat.map((option) => createElement("option", { value: option.value, disabled: option.disabled }, option.label as any)));
  }

  for (const group in grouped) {
    children.push(
      createElement(
        "optgroup",
        { label: group },
        ...grouped[group].map((option) => () => createElement("option", { value: option.value, disabled: option.disabled }, option.label as any))
      )
    );
  }

  return createElement("select", { multiple: false, ...props, style }, ...children as any);
}

export function Form(children: () => TSX5Node[], props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("form", { ...props, style }, ...children() as any);
}

export function FormGroup(label: string, input: TSX5Node, id?: string): TSX5Node {
  const htmlFor = id || (input as any)?.props?.id;
  return Surface(
    () => [
      Label(label, htmlFor || "", { style: { fontWeight: "bold" } }),
      input
    ],
    { style: { marginBottom: "1rem" } }
  );
}

export function Spacer(height: string = "1rem", props: Record<string, any> = {}): TSX5Node {
  return createElement("div", { ...props, style: { height } });
}

export function Image(src: string, alt = "", props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("img", { src, alt, ...props, style });
}

export function Surface(children: () => TSX5Node[], props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("div", { ...props, style: { padding: "1rem", border: "1px solid #ccc", borderRadius: "8px", ...style } }, ...children() as any);
}

export function Card(children: () => TSX5Node[], props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("div", { ...props, style: { boxShadow: "0 2px 10px rgba(0,0,0,0.1)", borderRadius: "12px", padding: "1rem", ...style } }, ...children() as any);
}

export function Table<T = any>(
  headers: string[],
  rows: T[],
  renderRow: (row: T, index: number) => TSX5Node[],
  props: Record<string, any> = {},
  style: Partial<CSSStyleDeclaration> = {}
): TSX5Node {
  return createElement(
    "table",
    { ...props, style: { borderCollapse: "collapse", width: "100%", ...style } },
    () => createElement(
      "thead",
      {},
      () => createElement(
        "tr",
        {},
        ...headers.map((header) => () => createElement("th", { style: { border: "1px solid #ccc", padding: "0.5rem", backgroundColor: "#f0f0f0" } }, header as any))
      )
    ),
    () => createElement(
      "tbody",
      {},
      ...rows.map((row, index) => () => createElement("tr", {}, ...renderRow(row, index) as any))
    )
  );
}

export function Ul(items: TSX5Node[], props: Record<string, any> = {}, style: Partial<CSSStyleDeclaration> = {}): TSX5Node {
  return createElement("ul", { ...props, style }, ...items.map((item) => () => createElement("li", {}, item as any)));
}

export function Visibility(visible: boolean, child: () => TSX5Node): TSX5Node {
  return visible ? child() : createElement(Fragment, {});
}

export function Conditional(cond: boolean, whenTrue: () => TSX5Node, whenFalse?: () => TSX5Node): TSX5Node {
  return cond ? whenTrue() : whenFalse ? whenFalse() : createElement(Fragment, {});
}

export function ForEach<T>(items: T[], render: (item: T, index: number) => TSX5Node): TSX5Node[] {
  return items.map((item, index) => render(item, index));
}

export function InjectJSX(component: () => TSX5Node): TSX5Node {
  return component();
}

export function render(ui: () => TSX5Node): TSX5Node {
  return ui();
}

export const Compose = {
  Column,
  Row,
  Text,
  Title,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  Form,
  FormGroup,
  Spacer,
  Image,
  Surface,
  Card,
  Table,
  Ul,
  Visibility,
  Conditional,
  ForEach,
  InjectJSX,
  render
};

export const Box = Surface;
