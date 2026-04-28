export {
  createElement,
  Fragment,
  jsx,
  jsxs,
  jsxDEV,
  useRef,
  useRefReactive
} from "@adaptivejs/core/jsx-runtime";

export type { AdaptiveNode } from "@adaptivejs/core";

export namespace JSX {
  export type Element = import("@adaptivejs/core").AdaptiveNode;
  export type MaybeSignal<T> = T | (() => T);
  export type AdaptiveStyleValue = string | number | boolean | null | undefined;
  export type AdaptiveStyleObject = Record<string, AdaptiveStyleValue>;

  export interface HTMLAttributes<T> {
    accessKey?: MaybeSignal<string>;
    className?: MaybeSignal<string>;
    contentEditable?: MaybeSignal<boolean | "inherit">;
    dir?: MaybeSignal<string>;
    draggable?: MaybeSignal<boolean>;
    hidden?: MaybeSignal<boolean>;
    id?: MaybeSignal<string>;
    ref?: { current: T | null } | ((el: T | null) => void);
    lang?: MaybeSignal<string>;
    spellCheck?: MaybeSignal<boolean>;
    style?: MaybeSignal<AdaptiveStyleObject | Partial<CSSStyleDeclaration>>;
    tabIndex?: MaybeSignal<number>;
    title?: MaybeSignal<string>;
    translate?: MaybeSignal<"yes" | "no">;
    onClick?: (e: MouseEvent) => void;
    onChange?: (e: Event & { target: T; currentTarget: T }) => void;
    onInput?: (e: InputEvent & { target: T; currentTarget: T }) => void;
    onFocus?: (e: FocusEvent) => void;
    onBlur?: (e: FocusEvent) => void;
    onKeyDown?: (e: KeyboardEvent) => void;
    onKeyUp?: (e: KeyboardEvent) => void;
    dataset?: MaybeSignal<DOMStringMap>;
    [prop: string]: any;
  }

  export interface IntrinsicElements {
    [elem: string]: any;
    a: HTMLAttributes<HTMLAnchorElement>;
    body: HTMLAttributes<HTMLBodyElement>;
    br: HTMLAttributes<HTMLBRElement>;
    button: HTMLAttributes<HTMLButtonElement>;
    div: HTMLAttributes<HTMLDivElement>;
    form: HTMLAttributes<HTMLFormElement>;
    h1: HTMLAttributes<HTMLHeadingElement>;
    h2: HTMLAttributes<HTMLHeadingElement>;
    h3: HTMLAttributes<HTMLHeadingElement>;
    h4: HTMLAttributes<HTMLHeadingElement>;
    h5: HTMLAttributes<HTMLHeadingElement>;
    h6: HTMLAttributes<HTMLHeadingElement>;
    head: HTMLAttributes<HTMLHeadElement>;
    html: HTMLAttributes<HTMLHtmlElement>;
    img: HTMLAttributes<HTMLImageElement>;
    input: HTMLAttributes<HTMLInputElement>;
    label: HTMLAttributes<HTMLLabelElement>;
    li: HTMLAttributes<HTMLLIElement>;
    link: HTMLAttributes<HTMLLinkElement>;
    main: HTMLAttributes<HTMLElement>;
    meta: HTMLAttributes<HTMLMetaElement>;
    nav: HTMLAttributes<HTMLElement>;
    option: HTMLAttributes<HTMLOptionElement>;
    p: HTMLAttributes<HTMLParagraphElement>;
    script: HTMLAttributes<HTMLScriptElement>;
    section: HTMLAttributes<HTMLElement>;
    select: HTMLAttributes<HTMLSelectElement>;
    span: HTMLAttributes<HTMLSpanElement>;
    strong: HTMLAttributes<HTMLElement>;
    style: HTMLAttributes<HTMLStyleElement>;
    table: HTMLAttributes<HTMLTableElement>;
    tbody: HTMLAttributes<HTMLTableSectionElement>;
    td: HTMLAttributes<HTMLTableDataCellElement>;
    textarea: HTMLAttributes<HTMLTextAreaElement>;
    th: HTMLAttributes<HTMLTableHeaderCellElement>;
    thead: HTMLAttributes<HTMLTableSectionElement>;
    title: HTMLAttributes<HTMLTitleElement>;
    tr: HTMLAttributes<HTMLTableRowElement>;
    ul: HTMLAttributes<HTMLUListElement>;
    svg: any;
    circle: any;
    defs: any;
    g: any;
    line: any;
    path: any;
    rect: any;
    text: any;
  }
}
