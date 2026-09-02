/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */


import { resolveStyleEntries, serializeStyleLike, toCssPropertyName } from "./style-shared.js";
import {
  CLIENT_BOUNDARY_END,
  CLIENT_BOUNDARY_START_PREFIX,
  REACTIVE_CHILD_END,
  REACTIVE_CHILD_START,
  REACTIVE_STRUCT_END,
  REACTIVE_STRUCT_START,
  REACTIVE_LIST_END,
  REACTIVE_LIST_START,
  REACTIVE_ASYNC_END,
  REACTIVE_ASYNC_START,
  HYDRATE_SLOT_END,
  HYDRATE_SLOT_START,
} from "./client-boundary.js";
import {CONTEXT_PROVIDER_TAG} from "../front/context-runtime.js";
import {ReactiveSource, runWithContext, runWithEffectScope} from "../reactive/index.js";
import {cleanupEffectScope, createEffectScope, untrack} from "../reactive/index.js";
import {createReactiveEffect} from "../reactive/events.js";
import {getVNodeKey, mountKeyedReactiveFunction} from "./keyed-reactive-block.js";


const eventHandlers = new WeakMap<EventTarget, Map<string, EventListener>>();
const mismatchLog = new Set<string>();
const mismatchHistory: AdaptiveHydrationMismatch[] = [];

export type AdaptiveHydrationMismatch = {
  path: string;
  route: string;
  message: string;
  expected?: string;
  found?: string;
  htmlSnippet?: string;
  timestamp: number;
};

export type HydrateOptions = {
  recover?: boolean;
  removeMarkers?: boolean;
};

export type HydrationInstruction =
    | { kind: "event"; id: string; event: string; handler: EventListener }
    | { kind: "ref"; id: string; ref: any }
    | { kind: "reactive-range"; id: string; getter: () => any }
    | { kind: "reactive-struct"; id: string; render: () => any }
    | { kind: "reactive-list"; id: string; getter: () => any[] }
    | { kind: "reactive-async"; id: string; getter: () => Promise<any> | any }
    | { kind: "dynamic-prop"; id: string; prop: string; getter: () => any }
    | { kind: "layout-effect"; effect: () => void | (() => void); deps?: any[]; ignoredSources?: ReactiveSource[] }
    | { kind: "effect"; effect: () => void | (() => void); deps?: any[]; ignoredSources?: ReactiveSource[] };

const HYDRATION_ATTR = "data-aid";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
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

function resolveChildNamespace(tag: any, parentNamespace: string | null) {
  if (tag === "svg") {
    return SVG_NAMESPACE;
  }

  if (tag === "math") {
    return MATHML_NAMESPACE;
  }

  if (tag === "foreignObject") {
    return null;
  }

  return parentNamespace;
}

function shouldAssignAsProperty(element: Element, namespace: string | null, key: string) {
  if (namespace === SVG_NAMESPACE || namespace === MATHML_NAMESPACE) {
    return false;
  }

  return key in element;
}

function resolveDomAttributeName(key: string, namespace: string | null) {
  if (namespace === SVG_NAMESPACE || namespace === MATHML_NAMESPACE) {
    return SVG_ATTRIBUTE_NAME_MAP[key] ?? key;
  }

  return key === "className" ? "class" : key;
}

/**
 * Converts a vnode (plain object from jsx-runtime) into a real DOM Node.
 * Kept minimal: only handles the cases needed for client-mode mounting.
 * Does NOT support hydration, diffing, or reconciliation.
 */
export function renderToDOM(vnode: any, namespace: string | null = null): Node {
  if (vnode instanceof Node) return vnode;

  if (vnode == null || vnode === false || vnode === true) {
    return document.createComment("adaptive-empty");
  }

  if (typeof vnode === "string" || typeof vnode === "number") {
    return document.createTextNode(String(vnode));
  }

  if (Array.isArray(vnode)) {
    const fragment = document.createDocumentFragment();
    vnode.flat(Infinity).forEach((child) => {
      fragment.appendChild(renderToDOM(child, namespace));
    });
    return fragment;
  }

  if (typeof vnode === "function") {
    return mountKeyedReactiveFunction(vnode, namespace, renderToDOM);
/*    const start = document.createTextNode("");
    const end = document.createTextNode("");
    const fragment = document.createDocumentFragment();

    fragment.appendChild(start);
    fragment.appendChild(end);

    let currentScope: ReturnType<typeof createEffectScope> | null = null;

    createReactiveEffect(() => {
      const parent = start.parentNode;
      if (!parent) return;

      // Limpa efeitos associados ao conteúdo anterior (subtree entre os marcadores)
      if (currentScope) {
        cleanupEffectScope(currentScope);
        currentScope = null;
      }

      let current = start.nextSibling;

      while (current && current !== end) {
        const next = current.nextSibling;
        parent.removeChild(current);
        current = next;
      }

      // Cria um novo escopo para todos os efeitos gerados durante este render
      currentScope = createEffectScope("reactive-block");
      const rendered = runWithEffectScope(currentScope, () => renderToDOM(vnode(), namespace));

      parent.insertBefore(rendered, end);
    });

    return fragment;*/
  }

  if (vnode.tag === CONTEXT_PROVIDER_TAG) {
    return runWithContext(
        vnode.props.context.id,
        vnode.props.value,
        () => renderToDOM(vnode.children ?? [], namespace)
    );
  }

  if (vnode.tag === "Fragment") {
    const fragment = document.createDocumentFragment();
    (vnode.children ?? []).flat(Infinity).forEach((child: any) => {
      fragment.appendChild(renderToDOM(child, namespace));
    });
    return fragment;
  }

  if (typeof vnode.tag === "function") {
    return untrack(() =>
        renderToDOM(
            vnode.tag({
              ...(vnode.props ?? {}),
              children: vnode.children ?? []
            }),
            namespace
        )
    );
  }

  const nextNamespace = resolveChildNamespace(vnode.tag, namespace);
  const el = nextNamespace
      ? document.createElementNS(nextNamespace, vnode.tag)
      : document.createElement(vnode.tag);
  const props: Record<string, any> = vnode.props ?? {};

  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "client") continue;

    if (key === "ref") {
      if (typeof value === "function") {
        value(el);
      } else if (value && typeof value === "object") {
        (value as any).current = el;
      }
      continue;
    }

    if (key === "xmlns" && nextNamespace) {
      continue;
    }

    // className reativo
    if (key === "className") {
      if (typeof value === "function") {
        createReactiveEffect(() => {
          el.setAttribute("class", value() ?? "");
        });
      } else {
        el.setAttribute("class", value as string);
      }
      continue;
    }

    // eventos nunca são reativos
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      continue;
    }

    // style como função () => ({...}) ou objeto com valores reativos
    if (key === "style") {
      if (typeof value === "function") {
        // style={() => ({ transform: "..." })} — objeto inteiro reativo
        createReactiveEffect(() => {
          applyStyleObject(el as HTMLElement, value());
        });
      } else if (typeof value === "object" && value !== null) {
        // style={{ transform: $s`...`, color: () => x() }} — propriedades individuais reativas
        for (const [styleKey, styleValue] of Object.entries(value as Record<string, any>)) {
          if (typeof styleValue === "function") {
            createReactiveEffect(() => {
              const resolved = styleValue();
              const cssKey = styleKey.replace(/([A-Z])/g, "-$1").toLowerCase();
              if (resolved == null || resolved === false) {
                el.style.removeProperty(cssKey);
              } else {
                (el.style as any)[styleKey] = resolved;
              }
            });
          } else {
            if (styleValue != null && styleValue !== false) {
              (el.style as any)[styleKey] = styleValue;
            }
          }
        }
      }
      continue;
    }

    if (value === false || value == null) continue;

    // qualquer outro prop como função — reativo
    if (typeof value === "function") {
      createReactiveEffect(() => {
        const resolved = value();
        if (resolved === false || resolved == null) {
          el.removeAttribute(resolveDomAttributeName(key, nextNamespace));
          return;
        }
        if (shouldAssignAsProperty(el, nextNamespace, key)) {
          (el as any)[key] = resolved;
        } else {
          el.setAttribute(resolveDomAttributeName(key, nextNamespace), String(resolved));
        }
      },  "layout" );
      continue;
    }

    if (shouldAssignAsProperty(el, nextNamespace, key)) {
      (el as any)[key] = value;
    } else {
      el.setAttribute(resolveDomAttributeName(key, nextNamespace), String(value));
    }
  }

  (vnode.children ?? []).flat(Infinity).forEach((child: any) => {
    el.appendChild(renderToDOM(child, nextNamespace));
  });

  return el;
}

export function getHydrationMismatches(): AdaptiveHydrationMismatch[] {
  return [...mismatchHistory];
}

export function clearHydrationMismatches() {
  mismatchLog.clear();
  mismatchHistory.length = 0;
  if (typeof window !== "undefined") {
    window.__ADAPTIVE_HYDRATION_MISMATCHES__ = [];
  }
}

export function cleanupAdaptiveMarkersAfterSuccess(root: ParentNode): void {
  cleanupAdaptiveMarkersInNode(root, { boundaryRoot: root });
}

export function cleanupAdaptiveMarkersAfterSuccessBetweenMarkers(start: Comment, end: Comment): Node[] {
  const retainedNodes = collectSiblingNodesBetween(start, end).filter((node) => node.nodeType !== Node.COMMENT_NODE);

  retainedNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      cleanupAdaptiveMarkersInNode(node as ParentNode);
    }
  });

  let current: Node | null = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    if (isClientBoundaryStartComment(current)) {
      const boundaryEnd = findMatchingMarkerEnd(start.parentNode as Node, current as Comment, CLIENT_BOUNDARY_START_PREFIX, CLIENT_BOUNDARY_END);
      current = boundaryEnd ? boundaryEnd.nextSibling : next;
      continue;
    }
    if (isSafeToRemoveAdaptiveComment(current)) {
      current.remove();
    }
    current = next;
  }

  if (isAdaptiveBoundaryComment(start)) {
    start.remove();
  }
  if (isAdaptiveBoundaryComment(end)) {
    end.remove();
  }

  return retainedNodes.filter((node) => node.isConnected);
}

export function applyHydrationInstructions(root: ParentNode, instructions: HydrationInstruction[]): void {
  const ordered = groupHydrationInstructions(instructions);
  ordered.events.forEach((instruction) => {
    const element = findHydrationElement(root, instruction.id);
    if (!element) {
      warnHydrationInstructionMissing(root, instruction.kind, instruction.id);
      return;
    }
    debugHydrationLog("[hydrate:event:bind]", instruction.id, instruction.event, (element as HTMLElement).tagName);
    bindDelegatedEvent(
        element as HTMLElement,
        instruction.event,
        wrapHydrationEventHandler(instruction.id, instruction.event, instruction.handler)
    );
  });
  ordered.refs.forEach((instruction) => {
    const element = findHydrationElement(root, instruction.id);
    if (!element) {
      warnHydrationInstructionMissing(root, instruction.kind, instruction.id);
      return;
    }
    bindRef(instruction.ref, element as HTMLElement);
  });
  ordered.reactiveRanges.forEach((instruction) => {
    hydrateReactiveRangeInRoot(root, instruction);
  });
  ordered.reactiveStructs.forEach((instruction) => {
    hydrateReactiveStructInRoot(root, instruction);
  });
  ordered.reactiveLists.forEach((instruction) => {
    hydrateReactiveListInRoot(root, instruction);
  });
  ordered.reactiveAsyncs.forEach((instruction) => {
    hydrateReactiveAsyncInRoot(root, instruction);
  });
  ordered.dynamicProps.forEach((instruction) => {
    const element = findHydrationElement(root, instruction.id);
    if (!element) {
      warnHydrationInstructionMissing(root, instruction.kind, instruction.id);
      return;
    }
    hydrateDynamicProp(element as HTMLElement, instruction);
  });
  ordered.layoutEffects.forEach((instruction) => {
    runCollectedEffect(instruction, "layout");
  });
  ordered.effects.forEach((instruction) => {
    runCollectedEffect(instruction, "effect");
  });
}

export function applyHydrationInstructionsBetweenMarkers(
    start: Comment,
    end: Comment,
    instructions: HydrationInstruction[]
): void {



  const ordered = groupHydrationInstructions(instructions);
  ordered.events.forEach((instruction) => {
    const element = findHydrationElementBetweenMarkers(start, end, instruction.id);
    if (!element) {
      warnHydrationInstructionMissing(start.parentNode as ParentNode | null, instruction.kind, instruction.id);
      return;
    }
    debugHydrationLog("[hydrate:event:bind]", instruction.id, instruction.event, (element as HTMLElement).tagName);
    bindDelegatedEvent(
        element as HTMLElement,
        instruction.event,
        wrapHydrationEventHandler(instruction.id, instruction.event, instruction.handler)
    );
  });
  ordered.refs.forEach((instruction) => {
    const element = findHydrationElementBetweenMarkers(start, end, instruction.id);
    if (!element) {
      warnHydrationInstructionMissing(start.parentNode as ParentNode | null, instruction.kind, instruction.id);
      return;
    }
    bindRef(instruction.ref, element as HTMLElement);
  });
  ordered.reactiveRanges.forEach((instruction) => {
    hydrateReactiveRangeBetweenMarkers(start, end, instruction);
  });
  ordered.reactiveStructs.forEach((instruction) => {
    hydrateReactiveStructBetweenMarkers(start, end, instruction);
  });
  ordered.reactiveLists.forEach((instruction) => {
    hydrateReactiveListBetweenMarkers(start, end, instruction);
  });
  ordered.reactiveAsyncs.forEach((instruction) => {
    hydrateReactiveAsyncBetweenMarkers(start, end, instruction);
  });
  ordered.dynamicProps.forEach((instruction) => {
    const element = findHydrationElementBetweenMarkers(start, end, instruction.id);
    if (!element) {
      warnHydrationInstructionMissing(start.parentNode as ParentNode | null, instruction.kind, instruction.id);
      return;
    }
    hydrateDynamicProp(element as HTMLElement, instruction);
  });
  ordered.layoutEffects.forEach((instruction) => {
    runCollectedEffect(instruction, "layout");
  });
  ordered.effects.forEach((instruction) => {
    runCollectedEffect(instruction, "effect");
  });
}

function findHydrationElement(root: ParentNode, id: string): Element | null {
  if (root instanceof Element && root.getAttribute(HYDRATION_ATTR) === id) {
    return root;
  }

  return findHydrationElementInSubtree(root, id, root);
}

function findHydrationElementBetweenMarkers(start: Comment, end: Comment, id: string): Element | null {
  let current = start.nextSibling;
  while (current && current !== end) {
    if (isClientBoundaryStartComment(current)) {
      const boundaryEnd = findMatchingMarkerEnd(start.parentNode as Node, current as Comment, CLIENT_BOUNDARY_START_PREFIX, CLIENT_BOUNDARY_END);
      current = boundaryEnd ? boundaryEnd.nextSibling : end;
      continue;
    }
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      if (element.getAttribute(HYDRATION_ATTR) === id) {
        return element;
      }
      // Se este elemento for uma fronteira de outro módulo cliente, não entramos nele.
      if (element.hasAttribute("data-adaptive-client-module")) {
        current = current.nextSibling;
        continue;
      }
      const nested = findHydrationElementInSubtree(element, id, element);
      if (nested) {
        return nested;
      }
    }
    current = current.nextSibling;
  }
  return null;
}

function findHydrationElementInSubtree(root: ParentNode, id: string, boundaryRoot: ParentNode): Element | null {
  let current = root.firstChild;
  while (current) {
    if (isClientBoundaryStartComment(current)) {
      const boundaryEnd = findMatchingMarkerEnd(root as Node, current as Comment, CLIENT_BOUNDARY_START_PREFIX, CLIENT_BOUNDARY_END);
      current = boundaryEnd ? boundaryEnd.nextSibling : current.nextSibling;
      continue;
    }

    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      if (element.getAttribute(HYDRATION_ATTR) === id) {
        return element;
      }
      // Se este elemento é uma fronteira de outro módulo cliente, não entramos nele,
      // a menos que seja a própria raiz da nossa busca atual (o que findHydrationElement já trata).
      if (element.hasAttribute("data-adaptive-client-module") && element !== boundaryRoot) {
        current = current.nextSibling;
        continue;
      }
      const nested = findHydrationElementInSubtree(element, id, boundaryRoot);
      if (nested) {
        return nested;
      }
    }

    current = current.nextSibling;
  }

  return null;
}

function findReactiveMarkers(root: ParentNode, id: string) {
  const startMarker = `${REACTIVE_CHILD_START}:${id}`;
  const endMarker = `${REACTIVE_CHILD_END}:${id}`;
  return findMarkerPairInRoot(root, startMarker, endMarker);
}

function findMarkerPairInRoot(root: ParentNode, startMarker: string, endMarker: string) {
  let rangeStart: Comment | null = null;
  let rangeEnd: Comment | null = null;

  function search(node: ParentNode): boolean {
    let current = node.firstChild;
    while (current) {
      if (isClientBoundaryStartComment(current)) {
        const boundaryEnd = findMatchingMarkerEnd(node as Node, current as Comment, CLIENT_BOUNDARY_START_PREFIX, CLIENT_BOUNDARY_END);
        current = boundaryEnd ? boundaryEnd.nextSibling : current.nextSibling;
        continue;
      }

      if (current.nodeType === Node.COMMENT_NODE) {
        const data = (current as Comment).data;
        if (data === startMarker) {
          rangeStart = current as Comment;
        } else if (data === endMarker) {
          rangeEnd = current as Comment;
          if (rangeStart) return true;
        }
      } else if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as Element;
        // Não entramos em outros módulos clientes para procurar nossos marcadores reativos
        if (!element.hasAttribute("data-adaptive-client-module")) {
          if (search(element)) return true;
        }
      }
      current = current.nextSibling;
    }
    return false;
  }

  search(root);
  return { start: rangeStart, end: rangeEnd };
}

function findReactiveMarkersBetweenMarkers(start: Comment, end: Comment, id: string) {
  const startMarker = `${REACTIVE_CHILD_START}:${id}`;
  const endMarker = `${REACTIVE_CHILD_END}:${id}`;
  return findMarkerPairBetweenMarkers(start, end, startMarker, endMarker);
}

function findMarkerPairBetweenMarkers(start: Comment, end: Comment, startMarker: string, endMarker: string) {
  const parent = start.parentNode;
  if (!parent) {
    return { start: null as Comment | null, end: null as Comment | null };
  }

  // NOTE: A TreeWalker starting from a comment node (no DOM children) is broken:
  // the WHATWG traversal algorithm initialises result=FILTER_ACCEPT and, when the
  // current node has no children, immediately returns that node without advancing.
  // This means walker.currentNode = start + nextNode() returns `start` itself
  // (the boundary marker), never reaching reactive markers inside element children.
  // Use the same manual recursive approach as findHydrationElementBetweenMarkers.

  let rangeStart: Comment | null = null;
  let rangeEnd: Comment | null = null;

  function searchInElement(element: Element): boolean {
    let current: Node | null = element.firstChild;
    while (current) {
      if (isClientBoundaryStartComment(current)) {
        const boundaryEnd = findMatchingMarkerEnd(element, current as Comment, CLIENT_BOUNDARY_START_PREFIX, CLIENT_BOUNDARY_END);
        current = boundaryEnd ? boundaryEnd.nextSibling : null;
        continue;
      }
      if (current.nodeType === Node.ELEMENT_NODE) {
        const child = current as Element;
        // Se o filho for uma fronteira de módulo cliente, não entramos nele,
        // pois marcadores reativos dentro de outros módulos pertencem a esses módulos.
        if (!child.hasAttribute("data-adaptive-client-module")) {
          if (searchInElement(child)) return true;
        }
      } else if (current.nodeType === Node.COMMENT_NODE) {
        const data = (current as Comment).data;
        if (data === startMarker) {
          rangeStart = current as Comment;
        } else if (data === endMarker) {
          rangeEnd = current as Comment;
          if (rangeStart) return true;
        }
      }
      current = current.nextSibling;
    }
    return false;
  }

  let current: Node | null = start.nextSibling;
  while (current && current !== end) {
    if (isClientBoundaryStartComment(current)) {
      const boundaryEnd = findMatchingMarkerEnd(parent, current as Comment, CLIENT_BOUNDARY_START_PREFIX, CLIENT_BOUNDARY_END);
      current = boundaryEnd ? boundaryEnd.nextSibling : end;
      continue;
    }
    if (current.nodeType === Node.COMMENT_NODE) {
      const data = (current as Comment).data;
      if (data === startMarker) {
        rangeStart = current as Comment;
      } else if (data === endMarker) {
        rangeEnd = current as Comment;
        if (rangeStart) break;
      }
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      if (!element.hasAttribute("data-adaptive-client-module")) {
        if (searchInElement(element)) break;
      }
    }
    current = current.nextSibling;
  }

  return { start: rangeStart, end: rangeEnd };
}

function normalizeToNodes(value: any): Node[] {
  if (value == null || value === false) return [];
  if (Array.isArray(value)) {
    return value.flat(Infinity).flatMap((item) => normalizeToNodes(item));
  }
  if (value instanceof Node) return [value];
  if (typeof value === "function") {
    return normalizeToNodes(value());
  }
  if (typeof value === "object") {
    const rendered = renderToDOM(value);
    if (rendered instanceof DocumentFragment) {
      return Array.from(rendered.childNodes);
    }
    return [rendered];
  }
  return [document.createTextNode(String(value))];
}

function hydrateReactiveRangeInRoot(root: ParentNode, instruction: Extract<HydrationInstruction, { kind: "reactive-range" }>) {
  const markers = findReactiveMarkers(root, instruction.id);
  hydrateReactiveRangeWithMarkers(markers.start, markers.end, instruction);
}

function hydrateReactiveRangeBetweenMarkers(
    boundaryStart: Comment,
    boundaryEnd: Comment,
    instruction: Extract<HydrationInstruction, { kind: "reactive-range" }>
) {
  const markers = findReactiveMarkersBetweenMarkers(boundaryStart, boundaryEnd, instruction.id);
  hydrateReactiveRangeWithMarkers(markers.start, markers.end, instruction);
}

function hydrateReactiveStructInRoot(
    root: ParentNode,
    instruction: Extract<HydrationInstruction, { kind: "reactive-struct" }>
) {
  const markers = findReactiveStructMarkers(root, instruction.id);
  hydrateReactiveStructWithMarkers(markers.start, markers.end, instruction);
}

function hydrateReactiveStructBetweenMarkers(
    boundaryStart: Comment,
    boundaryEnd: Comment,
    instruction: Extract<HydrationInstruction, { kind: "reactive-struct" }>
) {
  const markers = findReactiveStructMarkersBetweenMarkers(boundaryStart, boundaryEnd, instruction.id);
  hydrateReactiveStructWithMarkers(markers.start, markers.end, instruction);
}

function hydrateReactiveListInRoot(
    root: ParentNode,
    instruction: Extract<HydrationInstruction, { kind: "reactive-list" }>
) {
  const markers = findReactiveListMarkers(root, instruction.id);
  hydrateReactiveListWithMarkers(markers.start, markers.end, instruction);
}

function hydrateReactiveListBetweenMarkers(
    boundaryStart: Comment,
    boundaryEnd: Comment,
    instruction: Extract<HydrationInstruction, { kind: "reactive-list" }>
) {
  const markers = findReactiveListMarkersBetweenMarkers(boundaryStart, boundaryEnd, instruction.id);
  hydrateReactiveListWithMarkers(markers.start, markers.end, instruction);
}

function hydrateReactiveAsyncInRoot(
    root: ParentNode,
    instruction: Extract<HydrationInstruction, { kind: "reactive-async" }>
) {
  const markers = findReactiveAsyncMarkers(root, instruction.id);
  hydrateReactiveAsyncWithMarkers(markers.start, markers.end, instruction);
}

function hydrateReactiveAsyncBetweenMarkers(
    boundaryStart: Comment,
    boundaryEnd: Comment,
    instruction: Extract<HydrationInstruction, { kind: "reactive-async" }>
) {
  const markers = findReactiveAsyncMarkersBetweenMarkers(boundaryStart, boundaryEnd, instruction.id);
  hydrateReactiveAsyncWithMarkers(markers.start, markers.end, instruction);
}

function hydrateReactiveRangeWithMarkers(
    start: Comment | null,
    end: Comment | null,
    instruction: Extract<HydrationInstruction, { kind: "reactive-range" }>
) {
  if (!start || !end) {
    warnMismatch({
      path: `hydrate.instruction.reactive-range.${instruction.id}`,
      message: "Reactive range markers were not found in existing DOM",
      expected: `<!--${REACTIVE_CHILD_START}:${instruction.id}-->...<!--${REACTIVE_CHILD_END}:${instruction.id}-->`,
      found: "nothing",
      node: start ?? end ?? undefined
    });
    return;
  }

  const textNode = ensureReactiveTextNodeBetweenMarkers(start, end);
  if (!textNode) {
    return;
  }

  const parent = start.parentNode;
  if (parent) {
    parent.removeChild(start);
    parent.removeChild(end);
  }
  createHydratedReactiveTextBinding(textNode, instruction);
}

function createHydratedReactiveTextBinding(
    textNode: Text,
    instruction: Extract<HydrationInstruction, { kind: "reactive-range" }>
) {
  debugHydrationLog("[hydrate:range:bind]", instruction.id, textNode.data);

  createReactiveEffect(() => {



    const nextText = normalizeReactiveTextValue(instruction.getter());
    debugHydrationLog("[hydrate:range:run]", instruction.id, nextText);
    if (textNode.data !== nextText) {
      warnMismatch({
        path: `hydrate.instruction.reactive-range.${instruction.id}`,
        message: "Reactive range SSR text does not match hydrated getter value",
        expected: nextText,
        found: textNode.data,
        node: textNode
      });
    }

    textNode.data = nextText;
  });
}

function ensureReactiveTextNodeBetweenMarkers(start: Comment, end: Comment): Text | null {
  const nodes = collectSiblingNodesBetween(start, end);
  if (nodes.length === 1 && nodes[0].nodeType === Node.TEXT_NODE) {
    return nodes[0] as Text;
  }

  const parent = start.parentNode;
  if (!parent) {
    return null;
  }

  const textNode = document.createTextNode(nodes.map((node) => node.textContent ?? "").join(""));
  parent.insertBefore(textNode, end);
  nodes.forEach((node) => parent.removeChild(node));
  return textNode;
}

function findReactiveStructMarkers(root: ParentNode, id: string) {
  return findMarkerPairInRoot(root, `${REACTIVE_STRUCT_START}:${id}`, `${REACTIVE_STRUCT_END}:${id}`);
}

function findReactiveStructMarkersBetweenMarkers(start: Comment, end: Comment, id: string) {
  return findMarkerPairBetweenMarkers(start, end, `${REACTIVE_STRUCT_START}:${id}`, `${REACTIVE_STRUCT_END}:${id}`);
}

function findReactiveListMarkers(root: ParentNode, id: string) {
  return findMarkerPairInRoot(root, `${REACTIVE_LIST_START}:${id}`, `${REACTIVE_LIST_END}:${id}`);
}

function findReactiveListMarkersBetweenMarkers(start: Comment, end: Comment, id: string) {
  return findMarkerPairBetweenMarkers(start, end, `${REACTIVE_LIST_START}:${id}`, `${REACTIVE_LIST_END}:${id}`);
}

function findReactiveAsyncMarkers(root: ParentNode, id: string) {
  return findMarkerPairInRoot(root, `${REACTIVE_ASYNC_START}:${id}`, `${REACTIVE_ASYNC_END}:${id}`);
}

function findReactiveAsyncMarkersBetweenMarkers(start: Comment, end: Comment, id: string) {
  return findMarkerPairBetweenMarkers(start, end, `${REACTIVE_ASYNC_START}:${id}`, `${REACTIVE_ASYNC_END}:${id}`);
}

function hydrateReactiveStructWithMarkers(
    start: Comment | null,
    end: Comment | null,
    instruction: Extract<HydrationInstruction, { kind: "reactive-struct" }>
) {
  hydrateReactiveContentWithMarkers(start, end, {
    id: instruction.id,
    kind: "reactive-struct",
    getter: instruction.render
  });
}

function hydrateReactiveListWithMarkers(
    start: Comment | null,
    end: Comment | null,
    instruction: Extract<HydrationInstruction, { kind: "reactive-list" }>
) {
  hydrateReactiveContentWithMarkers(start, end, {
    id: instruction.id,
    kind: "reactive-list",
    getter: instruction.getter
  });
}

function hydrateReactiveAsyncWithMarkers(
    start: Comment | null,
    end: Comment | null,
    instruction: Extract<HydrationInstruction, { kind: "reactive-async" }>
) {
  hydrateReactiveContentWithMarkers(start, end, {
    id: instruction.id,
    kind: "reactive-async",
    getter: instruction.getter
  });
}

function hydrateReactiveContentWithMarkers(
    start: Comment | null,
    end: Comment | null,
    config: {
      id: string;
      kind: "reactive-struct" | "reactive-list" | "reactive-async";
      getter: () => any;
    },
) {
  if (!start || !end) {
    warnMismatch({
      path: `hydrate.instruction.${config.kind}.${config.id}`,
      message: "Reactive content markers were not found in existing DOM",
      expected: `markers for ${config.kind}:${config.id}`,
      found: "nothing",
      node: start ?? end ?? undefined,
    });
    return;
  }

  const parent = start.parentNode;
  if (!parent) return;

  const startAnchor = document.createTextNode("");
  const endAnchor = document.createTextNode("");
  parent.replaceChild(startAnchor, start);
  parent.replaceChild(endAnchor, end);

  let initialized = false;
  let pendingToken = 0;
  let currentScope: ReturnType<typeof createEffectScope> | null = null;
  let currentKey: string | number | null | undefined = undefined;

  createReactiveEffect(() => {
    const nextValue = config.getter();
    const currentToken = ++pendingToken;
    const nextKey = getVNodeKey(nextValue);

    // ---------- 1ª execução (DOM do server) ----------
    if (!initialized) {
      initialized = true;
      currentKey = nextKey;

      if (isPromiseLike(nextValue)) {
        void nextValue.then((resolved) => {
          if (currentToken !== pendingToken) return;
          if (currentScope) {
            cleanupEffectScope(currentScope);
            currentScope = null;
          }
          currentScope = createEffectScope("hydrate-range");
          currentKey = getVNodeKey(resolved);
          replaceReactiveRangeContent(
              startAnchor,
              endAnchor,
              resolved,
              currentScope,
          );
        });
        return;
      }

      currentScope = createEffectScope("hydrate-range");
      if (config.kind === "reactive-list") {
        replaceReactiveRangeContent(
            startAnchor,
            endAnchor,
            nextValue,
            currentScope,
        );
      } else {
        runWithEffectScope(currentScope, () => {
          hydrateExistingReactiveContent(startAnchor, endAnchor, nextValue);
        });
      }
      return;
    }

    // ---------- updates ----------
    // mesma key → não remount (count 1→2→3)
    if (
        nextKey != null &&
        currentKey != null &&
        Object.is(nextKey, currentKey)
    ) {
      return;
    }

    if (isPromiseLike(nextValue)) {
      void nextValue.then((resolved) => {
        if (currentToken !== pendingToken) return;
        const resolvedKey = getVNodeKey(resolved);
        if (
            resolvedKey != null &&
            currentKey != null &&
            Object.is(resolvedKey, currentKey)
        ) {
          return;
        }
        if (currentScope) {
          cleanupEffectScope(currentScope);
          currentScope = null;
        }
        currentScope = createEffectScope("hydrate-range");
        currentKey = resolvedKey;
        replaceReactiveRangeContent(
            startAnchor,
            endAnchor,
            resolved,
            currentScope,
        );
      });
      return;
    }

    // key mudou → destroy de verdade (sem cache)
    if (currentScope) {
      cleanupEffectScope(currentScope);
      currentScope = null;
    }
    currentScope = createEffectScope("hydrate-range");
    currentKey = nextKey;
    replaceReactiveRangeContent(
        startAnchor,
        endAnchor,
        nextValue,
        currentScope,
    );
  });
}
/**
 * DOM-first in-place hydration for reactive-struct / list / async.
 *
 * AdaptiveJS não tem VDOM persistente. O vnode é efêmero: serve só para
 * extrair events, refs e getters reativos do render atual e ligá-los ao
 * DOM que o server já enviou. Depois o vnode é descartado.
 */
const HYDRATED_IN_PLACE = new WeakSet<Element>();

function hydrateExistingReactiveContent(start: Node, end: Node, value: any) {
  const cursor: DomCursor = {
    node: start.nextSibling,
    end,
    parent: start.parentNode
  };

  for (const vnode of normalizeVNodeList(value)) {
    hydrateVNodeAgainstDOM(vnode, cursor);
  }
}

type DomCursor = {
  node: Node | null;
  end: Node;
  parent: Node | null;
};

function normalizeVNodeList(value: any): any[] {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function") {
    try {
      return normalizeVNodeList(untrack(() => value()));
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeVNodeList(item));
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [{ __adaptive_text: String(value) }];
  }
  if (value && typeof value === "object" && "tag" in value) {
    return [value];
  }
  return [];
}

function advanceMeaningfulSibling(cursor: DomCursor): Node | null {
  let current = cursor.node;
  while (current && current !== cursor.end) {
    if (current.nodeType === Node.COMMENT_NODE) {
      current = current.nextSibling;
      continue;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if ((current.textContent ?? "").trim() === "") {
        current = current.nextSibling;
        continue;
      }
      cursor.node = current;
      return current;
    }
    if (current.nodeType === Node.ELEMENT_NODE) {
      cursor.node = current;
      return current;
    }
    current = current.nextSibling;
  }
  cursor.node = current;
  return null;
}

function advanceMeaningfulChild(from: Node | null, parent: Element): { node: Node | null; found: Node | null } {
  let current = from;
  while (current && current.parentNode === parent) {
    if (current.nodeType === Node.COMMENT_NODE) {
      current = current.nextSibling;
      continue;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if ((current.textContent ?? "").trim() === "") {
        current = current.nextSibling;
        continue;
      }
      return { node: current, found: current };
    }
    if (current.nodeType === Node.ELEMENT_NODE) {
      return { node: current, found: current };
    }
    current = current.nextSibling;
  }
  return { node: null, found: null };
}

function hydrateVNodeAgainstDOM(vnode: any, cursor: DomCursor) {
  if (vnode == null || vnode === false || vnode === true) return;

  if (vnode.__adaptive_text != null) {
    const dom = advanceMeaningfulSibling(cursor);
    if (dom && dom.nodeType === Node.TEXT_NODE) {
      cursor.node = dom.nextSibling;
    }
    return;
  }

  if (typeof vnode.tag === "function") {
    let resolved: any;
    try {
      resolved = untrack(() =>
          vnode.tag({
            ...(vnode.props ?? {}),
            children: vnode.children ?? []
          })
      );
    } catch (err) {
      console.error("[inplace]  resolve failed", err);
      return;
    }
    for (const child of normalizeVNodeList(resolved)) {
      hydrateVNodeAgainstDOM(child, cursor);
    }
    return;
  }

  if (vnode.tag === "Fragment") {
    for (const child of normalizeVNodeList(vnode.children ?? [])) {
      hydrateVNodeAgainstDOM(child, cursor);
    }
    return;
  }

  if (vnode.tag === CONTEXT_PROVIDER_TAG) {
    runWithContext(vnode.props.context.id, vnode.props.value, () => {
      for (const child of normalizeVNodeList(vnode.children ?? [])) {
        hydrateVNodeAgainstDOM(child, cursor);
      }
    });
    return;
  }

  const dom = advanceMeaningfulSibling(cursor);
  if (!dom || dom.nodeType !== Node.ELEMENT_NODE) {
    warnMismatch({
      path: "hydrate.inplace.element",
      message: "SSR DOM element not found for vnode during in-place hydration",
      expected: String(vnode.tag ?? "?"),
      found: dom ? describeHydrationNode(dom) : "null",
      node: dom ?? undefined
    });
    return;
  }

  const el = dom as Element;
  const expectedTag = String(vnode.tag).toLowerCase();
  const actualTag = el.tagName.toLowerCase();
  if (expectedTag !== actualTag) {
    warnMismatch({
      path: "hydrate.inplace.tag",
      message: "Tag mismatch during in-place hydration of reactive content",
      expected: expectedTag,
      found: actualTag,
      node: el
    });
  }

  cursor.node = el.nextSibling;

  if (!HYDRATED_IN_PLACE.has(el)) {
    HYDRATED_IN_PLACE.add(el);
    bindHostPropsInPlace(el as HTMLElement, vnode.props ?? {});
  }

  const childCursor = { node: el.firstChild as Node | null };
  for (const child of normalizeVNodeList(vnode.children ?? [])) {
    hydrateVNodeAgainstDOMInside(child, el, childCursor);
  }
}

function hydrateVNodeAgainstDOMInside(
    vnode: any,
    parentEl: Element,
    cursor: { node: Node | null }
) {
  if (vnode == null || vnode === false || vnode === true) return;

  if (vnode.__adaptive_text != null) {
    const { found } = advanceMeaningfulChild(cursor.node, parentEl);
    if (found && found.nodeType === Node.TEXT_NODE) {
      cursor.node = found.nextSibling;
    }
    return;
  }

  if (typeof vnode.tag === "function") {
    let resolved: any;
    try {
      resolved = untrack(() =>
          vnode.tag({
            ...(vnode.props ?? {}),
            children: vnode.children ?? []
          })
      );
    } catch {
      return;
    }
    for (const child of normalizeVNodeList(resolved)) {
      hydrateVNodeAgainstDOMInside(child, parentEl, cursor);
    }
    return;
  }

  if (vnode.tag === "Fragment") {
    for (const child of normalizeVNodeList(vnode.children ?? [])) {
      hydrateVNodeAgainstDOMInside(child, parentEl, cursor);
    }
    return;
  }

  if (vnode.tag === CONTEXT_PROVIDER_TAG) {
    runWithContext(vnode.props.context.id, vnode.props.value, () => {
      for (const child of normalizeVNodeList(vnode.children ?? [])) {
        hydrateVNodeAgainstDOMInside(child, parentEl, cursor);
      }
    });
    return;
  }

  const { found } = advanceMeaningfulChild(cursor.node, parentEl);
  if (!found || found.nodeType !== Node.ELEMENT_NODE) {
    warnMismatch({
      path: "hydrate.inplace.child",
      message: "SSR child element not found during in-place hydration",
      expected: String(vnode.tag ?? "?"),
      found: found ? describeHydrationNode(found) : "null",
      node: parentEl
    });
    return;
  }

  const el = found as Element;
  cursor.node = el.nextSibling;

  if (!HYDRATED_IN_PLACE.has(el)) {
    HYDRATED_IN_PLACE.add(el);
    bindHostPropsInPlace(el as HTMLElement, vnode.props ?? {});
  }

  const nested = { node: el.firstChild as Node | null };
  for (const child of normalizeVNodeList(vnode.children ?? [])) {
    hydrateVNodeAgainstDOMInside(child, el, nested);
  }
}

/**
 * Liga behavior no host já existente. Vnode props são lidas e descartadas.
 */
function bindHostPropsInPlace(el: HTMLElement, props: Record<string, any>) {
  const namespace = el.namespaceURI;

  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "client") continue;

    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      bindDelegatedEvent(el, eventName, value as EventListener);
      continue;
    }

    if (key === "ref" && value != null) {
      bindRef(value, el);
      continue;
    }

    if (key === "className") {
      if (typeof value === "function") {
        createReactiveEffect(() => {
          el.setAttribute("class", value() ?? "");
        });
      }
      continue;
    }

    if (key === "style") {
      if (typeof value === "function") {
        createReactiveEffect(() => {
          applyStyleObject(el, value());
        });
      } else if (typeof value === "object" && value !== null) {
        for (const [styleKey, styleValue] of Object.entries(value as Record<string, any>)) {
          if (typeof styleValue === "function") {
            createReactiveEffect(() => {
              const resolved = styleValue();
              const cssKey = styleKey.replace(/([A-Z])/g, "-$1").toLowerCase();
              if (resolved == null || resolved === false) {
                el.style.removeProperty(cssKey);
              } else {
                (el.style as any)[styleKey] = resolved;
              }
            }, "layout");
          }
        }
      }
      continue;
    }

    // prop dinâmica reativa (disabled, value, aria-*, ...)
    if (typeof value === "function") {
      createReactiveEffect(() => {
        const resolved = value();
        if (resolved === false || resolved == null) {
          el.removeAttribute(resolveDomAttributeName(key, namespace));
          return;
        }
        if (shouldAssignAsProperty(el, namespace, key)) {
          (el as any)[key] = resolved;
        } else {
          el.setAttribute(resolveDomAttributeName(key, namespace), String(resolved));
        }
      }, "layout");
    }
  }
}

function describeHydrationNode(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return (node as Element).tagName.toLowerCase();
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return `#text(${(node.textContent ?? "").slice(0, 24)})`;
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return "#comment";
  }
  return `nodeType:${node.nodeType}`;
}

function replaceReactiveRangeContent(
    start: Node,
    end: Node,
    value: any,
    scope?: ReturnType<typeof createEffectScope>
) {
  const parent = start.parentNode;
  if (!parent) return;

  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    parent.removeChild(current);
    current = next;
  }

  const insert = () => {
    const nextNodes = normalizeToNodes(value);
    nextNodes.forEach((node) => parent.insertBefore(node, end));
  };

  if (scope) {
    runWithEffectScope(scope, insert);
  } else {
    insert();
  }
}

function normalizeReactiveTextValue(value: any): string {
  if (value == null || value === false) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item): string => normalizeReactiveTextValue(item)).join("");
  }
  return String(value);
}

function isPromiseLike(value: any): value is PromiseLike<any> {
  return value != null && typeof value === "object" && typeof value.then === "function";
}

function isAdaptiveCommentNode(node: Node | null | undefined): node is Comment {
  return Boolean(
      node &&
      node.nodeType === Node.COMMENT_NODE &&
      ((node as Comment).data ?? "").startsWith("adaptive-")
  );
}

function isSafeToRemoveAdaptiveComment(node: Node | null | undefined): node is Comment {
  if (!isAdaptiveCommentNode(node)) {
    return false;
  }

  const data = (node as Comment).data;
  return isTextReactiveMarker(data) || isHydrateSlotMarker(data);
}

function cleanupAdaptiveMarkersInNode(
    root: ParentNode,
    options: {
      boundaryRoot?: ParentNode;
    } = {}
) {
  let current = root.firstChild;

  while (current) {
    const next = current.nextSibling;

    if (isClientBoundaryStartComment(current)) {
      const boundaryEnd = findMatchingMarkerEnd(root as Node, current as Comment, CLIENT_BOUNDARY_START_PREFIX, CLIENT_BOUNDARY_END);
      current = boundaryEnd ? boundaryEnd.nextSibling : next;
      continue;
    }

    if (isSafeToRemoveAdaptiveComment(current)) {
      current.remove();
      current = next;
      continue;
    }

    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      if (element.hasAttribute("data-adaptive-client-module") && element !== options.boundaryRoot) {
        current = next;
        continue;
      }
      cleanupAdaptiveMarkersInNode(element as unknown as ParentNode, options);
    }

    current = next;
  }
}


function isAdaptiveBoundaryComment(node: Node | null | undefined): node is Comment {
  if (!isAdaptiveCommentNode(node)) {
    return false;
  }

  const data = (node as Comment).data;
  return data.startsWith("adaptive-client-start:") || data === "adaptive-client-end";
}

function isTextReactiveMarker(data: string) {
  return data === REACTIVE_CHILD_START ||
      data.startsWith(`${REACTIVE_CHILD_START}:`) ||
      data === REACTIVE_CHILD_END ||
      data.startsWith(`${REACTIVE_CHILD_END}:`);
}

function isHydrateSlotMarker(data: string) {
  return data === HYDRATE_SLOT_START || data === HYDRATE_SLOT_END;
}



function applyStyleObject(element: HTMLElement, style: Record<string, any>) {
  for (const [styleKey, styleValue] of Object.entries(style)) {
    const cssKey = toCssPropertyName(styleKey);

    if (typeof styleValue === "function") {
      // createReactiveEffect com deps:[] faz tracking automático —
      // re-executa sempre que qualquer sinal lido dentro mudar
      createReactiveEffect(() => {
        const resolved = styleValue();
        if (resolved == null || resolved === false) {
          element.style.removeProperty(cssKey);
        } else {
          (element.style as any)[styleKey] = resolved;
        }
      }, "layout" );
    } else {
      if (styleValue == null || styleValue === false) {
        element.style.removeProperty(cssKey);
      } else {
        (element.style as any)[styleKey] = styleValue;
      }
    }
  }

  const nextKeys = new Set(resolveStyleEntries(style).map(([styleKey]) => toCssPropertyName(styleKey)));
  for (let index = element.style.length - 1; index >= 0; index -= 1) {
    const existingKey = element.style.item(index);
    if (!nextKeys.has(existingKey)) {
      element.style.removeProperty(existingKey);
    }
  }
}

function normalizeInlineStyle(value: string | null) {
  return (value ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .sort()
      .join(";");
}

function hydrateDynamicProp(
    el: HTMLElement,
    instruction: Extract<HydrationInstruction, { kind: "dynamic-prop" }>
) {
  // Cria o efeito puro para rodar fora de escopos orfãos de hooks
  createReactiveEffect(() => {
    // 1. Lemos o getter() oficial que tu especificaste
    let rawValue = instruction.getter();

    // 2. Desembrulho recursivo: extrai o valor real computado pelo teu $s`...`
    while (typeof rawValue === "function") {
      rawValue = rawValue();
    }

    const value = rawValue;
    const name = instruction.prop; // 3. Mapeia para o teu campo 'prop'

    // 4. Aplicação cirúrgica baseada nas chaves resolvidas
    if (name === "style") {
      if (typeof value === "object" && value !== null) {
        applyStyleObject(el, value);
      } else if (typeof value === "string") {
        // Se o teu $s devolver a string de transformação, injeta direto via cssText
        el.style.cssText = value;
      }
    }
    else if (name === "className" || name === "class") {
      el.className = String(value ?? "");
    }
    else if (name in el && !(el instanceof SVGElement)) {
      (el as any)[name] = value;
    }
    else {
      if (value == null || value === false) {
        el.removeAttribute(name);
      } else {
        el.setAttribute(name, String(value));
      }
    }
  }, "layout"); // Fase de layout evita qualquer flickering visual na tela
}

function runCollectedEffect(
    instruction: Extract<HydrationInstruction, { kind: "layout-effect" | "effect" }>,
    phase: "layout" | "effect"
) {
  let previousDeps = instruction.deps ? [...instruction.deps] : null;

  // O ignore por source precisa bloquear apenas re-disparos vindos
  // das sources informadas. O effect continua reativo para os
  // demais sinais lidos durante sua execucao.
  const dispose = createReactiveEffect(() => {
    if (instruction.deps && previousDeps) {
      const hasChanged = instruction.deps.some((dep, i) => dep !== previousDeps![i]);
      if (!hasChanged) return;
      previousDeps = [...instruction.deps];
    }

    return instruction.effect();
  }, phase, {
    ignore: instruction.ignoredSources?.map((source) => ({ __adaptiveSource: source }))
  });

  return dispose;
}
function setProp(
    element: HTMLElement,
    key: string,
    value: any,
    options: { hydrating: boolean; path: string }
) {
  const namespace = element.namespaceURI;
  const attrName = resolveDomAttributeName(key, namespace);

  if (key === "className") {
    element.setAttribute("class", value ?? "");
    return;
  }
  if (key === "style") {
    if (typeof value === "function") {
      createReactiveEffect(() => {
        applyStyleObject(element, value());
      });
    } else if (typeof value === "object" && value !== null) {
      applyStyleObject(element, value as Record<string, any>);
    }
    return;
  }
  if (key === "dataset" && typeof value === "object" && value !== null) {
    Object.assign(element.dataset, value);
    return;
  }
  if (value === undefined || value === null || value === false) {
    element.removeAttribute(attrName);
    return;
  }
  if (options.hydrating && shouldPreserveRuntimeProp(element, key, value)) {
    return;
  }
  if (shouldAssignAsProperty(element, namespace, key)) {
    applyPropertyValue(element, key, value, options);
  } else {
    element.setAttribute(attrName, String(value));
  }
}

function bindRef(ref: any, element: HTMLElement) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(element);
    return;
  }
  if (typeof ref === "object") {
    ref.current = element;
  }
}

export function collectSiblingNodesBetween(start: Comment, end: Comment) {
  const nodes: Node[] = [];
  let current = start.nextSibling;

  while (current && current !== end) {
    nodes.push(current);
    current = current.nextSibling;
  }

  return nodes;
}

function isClientBoundaryStartComment(node: Node | null | undefined): node is Comment {
  return Boolean(
      node &&
      node.nodeType === Node.COMMENT_NODE &&
      (((node as Comment).data ?? "").startsWith(CLIENT_BOUNDARY_START_PREFIX))
  );
}

export function findMatchingMarkerEnd(parent: Node, start: Comment, startMarker: string, endMarker: string) {
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

function shouldPreserveRuntimeProp(element: HTMLElement, key: string, nextValue: any) {
  if (key === "value" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return element === document.activeElement && element.value !== String(nextValue ?? "");
  }

  if (key === "checked" && element instanceof HTMLInputElement) {
    return element === document.activeElement && element.checked !== Boolean(nextValue);
  }

  if ((key === "scrollTop" || key === "scrollLeft") && element[key as "scrollTop" | "scrollLeft"] !== 0) {
    return true;
  }

  if (element instanceof HTMLMediaElement && ["currentTime", "volume", "playbackRate"].includes(key)) {
    return true;
  }

  return false;
}

function bindDelegatedEvent(element: HTMLElement, eventName: string, handler: EventListener) {
  let handlers = eventHandlers.get(element);
  if (!handlers) {
    handlers = new Map<string, EventListener>();
    eventHandlers.set(element, handlers);
  }
  const previous = handlers.get(eventName);
  if (previous) {
    element.removeEventListener(eventName, previous);
  }

  handlers.set(eventName, handler);
  element.addEventListener(eventName, handler);
}

function wrapHydrationEventHandler(id: string, eventName: string, handler: EventListener): EventListener {
  return function hydratedEventHandler(this: EventTarget, event: Event) {
    debugHydrationLog("[hydrate:event:fired]", id, eventName);

    return handler.call(this, event);
  };
}

function warnMismatch(details: {
  path: string;
  message: string;
  expected?: string;
  found?: string;
  node?: Node;
}) {
  const { path, message, expected, found, node } = details;
  const key = `${path}:${message}`;
  if (mismatchLog.has(key)) return;
  mismatchLog.add(key);

  const entry: AdaptiveHydrationMismatch = {
    path,
    route: readHydrationRoute(),
    message,
    expected,
    found,
    htmlSnippet: captureNodeSnippet(node),
    timestamp: Date.now()
  };

  mismatchHistory.push(entry);
  if (typeof window !== "undefined") {
    window.__ADAPTIVE_HYDRATION_MISMATCHES__ ??= [];
    window.__ADAPTIVE_HYDRATION_MISMATCHES__.push(entry);
  }
  if (isHydrationDebugEnabled()) {
    console.warn("[Adaptive hydration mismatch]", entry);
  }
}

function warnHydrationInstructionMissing(root: ParentNode | null, kind: string, id: string) {
  warnMismatch({
    path: `hydrate.instruction.${kind}.${id}`,
    message: "Hydration instruction target was not found in existing DOM",
    expected: `[${HYDRATION_ATTR}="${id}"]`,
    found: "nothing",
    node: root instanceof Node ? root : undefined
  });
}

function isHydrationDebugEnabled() {
  if (typeof window !== "undefined" && (window as any).__ADAPTIVE_DEBUG_HYDRATION__ === true) {
    return true;
  }

  return (globalThis as any)?.process?.env?.ADAPTIVE_PUBLIC_DEBUG_HYDRATION === "true";
}

function debugHydrationLog(...args: any[]) {
  if (!isHydrationDebugEnabled()) {
    return;
  }

  console.log(...args);
}

function applyPropertyValue(
    element: HTMLElement,
    key: string,
    value: any,
    options: { hydrating: boolean; path: string }
) {
  const preserveSelection =
      options.hydrating &&
      key === "value" &&
      (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
      document.activeElement === element;

  const selection = preserveSelection ? captureSelection(element as HTMLInputElement | HTMLTextAreaElement) : null;
  (element as any)[key] = value;

  if (selection) {
    restoreSelection(element as HTMLInputElement | HTMLTextAreaElement, selection);
  }
}

function captureSelection(element: HTMLInputElement | HTMLTextAreaElement) {
  return {
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection as "forward" | "backward" | "none" | null
  };
}

function restoreSelection(
    element: HTMLInputElement | HTMLTextAreaElement,
    selection: {
      start: number | null;
      end: number | null;
      direction: "forward" | "backward" | "none" | null;
    }
) {
  if (selection.start == null || selection.end == null) return;
  try {
    element.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
  } catch {
    // Ignore unsupported input types.
  }
}

function readHydrationRoute() {
  if (typeof window === "undefined") {
    return "server";
  }

  return window.__ROUTE__ ?? window.location.pathname;
}

function captureNodeSnippet(node: Node | undefined) {
  if (!node) return undefined;
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return `<!--${node.textContent ?? ""}-->`;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return (node as Element).outerHTML.slice(0, 200);
  }
  return undefined;
}

function groupHydrationInstructions(instructions: HydrationInstruction[]) {
  const grouped = {
    events: [] as Array<Extract<HydrationInstruction, { kind: "event" }>>,
    refs: [] as Array<Extract<HydrationInstruction, { kind: "ref" }>>,
    reactiveRanges: [] as Array<Extract<HydrationInstruction, { kind: "reactive-range" }>>,
    reactiveStructs: [] as Array<Extract<HydrationInstruction, { kind: "reactive-struct" }>>,
    reactiveLists: [] as Array<Extract<HydrationInstruction, { kind: "reactive-list" }>>,
    reactiveAsyncs: [] as Array<Extract<HydrationInstruction, { kind: "reactive-async" }>>,
    dynamicProps: [] as Array<Extract<HydrationInstruction, { kind: "dynamic-prop" }>>,
    layoutEffects: [] as Array<Extract<HydrationInstruction, { kind: "layout-effect" }>>,
    effects: [] as Array<Extract<HydrationInstruction, { kind: "effect" }>>
  };

  for (const instruction of instructions) {
    switch (instruction.kind) {
      case "event":
        grouped.events.push(instruction);
        break;
      case "ref":
        grouped.refs.push(instruction);
        break;
      case "reactive-range":
        grouped.reactiveRanges.push(instruction);
        break;
      case "reactive-struct":
        grouped.reactiveStructs.push(instruction);
        break;
      case "reactive-list":
        grouped.reactiveLists.push(instruction);
        break;
      case "reactive-async":
        grouped.reactiveAsyncs.push(instruction);
        break;
      case "dynamic-prop":
        grouped.dynamicProps.push(instruction);
        break;
      case "layout-effect":
        grouped.layoutEffects.push(instruction);
        break;
      case "effect":
        grouped.effects.push(instruction);
        break;
    }
  }

  return grouped;
}