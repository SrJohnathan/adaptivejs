import { createElement as ce, Fragment as F } from "@adaptivejs/jsx";

export type AdaptiveChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | Node
  | AdaptiveType
  | AdaptiveChild[]
  | (() => AdaptiveChild);

export interface AdaptiveType {
  tag: string | Function;
  props?: Record<string, any>;
  children?: AdaptiveChild[];
}

export type AdaptiveNode = AdaptiveType | Promise<AdaptiveType>;
export type ReactiveNode = AdaptiveNode;
export type ReactiveElement = AdaptiveType;

// Legacy aliases for the migration period.
export type TSX5Node = AdaptiveNode;
export type TSX5Type = AdaptiveType;
export type VChild = AdaptiveChild;

declare global {
  interface Window {
    __ROUTE__?: string;
    __PARAMS__?: Record<string, string>;
    __QUERYS__?: Record<string, string>;
    __ADAPTIVE_HYDRATION_MISMATCHES__?: Array<{
      path: string;
      route: string;
      message: string;
      expected?: string;
      found?: string;
      htmlSnippet?: string;
      timestamp: number;
    }>;
  }

  const createElement: typeof ce;
  const Fragment: typeof F;

  namespace JSX {
    type Element = AdaptiveNode;
    type MaybeSignal<T> = T | (() => T);
    type AdaptiveStyleValue = string | number | boolean | null | undefined;
    type AdaptiveStyleObject = Record<string, AdaptiveStyleValue>;

    interface HTMLAttributes<T> {
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
      onDblClick?: (e: MouseEvent) => void;
      onChange?: (e: Event & { target: T; currentTarget: T }) => void;
      onInput?: (e: InputEvent & { target: T; currentTarget: T }) => void;
      onFocus?: (e: FocusEvent) => void;
      onBlur?: (e: FocusEvent) => void;
      onSubmit?: (e: SubmitEvent & { target: T; currentTarget: T }) => void;
      onKeyDown?: (e: KeyboardEvent) => void;
      onKeyUp?: (e: KeyboardEvent) => void;
      onMouseDown?: (e: MouseEvent) => void;
      onMouseUp?: (e: MouseEvent) => void;
      onMouseMove?: (e: MouseEvent) => void;
      onMouseEnter?: (e: MouseEvent) => void;
      onMouseLeave?: (e: MouseEvent) => void;
      onScroll?: (e: Event & { target: T; currentTarget: T }) => void;
      onWheel?: (e: WheelEvent & { target: T; currentTarget: T }) => void;
      dataset?: MaybeSignal<DOMStringMap>;
      [prop: string]: any;
    }

    interface SVGAttributes<T> extends HTMLAttributes<T> {
      fill?: MaybeSignal<string>;
      stroke?: MaybeSignal<string>;
      strokeWidth?: MaybeSignal<number | string>;
      strokeLinecap?: MaybeSignal<"butt" | "round" | "square">;
      strokeLinejoin?: MaybeSignal<"miter" | "round" | "bevel">;
      viewBox?: MaybeSignal<string>;
      transform?: MaybeSignal<string>;
      opacity?: MaybeSignal<number | string>;
      d?: MaybeSignal<string>;
      cx?: MaybeSignal<number | string>;
      cy?: MaybeSignal<number | string>;
      r?: MaybeSignal<number | string>;
      x?: MaybeSignal<number | string>;
      y?: MaybeSignal<number | string>;
      width?: MaybeSignal<number | string>;
      height?: MaybeSignal<number | string>;
      x1?: MaybeSignal<number | string>;
      y1?: MaybeSignal<number | string>;
      x2?: MaybeSignal<number | string>;
      y2?: MaybeSignal<number | string>;
      rx?: MaybeSignal<number | string>;
      ry?: MaybeSignal<number | string>;
      points?: MaybeSignal<string>;
      preserveAspectRatio?: MaybeSignal<string>;
      fillRule?: MaybeSignal<"nonzero" | "evenodd" | "inherit">;
      clipRule?: MaybeSignal<"nonzero" | "evenodd" | "inherit">;
      strokeDasharray?: MaybeSignal<string | number>;
      strokeDashoffset?: MaybeSignal<string | number>;
      strokeMiterlimit?: MaybeSignal<number | string>;
      vectorEffect?: MaybeSignal<string>;
      xmlns?: MaybeSignal<string>;
      xmlnsXlink?: MaybeSignal<string>;
    }

    interface IntrinsicElements {
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
      option: HTMLAttributes<HTMLOptionElement>;
      p: HTMLAttributes<HTMLParagraphElement>;
      script: HTMLAttributes<HTMLScriptElement>;
      section: HTMLAttributes<HTMLElement>;
      select: HTMLAttributes<HTMLSelectElement>;
      span: HTMLAttributes<HTMLSpanElement>;
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
      svg: SVGAttributes<SVGSVGElement>;
      circle: SVGAttributes<SVGCircleElement>;
      defs: SVGAttributes<SVGDefsElement>;
      g: SVGAttributes<SVGGElement>;
      line: SVGAttributes<SVGLineElement>;
      path: SVGAttributes<SVGPathElement>;
      rect: SVGAttributes<SVGRectElement>;
      text: SVGAttributes<SVGTextElement>;
    }
  }
}

export interface ChangeEvent<T extends EventTarget = HTMLInputElement> extends Event {
  target: T;
}

export {};
