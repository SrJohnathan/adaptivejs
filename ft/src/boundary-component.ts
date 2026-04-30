import { createElement } from "./jsx-runtime.js";
import {
  applyHydrationInstructions,
  applyHydrationInstructionsBetweenMarkers,
  cleanupAdaptiveMarkersAfterSuccess,
  cleanupAdaptiveMarkersAfterSuccessBetweenMarkers,
  hydrateLegacyVDOM,
  hydrateLegacyVDOMBetweenMarkers,
  type AdaptiveHydrationMismatch,
  type HydrationInstruction,
  renderToDOM
} from "./hidrate.js";
import {
  cleanupEffectScope,
  createEffectScope,
  runHydrationCollection,
  runWithEffectScope,
  type DependencyList,
  type EffectFn
} from "./state.js";
import {
  CLIENT_BOUNDARY_END,
  CLIENT_BOUNDARY_MODE_CLIENT,
  CLIENT_BOUNDARY_MODE_HYDRATE,
  CLIENT_BOUNDARY_START_PREFIX,
  CLIENT_BOUNDARY_TAG,
  CLIENT_COMPONENT_SYMBOL,
  HYDRATE_SLOT_TAG,
  isClientBoundaryTag,
  isHydrateSlotTag
} from "./client-boundary.js";
import {
  HYDRATION_BOUNDARY_ID_ATTR,
  HYDRATION_MANIFEST_ATTR,
  type HydrationManifest,
  type HydrationManifestInstruction
} from "./hydration-manifest.js";
import { isSupportedDynamicHydrationPropName } from "./hydration-supported-props.js";

const clientBoundaryScopes = new Map<Node, {
  scope: ReturnType<typeof createEffectScope>;
  isConnected: () => boolean;
  isWithin: (container: ParentNode) => boolean;
}>();
const mountedClientBoundaries = new WeakSet<Node>();
const boundaryHydrationNotices = new Set<string>();

export type ClientMetadata = {
  moduleId: string;
  exportName: string;
};

export type ClientComponentFunction = ((props?: Record<string, any>) => any) & {
  [CLIENT_COMPONENT_SYMBOL]?: ClientMetadata;
};

export function createBoundaryComponent({
                                          mode,
                                          moduleId,
                                          exportName,
                                          serverRender,
                                          wrapServerProps
                                        }: {
  mode: string;
  moduleId: string;
  exportName: string;
  serverRender?: ((props?: Record<string, any>) => any) | null;
  wrapServerProps?: (props: Record<string, any>) => Record<string, any>;
}) {
  const hasChildren = (props: Record<string, any> = {}) =>
      props.children !== undefined &&
      (!Array.isArray(props.children) || props.children.length > 0);

  const component = ((props: Record<string, any> = {}) =>
      createElement(CLIENT_BOUNDARY_TAG, {
        "data-adaptive-client-mode": mode,
        "data-adaptive-client-module": moduleId,
        "data-adaptive-client-export": exportName,
        "data-adaptive-client-props": serializeClientProps(stripChildrenFromProps(props)),
        "data-adaptive-client-has-children": hasChildren(props) ? "true" : undefined
      }, typeof serverRender === "function"
          ? createElement(serverRender, wrapServerProps ? wrapServerProps(props) : props)
          : null)) as ClientComponentFunction;

  component[CLIENT_COMPONENT_SYMBOL] = { moduleId, exportName };
  return component;
}

export function isClientComponent(value: unknown): value is ClientComponentFunction {
  return typeof value === "function" && Boolean((value as ClientComponentFunction)[CLIENT_COMPONENT_SYMBOL]);
}

export function getClientComponentMetadata(value: unknown): ClientMetadata | null {
  return isClientComponent(value) ? value[CLIENT_COMPONENT_SYMBOL] ?? null : null;
}

export function hydrateClientComponents(moduleId: string, exportsMap: Record<string, any>) {
  if (typeof document === "undefined") return;
  runWhenDomReady(() => hydrateClientComponentsNow(moduleId, exportsMap));
}

function hydrateClientComponentsNow(moduleId: string, exportsMap: Record<string, any>) {
  cleanupDisconnectedClientComponentScopes();

  const commentBoundaries = findCommentBoundaries(moduleId);
  commentBoundaries.forEach((boundary) => {
    if (mountedClientBoundaries.has(boundary.start)) return;

    const Component = exportsMap[boundary.exportName];
    if (typeof Component !== "function") return;

    const props = boundary.rawProps ? parseClientProps(boundary.rawProps) : {};
    if (boundary.hasChildren) {
      props.children = boundary.mode === "hydrate"
          ? createElement(HYDRATE_SLOT_TAG, { hydrate: true })
          : collectNodesBetween(boundary.start, boundary.end);
    }

    const previousRecord = clientBoundaryScopes.get(boundary.start);
    if (previousRecord) {
      cleanupEffectScope(previousRecord.scope);
    }

    const nextScope = createEffectScope(`client:${moduleId}:${boundary.exportName}`);
    mountedClientBoundaries.add(boundary.start);
    let mountedNodes: Node[] = [];
    mountedNodes = runWithEffectScope(nextScope, () => {
      if (boundary.mode === CLIENT_BOUNDARY_MODE_CLIENT) {
        return mountClientComponentBetweenMarkers(boundary.start, boundary.end, Component, props);
      }

      if (boundary.mode === CLIENT_BOUNDARY_MODE_HYDRATE) {
        return hydrateExistingComponentBetweenMarkers(boundary.start, boundary.end, Component, props, boundary.boundaryId);
      }

      return [];
    });
    clientBoundaryScopes.set(boundary.start, {
      scope: nextScope,
      isConnected: () =>
          mountedNodes.length > 0
              ? mountedNodes.some((node) => node.isConnected)
              : Boolean(document.body?.isConnected),
      isWithin: (container) =>
          mountedNodes.length > 0
              ? mountedNodes.some((node) => container.contains(node))
              : true
    });
  });

  const nodes = document.querySelectorAll<HTMLElement>(`[data-adaptive-client-module="${cssEscape(moduleId)}"]`);

  nodes.forEach((node) => {
    if (mountedClientBoundaries.has(node)) return;

    const exportName = node.dataset.adaptiveClientExport || "default";
    const mode = node.dataset.adaptiveClientMode || "client";
    const boundaryId = node.getAttribute(HYDRATION_BOUNDARY_ID_ATTR) ?? "";
    const Component = exportsMap[exportName];
    if (typeof Component !== "function") return;

    const rawProps = node.dataset.adaptiveClientProps;
    const props = rawProps ? parseClientProps(rawProps) : {};
    if (node.dataset.adaptiveClientHasChildren === "true") {
      props.children = mode === "hydrate"
          ? createElement(HYDRATE_SLOT_TAG, { hydrate: true })
          : Array.from(node.childNodes);
    }
    const previousRecord = clientBoundaryScopes.get(node);
    if (previousRecord) {
      cleanupEffectScope(previousRecord.scope);
    }

    const nextScope = createEffectScope(`client:${moduleId}:${exportName}`);
    mountedClientBoundaries.add(node);
    const mountedNodes = runWithEffectScope(nextScope, () => {
      if (mode === CLIENT_BOUNDARY_MODE_CLIENT) {
        return mountClientComponent(node, Component, props);
      }

      if (mode === CLIENT_BOUNDARY_MODE_HYDRATE) {
        return hydrateExistingComponent(node, Component, props, boundaryId);
      }

      return [];
    });
    clientBoundaryScopes.set(node, {
      scope: nextScope,
      isConnected: () =>
          mountedNodes.length > 0
              ? mountedNodes.some((child) => child.isConnected)
              : node.isConnected,
      isWithin: (container) =>
          mountedNodes.length > 0
              ? mountedNodes.some((child) => container.contains(child))
              : container.contains(node)
    });
    cleanupClientBoundaryAttributes(node);
  });
}


function mountClientComponent(
    root: HTMLElement,
    Component: (props?: Record<string, any>) => any,
    props: Record<string, any>
): Node[] {
  root.replaceChildren(renderToDOM(createElement(Component, props)));
  return Array.from(root.childNodes);
}

function hydrateExistingComponent(
    root: HTMLElement,
    Component: (props?: Record<string, any>) => any,
    props: Record<string, any>,
    boundaryId = ""
): Node[] {
  return hydrateExistingBoundary(root, {
    debugName: getBoundaryDebugName(Component),
    component: Component,
    props,
    boundaryId,
    legacyFallback: () => {
      hydrateLegacyVDOM(root, () => createElement(Component, props), {
        recover: false,
        removeMarkers: false
      });
      return Array.from(root.childNodes);
    }
  });
}

function mountClientComponentBetweenMarkers(
    start: Comment,
    end: Comment,
    Component: (props?: Record<string, any>) => any,
    props: Record<string, any>
): Node[] {
  const parent = start.parentNode;
  if (!parent) return [];

  removeNodesBetween(start, end);
  const rendered = renderToDOM(createElement(Component, props));
  const mountedNodes = rendered.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? Array.from(rendered.childNodes)
      : [rendered];
  parent.insertBefore(rendered, end);
  return mountedNodes;
}

function hydrateExistingComponentBetweenMarkers(
    start: Comment,
    end: Comment,
    Component: (props?: Record<string, any>) => any,
    props: Record<string, any>,
    boundaryId = ""
): Node[] {
  return hydrateExistingBoundaryBetweenMarkers(start, end, {
    debugName: getBoundaryDebugName(Component),
    component: Component,
    props,
    boundaryId,
    legacyFallback: () => hydrateLegacyVDOMBetweenMarkers(start, end, () => createElement(Component, props), {
      recover: false,
      removeMarkers: false
    })
  });
}

function hydrateExistingBoundary(
    root: HTMLElement,
    config: {
      debugName: string;
      instructions?: HydrationInstruction[];
      component?: (props?: Record<string, any>) => any;
      props?: Record<string, any>;
      boundaryId?: string;
      legacyFallback?: () => Node[];
    }
): Node[] {
  const manifestRecord = readHydrationManifestFromRoot(root, config.boundaryId);
  const collected = collectHydrationBindings(config.component, config.props);
  const bound = manifestRecord
    ? bindHydrationManifest(manifestRecord.manifest, collected)
    : { instructions: [] as HydrationInstruction[], unsupportedFeatures: ["manifest:missing"] };
  const instructions = config.instructions ?? bound.instructions;
  if (bound.unsupportedFeatures.length === 0) {
    applyHydrationInstructions(root, instructions);
    manifestRecord?.script.remove();
    cleanupAdaptiveMarkersAfterSuccess(root);
    return Array.from(root.childNodes);
  }

  const res = adoptExistingBoundary({
    debugName: config.debugName,
    instructions,
    unsupportedFeatures: bound.unsupportedFeatures,
    fallback: config.legacyFallback,
    snapshot: () => Array.from(root.childNodes)
  });

  queueMicrotask(() => {
    cleanupAdaptiveMarkersAfterSuccess(root);
  });

  return res
}

function hydrateExistingBoundaryBetweenMarkers(
    start: Comment,
    end: Comment,
    config: {
      debugName: string;
      instructions?: HydrationInstruction[];
      component?: (props?: Record<string, any>) => any;
      props?: Record<string, any>;
      boundaryId?: string;
      legacyFallback?: () => Node[];
    }
): Node[] {
  const manifestRecord = readHydrationManifestBetweenMarkers(start, end, config.boundaryId);
  const collected = collectHydrationBindings(config.component, config.props);
  const bound = manifestRecord
    ? bindHydrationManifest(manifestRecord.manifest, collected)
    : { instructions: [] as HydrationInstruction[], unsupportedFeatures: ["manifest:missing"] };
  const instructions = config.instructions ?? bound.instructions;
  if (bound.unsupportedFeatures.length === 0) {
    applyHydrationInstructionsBetweenMarkers(start, end, instructions);
    manifestRecord?.script.remove();
    return cleanupAdaptiveMarkersAfterSuccessBetweenMarkers(start, end);
  }

 const res =  adoptExistingBoundary({
    debugName: config.debugName,
    instructions,
    unsupportedFeatures: bound.unsupportedFeatures,
    fallback: config.legacyFallback,
    snapshot: () => collectNodesBetween(start, end)
  });

  queueMicrotask(() => {
    cleanupAdaptiveMarkersAfterSuccessBetweenMarkers(start, end);
  })

  return res
}

function adoptExistingBoundary(config: {
  debugName: string;
  instructions: HydrationInstruction[];
  unsupportedFeatures: string[];
  fallback?: () => Node[];
  snapshot: () => Node[];
}): Node[] {
  if (config.unsupportedFeatures.length > 0) {
    recordBoundaryHydrationNotice(
      config.debugName,
      `Hydrate boundary requires legacy VDOM fallback. Unsupported features: ${config.unsupportedFeatures.join(", ")}`
    );
    return config.fallback?.() ?? config.snapshot();
  }

  return config.snapshot();
}

function collectHydrationBindings(
  Component?: ((props?: Record<string, any>) => any),
  props?: Record<string, any>
): {
  events: Map<string, { event: string; handler: EventListener }>;
  refs: Map<string, any>;
  reactive: Map<string, () => any>;
  dynamicProps: Map<string, { prop: string; getter: () => any }>;
  layoutEffects: Array<{ effect: EffectFn; deps?: DependencyList }>;
  effects: Array<{ effect: EffectFn; deps?: DependencyList }>;
  unsupportedFeatures: string[];
} {
  if (typeof Component !== "function") {
    return {
      events: new Map(),
      refs: new Map(),
      reactive: new Map(),
      dynamicProps: new Map(),
      layoutEffects: [],
      effects: [],
      unsupportedFeatures: []
    };
  }

  const collected = runHydrationCollection(() => {
    const bindings = {
      events: new Map<string, { event: string; handler: EventListener }>(),
      refs: new Map<string, any>(),
      reactive: new Map<string, () => any>(),
      dynamicProps: new Map<string, { prop: string; getter: () => any }>(),
      counters: {
        event: 0,
        ref: 0,
        reactive: 0,
        dynamicProp: 0
      },
      unsupportedFeatures: new Set<string>()
    };

    collectHydrationBindingsFromNode(createElement(Component, props ?? {}), bindings);

    return {
      ...bindings,
      unsupportedFeatures: Array.from(bindings.unsupportedFeatures)
    };
  });

  return {
    events: collected.value.events,
    refs: collected.value.refs,
    reactive: collected.value.reactive,
    dynamicProps: collected.value.dynamicProps,
    layoutEffects: collected.effectInstructions
      .filter((instruction) => instruction.kind === "layout-effect")
      .map((instruction) => ({ effect: instruction.effect, deps: instruction.deps })),
    effects: collected.effectInstructions
      .filter((instruction) => instruction.kind === "effect")
      .map((instruction) => ({ effect: instruction.effect, deps: instruction.deps })),
    unsupportedFeatures: Array.from(new Set([
      ...collected.unsupportedFeatures,
      ...collected.value.unsupportedFeatures
    ]))
  };
}

function collectHydrationBindingsFromNode(
  node: any,
  state: {
    events: Map<string, { event: string; handler: EventListener }>;
    refs: Map<string, any>;
    reactive: Map<string, () => any>;
    dynamicProps: Map<string, { prop: string; getter: () => any }>;
    counters: {
      event: number;
      ref: number;
      reactive: number;
      dynamicProp: number;
    };
    unsupportedFeatures: Set<string>;
  }
) {
  if (node == null || node === false || typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return;
  }

  if (typeof node === "function") {
    const preview = node();
    const classification = classifyReactivePreview(preview);
    const reactiveKey = nextInstructionKey(state, "reactive");

    if (classification === "range") {
      state.reactive.set(reactiveKey, node);
      return;
    }

    if (classification === "list") {
      state.reactive.set(reactiveKey, node as () => any[]);
      collectHydrationBindingsFromNode(preview, state);
      return;
    }

    if (classification === "async") {
      state.reactive.set(reactiveKey, node as () => Promise<any> | any);
      return;
    }

    state.reactive.set(reactiveKey, node);
    collectHydrationBindingsFromNode(preview, state);
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => collectHydrationBindingsFromNode(child, state));
    return;
  }

  if (typeof node.tag === "function") {
    collectHydrationBindingsFromNode(node.tag(resolveComponentProps(node)), state);
    return;
  }

  if (node.tag === "Fragment") {
    collectHydrationBindingsFromNode(node.children ?? [], state);
    return;
  }

  if (isHydrateSlotTag(node.tag) || isClientBoundaryTag(node.tag)) {
    return;
  }

  const props = node.props ?? {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on") && typeof value === "function") {
      state.events.set(nextInstructionKey(state, "event"), {
        event: key.slice(2).toLowerCase(),
        handler: value as EventListener
      });
      continue;
    }
    if (key === "ref" && value != null) {
      state.refs.set(nextInstructionKey(state, "ref"), value);
      continue;
    }
    if (
      key !== "children" &&
      key !== "ref" &&
      typeof value === "function" &&
      isSupportedDynamicHydrationPropName(key)
    ) {
      state.dynamicProps.set(nextInstructionKey(state, "dynamicProp"), {
        prop: key,
        getter: value as () => any
      });
      continue;
    }
    if (
      !key.startsWith("on") &&
      key !== "children" &&
      key !== "ref" &&
      typeof value === "function" &&
      !isSupportedDynamicHydrationPropName(key)
    ) {
      state.unsupportedFeatures.add(`dynamic-prop:${key}`);
    }
  }

  collectHydrationBindingsFromNode(node.children ?? [], state);
}

function nextInstructionKey(
  state: {
    counters: {
      event: number;
      ref: number;
      reactive: number;
      dynamicProp: number;
    };
  },
  kind: "event" | "ref" | "reactive" | "dynamicProp"
) {
  const value = state.counters[kind];
  state.counters[kind] += 1;
  return resolveInstructionKey(kind, value);
}

function resolveInstructionKey(
  kind: "event" | "ref" | "reactive" | "dynamicProp",
  index: number
) {
  switch (kind) {
    case "event":
      return `e${index}`;
    case "ref":
      return `f${index}`;
    case "reactive":
      return `rx${index}`;
    case "dynamicProp":
      return `p${index}`;
  }
}

function bindHydrationManifest(
  manifest: HydrationManifest,
  collected: ReturnType<typeof collectHydrationBindings>
): { instructions: HydrationInstruction[]; unsupportedFeatures: string[] } {
  const instructions: HydrationInstruction[] = [];
  const unsupportedFeatures = new Set<string>(collected.unsupportedFeatures);
  const events = new Map(collected.events);
  const refs = new Map(collected.refs);
  const reactive = new Map(collected.reactive);
  const dynamicProps = new Map(collected.dynamicProps);

  for (const instruction of manifest.instructions) {
    switch (instruction.kind) {
      case "event": {
        const next = events.get(instruction.key);
        if (!next || next.event !== instruction.event) {
          unsupportedFeatures.add(`manifest:event:${instruction.key}:${instruction.id}`);
          break;
        }
        events.delete(instruction.key);
        instructions.push({
          kind: "event",
          id: instruction.id,
          event: instruction.event,
          handler: next.handler
        });
        break;
      }
      case "ref": {
        const next = refs.get(instruction.key);
        if (next == null) {
          unsupportedFeatures.add(`manifest:ref:${instruction.key}:${instruction.id}`);
          break;
        }
        refs.delete(instruction.key);
        instructions.push({
          kind: "ref",
          id: instruction.id,
          ref: next
        });
        break;
      }
      case "reactive-range": {
        const next = reactive.get(instruction.key);
        if (!next) {
          unsupportedFeatures.add(`manifest:reactive-range:${instruction.key}:${instruction.id}`);
          break;
        }
        reactive.delete(instruction.key);
        instructions.push({
          kind: "reactive-range",
          id: instruction.id,
          getter: next
        });
        break;
      }
      case "reactive-struct": {
        const next = reactive.get(instruction.key);
        if (!next) {
          unsupportedFeatures.add(`manifest:reactive-struct:${instruction.key}:${instruction.id}`);
          break;
        }
        reactive.delete(instruction.key);
        instructions.push({
          kind: "reactive-struct",
          id: instruction.id,
          render: next
        });
        break;
      }
      case "reactive-list": {
        const next = reactive.get(instruction.key);
        if (!next) {
          unsupportedFeatures.add(`manifest:reactive-list:${instruction.key}:${instruction.id}`);
          break;
        }
        reactive.delete(instruction.key);
        instructions.push({
          kind: "reactive-list",
          id: instruction.id,
          getter: next
        });
        break;
      }
      case "reactive-async": {
        const next = reactive.get(instruction.key);
        if (!next) {
          unsupportedFeatures.add(`manifest:reactive-async:${instruction.key}:${instruction.id}`);
          break;
        }
        reactive.delete(instruction.key);
        instructions.push({
          kind: "reactive-async",
          id: instruction.id,
          getter: next
        });
        break;
      }
      case "dynamic-prop": {
        const next = dynamicProps.get(instruction.key);
        if (!next || next.prop !== instruction.prop) {
          unsupportedFeatures.add(`manifest:dynamic-prop:${instruction.key}:${instruction.id}:${instruction.prop}`);
          break;
        }
        dynamicProps.delete(instruction.key);
        instructions.push({
          kind: "dynamic-prop",
          id: instruction.id,
          prop: instruction.prop,
          getter: next.getter
        });
        break;
      }
    }
  }

  if (events.size > 0) unsupportedFeatures.add(`manifest:event:extra:${Array.from(events.keys()).join(",")}`);
  if (refs.size > 0) unsupportedFeatures.add(`manifest:ref:extra:${Array.from(refs.keys()).join(",")}`);
  if (reactive.size > 0) unsupportedFeatures.add(`manifest:reactive:extra:${Array.from(reactive.keys()).join(",")}`);
  if (dynamicProps.size > 0) unsupportedFeatures.add(`manifest:dynamic-prop:extra:${Array.from(dynamicProps.keys()).join(",")}`);

  debugHydrationBinding(manifest, collected, instructions, unsupportedFeatures);

  instructions.push(
    ...collected.layoutEffects.map((instruction): HydrationInstruction => ({
      kind: "layout-effect",
      effect: instruction.effect,
      deps: instruction.deps
    })),
    ...collected.effects.map((instruction): HydrationInstruction => ({
      kind: "effect",
      effect: instruction.effect,
      deps: instruction.deps
    }))
  );

  return {
    instructions,
    unsupportedFeatures: Array.from(unsupportedFeatures)
  };
}

function debugHydrationBinding(
  manifest: HydrationManifest,
  collected: ReturnType<typeof collectHydrationBindings>,
  instructions: HydrationInstruction[],
  unsupportedFeatures: Set<string>
) {
  if (typeof window === "undefined" || (window as any).__ADAPTIVE_DEBUG_HYDRATION__ !== true) {
    return;
  }

  console.groupCollapsed(`[Adaptive hydrate] boundary ${manifest.boundaryId}`);
  console.log("manifest instruction keys", manifest.instructions.map((instruction) => ({
    key: instruction.key,
    kind: instruction.kind,
    id: "id" in instruction ? instruction.id : undefined,
    event: "event" in instruction ? instruction.event : undefined,
    prop: "prop" in instruction ? instruction.prop : undefined
  })));
  console.log("collected function keys", {
    events: Array.from(collected.events.keys()),
    refs: Array.from(collected.refs.keys()),
    reactive: Array.from(collected.reactive.keys()),
    dynamicProps: Array.from(collected.dynamicProps.keys())
  });
  console.log("binding result", instructions.map((instruction) => ({
    kind: instruction.kind,
    id: "id" in instruction ? instruction.id : undefined,
    event: "event" in instruction ? instruction.event : undefined,
    prop: "prop" in instruction ? instruction.prop : undefined
  })));
  console.log("missing/extra keys", Array.from(unsupportedFeatures));
  console.groupEnd();
}

function classifyReactivePreview(value: any): "range" | "list" | "struct" | "async" {
  if (isPromiseLike(value)) {
    return "async";
  }
  if (Array.isArray(value)) {
    return isTextLikeCollection(value) ? "range" : "list";
  }
  if (isTextLikeValue(value)) {
    return "range";
  }
  return "struct";
}

function isPromiseLike(value: any): value is PromiseLike<any> {
  return value != null && typeof value === "object" && typeof value.then === "function";
}

function isTextLikeValue(value: any): boolean {
  return value == null || value === false || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isTextLikeCollection(value: any[]): boolean {
  return value.every((item) => {
    if (Array.isArray(item)) {
      return isTextLikeCollection(item);
    }
    return isTextLikeValue(item);
  });
}

function removeNodesBetween(start: Comment, end: Comment) {
  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

function runWhenDomReady(callback: () => void) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
    return;
  }

  callback();
}

export function cleanupClientComponentScopes(container?: ParentNode) {
  for (const [node, record] of clientBoundaryScopes.entries()) {
    const shouldCleanup =
        !record.isConnected() ||
        (container ? record.isWithin(container) : true);

    if (!shouldCleanup) {
      continue;
    }

    cleanupEffectScope(record.scope);
    clientBoundaryScopes.delete(node);
  }
}

export function wrapHydratePropsForServer(props: Record<string, any>) {
  if (!("children" in props)) {
    return props;
  }

  const children = Array.isArray(props.children)
      ? props.children
      : props.children == null
          ? []
          : [props.children];

  return {
    ...props,
    children: createElement(HYDRATE_SLOT_TAG, {}, ...children)
  };
}

function cleanupDisconnectedClientComponentScopes() {
  cleanupClientComponentScopes();
}

function resolveComponentProps(vNode: any) {
  const props = { ...(vNode.props ?? {}) };
  const children = vNode.children ?? [];
  if (children.length > 0 || props.children === undefined) {
    props.children = children;
  }
  return props;
}

function getBoundaryDebugName(Component: (props?: Record<string, any>) => any) {
  return Component.name || "anonymous";
}

function recordBoundaryHydrationNotice(path: string, message: string) {
  const key = `${path}:${message}`;
  if (boundaryHydrationNotices.has(key)) {
    return;
  }
  boundaryHydrationNotices.add(key);

  const entry: AdaptiveHydrationMismatch = {
    path,
    route: readHydrationRoute(),
    message,
    htmlSnippet: undefined,
    timestamp: Date.now()
  };

  if (typeof window !== "undefined") {
    window.__ADAPTIVE_HYDRATION_MISMATCHES__ ??= [];
    window.__ADAPTIVE_HYDRATION_MISMATCHES__.push(entry);
    if ((window as any).__ADAPTIVE_DEBUG_HYDRATION__ === true) {
      console.warn("[Adaptive hydration boundary notice]", entry);
    }
    return;
  }

  if ((globalThis as any)?.process?.env?.ADAPTIVE_PUBLIC_DEBUG_HYDRATION === "true") {
    console.warn("[Adaptive hydration boundary notice]", entry);
  }
}

function readHydrationRoute() {
  if (typeof window === "undefined") {
    return "server";
  }

  return window.__ROUTE__ ?? window.location.pathname;
}

function readHydrationManifestFromRoot(root: ParentNode, boundaryId?: string) {
  const selector = boundaryId
    ? `script[${HYDRATION_MANIFEST_ATTR}][${HYDRATION_BOUNDARY_ID_ATTR}="${cssEscape(boundaryId)}"]`
    : `script[${HYDRATION_MANIFEST_ATTR}]`;
  const script = root instanceof Element
    ? root.querySelector<HTMLScriptElement>(selector)
    : null;
  if (!script) {
    return null;
  }
  const manifest = script ? parseHydrationManifest(script.textContent ?? "") : null;
  if (!manifest) {
    return null;
  }

  return { script, manifest };
}

function readHydrationManifestBetweenMarkers(start: Comment, end: Comment, boundaryId?: string) {
  let current: Node | null = start.nextSibling;

  while (current && current !== end) {
    if (current.nodeType === Node.COMMENT_NODE && (current as Comment).data.startsWith(CLIENT_BOUNDARY_START_PREFIX)) {
      current = skipNestedBoundary(current as Comment, start.parentNode as Node, end);
      continue;
    }

    if (
      current.nodeType === Node.ELEMENT_NODE &&
      (current as Element).tagName === "SCRIPT" &&
      (current as Element).hasAttribute(HYDRATION_MANIFEST_ATTR)
    ) {
      const script = current as HTMLScriptElement;
      const candidateBoundaryId = script.getAttribute(HYDRATION_BOUNDARY_ID_ATTR) ?? "";
      if (!boundaryId || candidateBoundaryId === boundaryId) {
        const manifest = parseHydrationManifest(script.textContent ?? "");
        if (manifest) {
          return { script, manifest };
        }
      }
    }

    current = current.nextSibling;
  }

  return null;
}

function parseHydrationManifest(raw: string): HydrationManifest | null {
  try {
    return JSON.parse(raw) as HydrationManifest;
  } catch {
    return null;
  }
}

function skipNestedBoundary(current: Comment, parent: Node, end: Node) {
  const boundaryEnd = findMatchingMarkerEnd(parent, current, CLIENT_BOUNDARY_START_PREFIX, CLIENT_BOUNDARY_END);
  return boundaryEnd ? boundaryEnd.nextSibling : end;
}

function findCommentBoundaries(moduleId: string) {
  const boundaries: Array<{
    start: Comment;
    end: Comment;
    mode: string;
    moduleId: string;
    exportName: string;
    rawProps: string;
    hasChildren: boolean;
    boundaryId: string;
  }> = [];

  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
  const stack: Array<{
    start: Comment;
    mode: string;
    moduleId: string;
    exportName: string;
    rawProps: string;
    hasChildren: boolean;
    boundaryId: string;
  }> = [];

  let current = walker.nextNode();
  while (current) {
    const comment = current as Comment;
    const content = comment.data ?? "";

    if (content.startsWith(CLIENT_BOUNDARY_START_PREFIX)) {
      const payload = decodeCommentPayload(content.slice(CLIENT_BOUNDARY_START_PREFIX.length));
      if (payload) {
        stack.push({
          start: comment,
          mode: payload.mode,
          moduleId: payload.moduleId,
          exportName: payload.exportName,
          rawProps: payload.rawProps,
          hasChildren: payload.hasChildren,
          boundaryId: payload.boundaryId
        });
      }
    } else if (content === CLIENT_BOUNDARY_END) {
      const boundary = stack.pop();
      if (boundary && boundary.moduleId === moduleId) {
        boundaries.push({
          ...boundary,
          end: comment
        });
      }
    }

    current = walker.nextNode();
  }

  return boundaries;
}

function decodeCommentPayload(raw: string) {
  try {
    return JSON.parse(decodeURIComponent(raw)) as {
      mode: string;
      moduleId: string;
      exportName: string;
      rawProps: string;
      hasChildren: boolean;
      boundaryId: string;
    };
  } catch {
    return null;
  }
}

function collectNodesBetween(start: Comment, end: Comment) {
  const nodes: Node[] = [];
  let current = start.nextSibling;

  while (current && current !== end) {
    nodes.push(current);
    current = current.nextSibling;
  }

  return nodes;
}

function serializeClientProps(props: Record<string, any>) {
  return JSON.stringify(serializeValue(props, new WeakSet()));
}

function stripChildrenFromProps(props: Record<string, any>) {
  if (!("children" in props)) {
    return props;
  }

  const nextProps = { ...props };
  delete nextProps.children;
  return nextProps;
}

function parseClientProps(raw: string) {
  try {
    return reviveValue(JSON.parse(raw));
  } catch {
    return {};
  }
}

function findMatchingMarkerEnd(parent: Node, start: Comment, startMarker: string, endMarker: string) {
  let depth = 1;
  let current = start.nextSibling;

  while (current) {
    if (current.nodeType === Node.COMMENT_NODE) {
      const data = (current as Comment).data;
      if (isMatchingMarkerStart(data, startMarker)) {
        depth += 1;
      } else if (isMatchingMarkerEnd(data, endMarker)) {
        depth -= 1;
        if (depth === 0) {
          return current as Comment;
        }
      }
    }

    current = current.nextSibling;
  }

  return null;
}

function isMatchingMarkerStart(data: string, marker: string) {
  return data === marker || data.startsWith(normalizeMarkerPrefix(marker));
}

function isMatchingMarkerEnd(data: string, marker: string) {
  return data === marker || data.startsWith(normalizeMarkerPrefix(marker));
}

function normalizeMarkerPrefix(marker: string) {
  return marker.endsWith(":") ? marker : `${marker}:`;
}

function serializeValue(value: any, seen: WeakSet<object>): any {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return { __adaptive_type: "bigint", value: value.toString() };
  }

  if (value instanceof Date) {
    return { __adaptive_type: "date", value: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, seen));
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return { __adaptive_type: "unsupported", value: typeof value };
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return { __adaptive_type: "circular" };
    }
    seen.add(value);

    const output: Record<string, any> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === "ref") continue;
      const sanitized = serializeValue(nested, seen);
      if (sanitized !== undefined) {
        output[key] = sanitized;
      }
    }
    seen.delete(value);
    return output;
  }

  return undefined;
}

function reviveValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => reviveValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (value.__adaptive_type === "date") {
    return new Date(value.value);
  }

  if (value.__adaptive_type === "bigint") {
    return BigInt(value.value);
  }

  if (value.__adaptive_type === "unsupported" || value.__adaptive_type === "circular") {
    return undefined;
  }

  const output: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value)) {
    const revived = reviveValue(nested);
    if (revived !== undefined) {
      output[key] = revived;
    }
  }

  return output;
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

function cleanupClientBoundaryAttributes(node: HTMLElement) {
  node.removeAttribute("data-adaptive-client-mode");
  node.removeAttribute("data-adaptive-client-module");
  node.removeAttribute("data-adaptive-client-export");
  node.removeAttribute("data-adaptive-client-props");
  node.removeAttribute("data-adaptive-client-has-children");
  node.removeAttribute("data-adaptive-client-mounted");
}
