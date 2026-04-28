import { createElement } from "./jsx-runtime.js";
import { hydrate } from "./hidrate.js";
import { cleanupEffectScope, createEffectScope, runWithEffectScope } from "./state.js";

const CLIENT_COMPONENT_SYMBOL = Symbol.for("adaptive.client_component");
const CLIENT_BOUNDARY_TAG = "adaptive-client-boundary";
const clientBoundaryScopes = new Map<HTMLElement, ReturnType<typeof createEffectScope>>();

type ClientMetadata = {
  moduleId: string;
  exportName: string;
};

type ClientComponentFunction = ((props?: Record<string, any>) => any) & {
  [CLIENT_COMPONENT_SYMBOL]?: ClientMetadata;
};

export function createClientComponent(
  moduleId: string,
  exportName = "default",
  serverRender?: ((props?: Record<string, any>) => any) | null,
): ClientComponentFunction {
  const component = ((props: Record<string, any> = {}) =>
    createElement(CLIENT_BOUNDARY_TAG, {
      "data-adaptive-client-module": moduleId,
      "data-adaptive-client-export": exportName,
      "data-adaptive-client-props": serializeClientProps(props)
    }, typeof serverRender === "function" ? createElement(serverRender, props) : null)) as ClientComponentFunction;

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
  cleanupDisconnectedClientComponentScopes();

  const nodes = document.querySelectorAll<HTMLElement>(`[data-adaptive-client-module="${cssEscape(moduleId)}"]`);

  nodes.forEach((node) => {
    if (node.dataset.adaptiveClientMounted === "true") return;

    const exportName = node.dataset.adaptiveClientExport || "default";
    const Component = exportsMap[exportName];
    if (typeof Component !== "function") return;

    const rawProps = node.dataset.adaptiveClientProps;
    const props = rawProps ? parseClientProps(rawProps) : {};
    const previousScope = clientBoundaryScopes.get(node);
    if (previousScope) {
      cleanupEffectScope(previousScope);
    }

    const nextScope = createEffectScope(`client:${moduleId}:${exportName}`);
    clientBoundaryScopes.set(node, nextScope);
    node.dataset.adaptiveClientMounted = "true";
    runWithEffectScope(nextScope, () => hydrate(node, () => createElement(Component, props)));
  });
}

export function isClientBoundaryTag(tag: unknown) {
  return tag === CLIENT_BOUNDARY_TAG;
}

export function cleanupClientComponentScopes(container?: ParentNode) {
  for (const [node, scope] of clientBoundaryScopes.entries()) {
    const shouldCleanup =
      !node.isConnected ||
      (container ? container.contains(node) : true);

    if (!shouldCleanup) {
      continue;
    }

    cleanupEffectScope(scope);
    clientBoundaryScopes.delete(node);
    delete node.dataset.adaptiveClientMounted;
  }
}

function cleanupDisconnectedClientComponentScopes() {
  cleanupClientComponentScopes();
}

function serializeClientProps(props: Record<string, any>) {
  return JSON.stringify(serializeValue(props, new WeakSet()));
}

function parseClientProps(raw: string) {
  try {
    return reviveValue(JSON.parse(raw));
  } catch {
    return {};
  }
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
