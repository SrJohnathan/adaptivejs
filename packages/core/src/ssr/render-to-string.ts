/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import { CONTEXT_PROVIDER_TAG, runWithServerContext } from "@adaptive-js/shared";
import {
  CLIENT_BOUNDARY_END,
  CLIENT_BOUNDARY_MODE_CLIENT,
  CLIENT_BOUNDARY_MODE_HYDRATE,
  CLIENT_BOUNDARY_START_PREFIX,
  HYDRATE_SLOT_END,
  HYDRATE_SLOT_START,
  isClientBoundaryTag,
  isHydrateSlotTag,
  REACTIVE_ASYNC_END,
  REACTIVE_ASYNC_START,
  REACTIVE_CHILD_END,
  REACTIVE_CHILD_START,
  REACTIVE_LIST_END,
  REACTIVE_LIST_START,
  REACTIVE_STRUCT_END,
  REACTIVE_STRUCT_START
} from "../hydration/client-boundary.js";
import {
  HYDRATION_BOUNDARY_ID_ATTR,
  HYDRATION_MANIFEST_ATTR,
  type HydrationManifestInstruction
} from "../hydration/hydration-manifest.js";
import {isSupportedDynamicHydrationPropName} from "../hydration/hydration-supported-props.js";

const SVG_TAGS = new Set([
  "svg",
  "circle",
  "defs",
  "g",
  "line",
  "path",
  "rect",
  "text",
  "ellipse",
  "polygon",
  "polyline",
  "use",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "foreignObject"
]);

const SVG_ATTRIBUTE_NAME_MAP: Record<string, string> = {
  className: "class",
  strokeWidth: "stroke-width",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeMiterlimit: "stroke-miterlimit",
  fillRule: "fill-rule",
  clipRule: "clip-rule",
  viewBox: "viewBox",
  preserveAspectRatio: "preserveAspectRatio",
  vectorEffect: "vector-effect",
  xmlnsXlink: "xmlns:xlink"
};

type RenderContext = {
  clientModuleIds?: Set<string>;
  hydrateAidCounter?: { value: number };
  hydrateReactiveCounter?: { value: number };
  hydrateBoundaryCounter?: { value: number };
  hydrateManifest?: HydrationManifestInstruction[];
  currentBoundaryId?: string;
  hydrateInstructionCounters?: {
    event: number;
    ref: number;
    reactive: number;
    dynamicProp: number;
  };
};

export function renderToString(node: any): string {
  return renderNode(node, {});
}

export function renderToStringWithMetadata(node: any): { html: string; clientModuleIds: string[] } {
  const context: RenderContext = {
    clientModuleIds: new Set<string>(),
    hydrateBoundaryCounter: { value: 0 }
  };

  return {
    html: renderNode(node, context),
    clientModuleIds: Array.from(context.clientModuleIds ?? [])
  };
}

function getVNodeChildren(node: any): any {
  if (!node) return [];

  if (Array.isArray(node.children) && node.children.length > 0) {
    return node.children;
  }

  if (node.children !== undefined && !Array.isArray(node.children)) {
    return node.children;
  }

  return node.props?.children ?? [];
}



const ssrPreviewErrors = new Set<string>();

function safePreview(fn: () => any) {
  try {
    return fn();
  } catch (error: any) {
    const key = error?.message || String(error);

    if (!ssrPreviewErrors.has(key)) {
      ssrPreviewErrors.add(key);

      /*if (process.env.NODE_ENV !== "production") {
        console.warn(
            "[Adaptive SSR] Erro em função reativa durante render:",
            error
        );
      }*/
    }

    // return "";
  }
}

function renderNode(node: any, context: RenderContext): string {
  if (typeof node === "function") {



    const preview = safePreview(node);
    const localReactiveId = context.hydrateReactiveCounter
        ? String(context.hydrateReactiveCounter.value++)
        : null;

    const reactiveId =
        localReactiveId !== null && context.currentBoundaryId
            ? `${context.currentBoundaryId}:${localReactiveId}`
            : localReactiveId;

    const markerPair = resolveReactiveMarkerPair(preview);

    if (context.hydrateManifest && reactiveId !== null) {
      const kind = resolveManifestReactiveKind(markerPair.start);
      context.hydrateManifest.push({
        key: nextHydrationInstructionKey(context, "reactive"),
        kind,
        id: reactiveId
      });
    }

    const startMarker = reactiveId == null ? markerPair.start : `${markerPair.start}:${reactiveId}`;
    const endMarker = reactiveId == null ? markerPair.end : `${markerPair.end}:${reactiveId}`;

    const reactiveContext = {
      ...context,
      hydrateManifest: undefined,
      hydrateInstructionCounters: undefined,
      hydrateAidCounter: undefined
    };

    return `<!--${startMarker}-->${renderNode(resolveReactivePreviewForSSR(preview), reactiveContext)}<!--${endMarker}-->`;
  }

  if (node == null || node === false) return "";

  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => renderNode(child, context)).join("");
  }

  if (node.tag === CONTEXT_PROVIDER_TAG) {
    return runWithServerContext(
        node.props.context.id,
        node.props.value,
        () => renderNode(node.children ?? [], context)
    );
  }

  if (typeof node.tag === "function") {
    const result = node.tag(resolveComponentProps(node));
    return renderNode(result, context);
  }

  if (node.tag === "Fragment") {
    return renderNode(getVNodeChildren(node), context);
  }

  if (isHydrateSlotTag(node.tag)) {
    return renderHydrateSlot(node, context);
  }

  if (isClientBoundaryTag(node.tag)) {
    return renderClientBoundary(node, context);
  }

  const { tag, props = {} } = node;
  const children = getVNodeChildren(node);
  const isSvgTag = SVG_TAGS.has(tag);

  const nextProps = { ...(props ?? {}) };
  let propsString = "";

  const hydrateId = maybeAllocateHydrationId(nextProps, context);

  if (hydrateId !== null && nextProps["data-aid"] === undefined) {
    propsString += ` data-aid="${escapeAttribute(hydrateId)}"`;
    appendHydrationManifestForProps(nextProps, hydrateId, context);
  }

  for (const [key, value] of Object.entries(nextProps)) {
    if (key === "children" || key === "ref" || value == null) continue;
    if (key.startsWith("on") && typeof value === "function") continue;

    const attrKey = resolveAttributeName(key, isSvgTag);

    if (key === "style" && typeof value === "object") {
      const styleString = Object.entries(value as Record<string, string>)
          .map(([styleKey, styleValue]) => `${styleKey.replace(/([A-Z])/g, "-$1").toLowerCase()}:${styleValue}`)
          .join(";");

      propsString += ` style="${escapeAttribute(styleString)}"`;
      continue;
    }

    const resolved = typeof value === "function" ? value() : value;
    propsString += ` ${attrKey}="${escapeAttribute(String(resolved))}"`;
  }

  const selfClosingTags = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ]);

  if (selfClosingTags.has(tag)) {
    return `<${tag}${propsString} />`;
  }

  return `<${tag}${propsString}>${renderNode(children, context)}</${tag}>`;
}

function resolveAttributeName(key: string, isSvgTag: boolean) {
  if (isSvgTag) {
    return SVG_ATTRIBUTE_NAME_MAP[key] ?? key;
  }

  return key === "className" ? "class" : key;
}

function resolveComponentProps(node: any) {
  const props = { ...(node.props ?? {}) };
  const children = getVNodeChildren(node);

  if (
      (Array.isArray(children) && children.length > 0) ||
      (!Array.isArray(children) && children !== undefined && children !== null) ||
      props.children === undefined
  ) {
    props.children = children;
  }

  return props;
}

function renderClientBoundary(node: any, context: RenderContext) {
  const props = node.props ?? {};
  const moduleId = String(props["data-adaptive-client-module"] ?? "");
  const mode = String(props["data-adaptive-client-mode"] ?? CLIENT_BOUNDARY_MODE_CLIENT);
  const exportName = String(props["data-adaptive-client-export"] ?? "default");
  const rawProps = String(props["data-adaptive-client-props"] ?? "{}");
  const hasChildren = props["data-adaptive-client-has-children"] === "true";

  let boundaryId = "";

  if (mode === CLIENT_BOUNDARY_MODE_HYDRATE) {
    const nextBoundaryId = context.hydrateBoundaryCounter?.value ?? 0;

    if (context.hydrateBoundaryCounter) {
      context.hydrateBoundaryCounter.value += 1;
    }

    boundaryId = `b${nextBoundaryId}`;
  }

  if (moduleId) {
    context.clientModuleIds?.add(moduleId);
  }

  const boundaryContext: RenderContext = {
    ...context,
    currentBoundaryId: boundaryId,
    hydrateAidCounter: mode === CLIENT_BOUNDARY_MODE_HYDRATE ? { value: 0 } : undefined,
    hydrateReactiveCounter: mode === CLIENT_BOUNDARY_MODE_HYDRATE ? { value: 0 } : undefined,
    hydrateManifest: mode === CLIENT_BOUNDARY_MODE_HYDRATE ? [] : undefined,
    hydrateInstructionCounters: mode === CLIENT_BOUNDARY_MODE_HYDRATE
        ? {
          event: 0,
          ref: 0,
          reactive: 0,
          dynamicProp: 0
        }
        : undefined
  };

  const boundaryChildren = getVNodeChildren(node);
  const innerHtml = renderNode(boundaryChildren, boundaryContext);

  const manifestInstructions = boundaryContext.hydrateManifest ?? [];
  const manifestHtml =
      mode === CLIENT_BOUNDARY_MODE_HYDRATE && manifestInstructions.length > 0
          ? renderHydrationManifest(boundaryId, manifestInstructions)
          : "";

  const payload = encodeCommentPayload({
    mode,
    moduleId,
    exportName,
    rawProps,
    hasChildren,
    boundaryId
  });

  return `<!--${CLIENT_BOUNDARY_START_PREFIX}${payload}-->${innerHtml}${manifestHtml}<!--${CLIENT_BOUNDARY_END}-->`;
}

function renderHydrateSlot(node: any, context: RenderContext) {
  const innerHtml = renderNode(getVNodeChildren(node), context);
  return `<!--${HYDRATE_SLOT_START}-->${innerHtml}<!--${HYDRATE_SLOT_END}-->`;
}

function escapeAttribute(value: string) {
  return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
}

function encodeCommentPayload(value: {
  mode: string;
  moduleId: string;
  exportName: string;
  rawProps: string;
  hasChildren: boolean;
  boundaryId: string;
}) {
  return encodeURIComponent(JSON.stringify(value));
}

function renderHydrationManifest(boundaryId: string, instructions: HydrationManifestInstruction[]) {
  const payload = escapeScriptJson(JSON.stringify({
    boundaryId,
    instructions
  }));

  return `<script type="application/json" ${HYDRATION_MANIFEST_ATTR}="true" ${HYDRATION_BOUNDARY_ID_ATTR}="${escapeAttribute(boundaryId)}">${payload}</script>`;
}

function escapeScriptJson(value: string) {
  return value.replace(/<\/script/gi, "<\\/script");
}

function appendHydrationManifestForProps(props: Record<string, any>, id: string, context: RenderContext) {
  if (!context.hydrateManifest) {
    return;
  }

  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on") && typeof value === "function") {
      context.hydrateManifest.push({
        key: nextHydrationInstructionKey(context, "event"),
        kind: "event",
        id,
        event: key.slice(2).toLowerCase()
      });
      continue;
    }

    if (key === "ref" && value != null) {
      context.hydrateManifest.push({
        key: nextHydrationInstructionKey(context, "ref"),
        kind: "ref",
        id
      });
      continue;
    }

    if (
        key !== "children" &&
        key !== "ref" &&
        typeof value === "function" &&
        isSupportedDynamicHydrationPropName(key)
    ) {
      context.hydrateManifest.push({
        key: nextHydrationInstructionKey(context, "dynamicProp"),
        kind: "dynamic-prop",
        id,
        prop: key
      });
    }
  }
}

function nextHydrationInstructionKey(
    context: RenderContext,
    kind: "event" | "ref" | "reactive" | "dynamicProp"
) {
  const counters = context.hydrateInstructionCounters;

  if (!counters) {
    return "";
  }

  const value = counters[kind];
  counters[kind] += 1;

  return resolveHydrationInstructionKey(kind, value);
}

function resolveHydrationInstructionKey(
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

function maybeAllocateHydrationId(props: Record<string, any>, context: RenderContext) {
  if (!context.hydrateAidCounter) {
    return null;
  }

  if (props["data-aid"] != null) {
    return String(props["data-aid"]);
  }

  const needsHydrationId = Object.entries(props).some(([key, value]) => {
    if (key === "children") {
      return false;
    }

    if (key === "ref") {
      return value != null;
    }

    if (key.startsWith("on")) {
      return typeof value === "function";
    }

    return typeof value === "function" && isSupportedDynamicHydrationPropName(key);
  });

  if (!needsHydrationId) {
    return null;
  }

  const localId = context.hydrateAidCounter.value;
  context.hydrateAidCounter.value += 1;

  return context.currentBoundaryId
      ? `${context.currentBoundaryId}:${localId}`
      : String(localId);
}

function resolveReactiveMarkerPair(value: any) {
  if (isPromiseLike(value)) {
    return {
      start: REACTIVE_ASYNC_START,
      end: REACTIVE_ASYNC_END
    };
  }

  if (Array.isArray(value)) {
    return isTextLikeCollection(value)
        ? {
          start: REACTIVE_CHILD_START,
          end: REACTIVE_CHILD_END
        }
        : {
          start: REACTIVE_LIST_START,
          end: REACTIVE_LIST_END
        };
  }

  if (isTextLikeValue(value)) {
    return {
      start: REACTIVE_CHILD_START,
      end: REACTIVE_CHILD_END
    };
  }

  return {
    start: REACTIVE_STRUCT_START,
    end: REACTIVE_STRUCT_END
  };
}

function resolveManifestReactiveKind(
    markerStart: string
): Extract<HydrationManifestInstruction, {
  kind: "reactive-range" | "reactive-struct" | "reactive-list" | "reactive-async";
}>["kind"] {
  if (markerStart === REACTIVE_CHILD_START) {
    return "reactive-range";
  }

  if (markerStart === REACTIVE_STRUCT_START) {
    return "reactive-struct";
  }

  if (markerStart === REACTIVE_LIST_START) {
    return "reactive-list";
  }

  return "reactive-async";
}

function resolveReactivePreviewForSSR(value: any) {
  if (isPromiseLike(value)) {
    return "";
  }

  return value;
}

function isPromiseLike(value: any): value is PromiseLike<any> {
  return value != null && typeof value === "object" && typeof value.then === "function";
}

function isTextLikeValue(value: any): boolean {
  return (
      value == null ||
      value === false ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
  );
}

function isTextLikeCollection(value: any[]): boolean {
  return value.every((item) => {
    if (Array.isArray(item)) {
      return isTextLikeCollection(item);
    }

    return isTextLikeValue(item);
  });
}
