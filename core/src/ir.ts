import type { AdaptiveChild, AdaptiveType } from "@adaptivejs/ft";

export type IRScalar = string | number | boolean | null;

export type IRValue =
  | IRScalar
  | IRScalar[]
  | { [key: string]: IRValue }
  | IRDynamicValue
  | IREventValue;

export type IRDynamicValue = {
  kind: "dynamic";
  hint?: string;
};

export type IREventValue = {
  kind: "event";
  name: string;
  actionId?: string;
};

export type IRTextNode = {
  kind: "text";
  value: string;
};

export type IRDynamicNode = {
  kind: "dynamic";
  hint?: string;
};

export type IRFragmentNode = {
  kind: "fragment";
  children: IRNode[];
};

export type IRElementNode = {
  kind: "element";
  tag: string;
  props: Record<string, IRValue>;
  children: IRNode[];
};

export type IRNode = IRTextNode | IRDynamicNode | IRFragmentNode | IRElementNode;

export type IRStateDefinition = {
  id: string;
  setter?: string;
  kind: "reactive";
  source: "useReactive";
  initial: IRValue;
};

export type IRStateBinding = {
  stateId: string;
  access: "value" | "call";
  scope: "render" | "event" | "other";
};

export type IRStateAction = {
  id: string;
  stateId: string;
  setter: string;
  operation: "set" | "update" | "add";
  scope: "render" | "event" | "other";
  argument?: IRValue;
};

export type IRLifecycleEffect = {
  id: string;
  hook: "useEffect" | "useLayoutEffect";
  runOn: "resume";
  cleanupOn: "pause";
  actions: IRStateAction[];
  cleanupActions?: IRStateAction[];
  unsupported?: string[];
};

export type IRComponentBinding = {
  component: string;
  index: number;
  target: string;
  stateId: string;
  prefix?: string;
  suffix?: string;
};

export type IRComponentAction = {
  component: string;
  index: number;
  target: string;
  eventName: string;
  actionId: string;
  stateId: string;
};

export type IRPageDocument = {
  kind: "page";
  route: string;
  source: string;
  state?: IRStateDefinition[];
  bindings?: IRStateBinding[];
  actions?: IRStateAction[];
  effects?: IRLifecycleEffect[];
  tree: IRNode | null;
};

export type IRDesktopDocument = {
  kind: "desktop-entry";
  entry: string;
  initialRoute?: string;
  state?: IRStateDefinition[];
  bindings?: IRStateBinding[];
  actions?: IRStateAction[];
  effects?: IRLifecycleEffect[];
  componentBindings?: IRComponentBinding[];
  componentActions?: IRComponentAction[];
  pages?: IRDesktopPageDocument[];
  tree: IRNode | null;
};

export type IRDesktopPageDocument = {
  route: string;
  source: string;
  state?: IRStateDefinition[];
  bindings?: IRStateBinding[];
  actions?: IRStateAction[];
  effects?: IRLifecycleEffect[];
  componentBindings?: IRComponentBinding[];
  componentActions?: IRComponentAction[];
  tree: IRNode | null;
};

export type IRPageManifestEntry = {
  route: string;
  source: string;
  file: string;
};

export type NormalizeToIROptions = {
  resolveComponents?: boolean;
  evaluateDynamicChildren?: boolean;
  evaluateDynamicProps?: boolean;
  includeNulls?: boolean;
};

const DEFAULT_OPTIONS: Required<NormalizeToIROptions> = {
  resolveComponents: true,
  evaluateDynamicChildren: false,
  evaluateDynamicProps: false,
  includeNulls: false
};

export function createIRText(value: string): IRTextNode {
  return { kind: "text", value };
}

export function createIRDynamic(hint?: string): IRDynamicNode {
  return { kind: "dynamic", hint };
}

export function createIRFragment(children: IRNode[] = []): IRFragmentNode {
  return { kind: "fragment", children };
}

export function createIRElement(tag: string, props: Record<string, IRValue> = {}, children: IRNode[] = []): IRElementNode {
  return { kind: "element", tag, props, children };
}

export function serializeIR(node: IRNode): string {
  return JSON.stringify(node, null, 2);
}

export function createIRPageDocument(route: string, source: string, tree: IRNode | null): IRPageDocument {
  return {
    kind: "page",
    route,
    source,
    tree
  };
}

export function createIRDesktopDocument(
  entry: string,
  tree: IRNode | null,
  state: IRStateDefinition[] = [],
  bindings: IRStateBinding[] = [],
  actions: IRStateAction[] = [],
  effects: IRLifecycleEffect[] = [],
  componentBindings: IRComponentBinding[] = [],
  componentActions: IRComponentAction[] = [],
  initialRoute = "/",
  pages: IRDesktopPageDocument[] = []
): IRDesktopDocument {
  return {
    kind: "desktop-entry",
    entry,
    initialRoute,
    state,
    bindings,
    actions,
    effects,
    componentBindings,
    componentActions,
    pages,
    tree
  };
}

export function serializeIRPageDocument(document: IRPageDocument): string {
  return JSON.stringify(document, null, 2);
}

export function serializeIRDesktopDocument(document: IRDesktopDocument): string {
  return JSON.stringify(document, null, 2);
}

export function normalizeToIR(input: AdaptiveChild | AdaptiveType, options: NormalizeToIROptions = {}): IRNode | null {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  return normalizeChild(input, resolvedOptions);
}

function normalizeChild(input: AdaptiveChild | AdaptiveType, options: Required<NormalizeToIROptions>): IRNode | null {
  if (input == null || input === false) {
    return options.includeNulls ? createIRDynamic("nullish") : null;
  }

  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return createIRText(String(input));
  }

  if (Array.isArray(input)) {
    const children = input
      .map((child) => normalizeChild(child, options))
      .filter((child): child is IRNode => child !== null);
    return createIRFragment(children);
  }

  if (typeof input === "function") {
    if (!options.evaluateDynamicChildren) {
      return createIRDynamic("function-child");
    }

    try {
      return normalizeChild(input(), options);
    } catch {
      return createIRDynamic("function-child-error");
    }
  }

  if (typeof input === "object" && "tag" in input) {
    return normalizeElement(input as AdaptiveType, options);
  }

  return createIRDynamic("unsupported-child");
}

function normalizeElement(node: AdaptiveType, options: Required<NormalizeToIROptions>): IRNode | null {
  if (typeof node.tag === "function") {
    const tagName = node.tag.name || "AnonymousComponent";

    if (tagName === "Fragment") {
      const fragmentChildren = (node.children ?? [])
        .map((child: AdaptiveChild) => normalizeChild(child, options))
        .filter((child: IRNode | null): child is IRNode => child !== null);
      return createIRFragment(fragmentChildren);
    }

    if (!options.resolveComponents) {
      return createIRDynamic(`component:${tagName}`);
    }

    try {
      const rendered = node.tag({
        ...(node.props ?? {}),
        children: node.children ?? []
      });
      return normalizeChild(rendered, options);
    } catch {
      return createIRDynamic(`component-error:${tagName}`);
    }
  }

  const props = normalizeProps(node.props ?? {}, options);
  const children = (node.children ?? [])
    .map((child: AdaptiveChild) => normalizeChild(child, options))
    .filter((child: IRNode | null): child is IRNode => child !== null)
    .flatMap((child: IRNode) => (child.kind === "fragment" ? child.children : [child]));

  if (node.tag === "Fragment") {
    return createIRFragment(children);
  }

  return createIRElement(String(node.tag), props, children);
}

function normalizeProps(props: Record<string, unknown>, options: Required<NormalizeToIROptions>): Record<string, IRValue> {
  const output: Record<string, IRValue> = {};

  for (const [key, value] of Object.entries(props)) {
    if (key === "children") continue;
    const normalized = normalizePropValue(key, value, options);
    if (normalized !== undefined) {
      output[key] = normalized;
    }
  }

  return output;
}

function normalizePropValue(key: string, value: unknown, options: Required<NormalizeToIROptions>): IRValue | undefined {
  if (value == null) return options.includeNulls ? null : undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (typeof value === "function") {
    if (/^on[A-Z]/.test(key)) {
      return { kind: "event", name: key };
    }

    if (!options.evaluateDynamicProps) {
      return { kind: "dynamic", hint: `prop:${key}` };
    }

    try {
      return normalizePropValue(key, value(), options);
    } catch {
      return { kind: "dynamic", hint: `prop-error:${key}` };
    }
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeCollectionItem(item, options))
      .filter((item): item is IRScalar => item !== undefined);
  }

  if (typeof value === "object") {
    const record: Record<string, IRValue> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizePropValue(nestedKey, nestedValue, options);
      if (normalized !== undefined) {
        record[nestedKey] = normalized;
      }
    }
    return record;
  }

  return { kind: "dynamic", hint: `prop:${key}` };
}

function normalizeCollectionItem(value: unknown, options: Required<NormalizeToIROptions>): IRScalar | undefined {
  if (value == null) return options.includeNulls ? null : undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}
