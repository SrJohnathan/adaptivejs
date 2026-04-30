import { useEffect, useEffectWithDeps, useLayoutEffect } from "./state.js";
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
  isHydrateSlotTag
} from "./client-boundary.js";

const eventHandlers = new WeakMap<EventTarget, Map<string, EventListener>>();
const delegatedEvents = new Set<string>();
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
  | { kind: "layout-effect"; effect: () => void | (() => void); deps?: any[] }
  | { kind: "effect"; effect: () => void | (() => void); deps?: any[] };

const HYDRATION_ATTR = "data-aid";

const DEFAULT_HYDRATE_OPTIONS: Required<HydrateOptions> = {
  recover: false,
  removeMarkers: false
};

export function hydrateLegacyVDOM(root: HTMLElement, renderFn: () => any, options: HydrateOptions = {}): void {
  const resolvedOptions = resolveHydrateOptions(options);
  hydrateChildren(root, normalizeChildren(renderFn()), "root", resolvedOptions);
}

export function hydrateLegacyVDOMBetweenMarkers(
  start: Comment,
  end: Comment,
  renderFn: () => any,
  options: HydrateOptions = {}
): Node[] {
  const parent = start.parentNode;
  if (!parent) {
    return [];
  }
  const resolvedOptions = resolveHydrateOptions(options);
  hydrateChildrenBetween(parent, start, end, normalizeChildren(renderFn()), "root", resolvedOptions);
  const nodes = collectSiblingNodesBetween(start, end);
  if (resolvedOptions.removeMarkers) {
    start.remove();
    end.remove();
  }
  return nodes;
}

export function hydrate(root: HTMLElement, renderFn: () => any, options: HydrateOptions = {}): void {
  hydrateLegacyVDOM(root, renderFn, options);
}

export function hydrateBetweenMarkers(
  start: Comment,
  end: Comment,
  renderFn: () => any,
  options: HydrateOptions = {}
): Node[] {
  return hydrateLegacyVDOMBetweenMarkers(start, end, renderFn, options);
}

export function mount(root: HTMLElement, renderFn: () => any): void {
  root.replaceChildren(renderToDOM(renderFn()));
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

export function renderToDOM(vNode: any): Node {
  if (vNode instanceof Node) {
    return vNode;
  }
  if (typeof vNode === "function") {
    return createReactiveRange(vNode);
  }
  if (typeof vNode === "string" || typeof vNode === "number") {
    return document.createTextNode(String(vNode));
  }
  if (vNode == null || typeof vNode === "boolean") {
    return document.createComment("adaptive-empty");
  }
  if (Array.isArray(vNode)) {
    const fragment = document.createDocumentFragment();
    vNode.forEach((child) => fragment.appendChild(renderToDOM(child)));
    return fragment;
  }
  if (vNode.tag === "Fragment") {
    const fragment = document.createDocumentFragment();
    appendChildren(fragment, vNode.children ?? []);
    return fragment;
  }
  if (isHydrateSlotTag(vNode.tag)) {
    const fragment = document.createDocumentFragment();
    if (vNode.props?.hydrate === true) {
      return fragment;
    }
    fragment.appendChild(document.createComment(HYDRATE_SLOT_START));
    appendChildren(fragment, vNode.children ?? []);
    fragment.appendChild(document.createComment(HYDRATE_SLOT_END));
    return fragment;
  }
  if (typeof vNode.tag === "function") {
    return renderToDOM(vNode.tag(resolveComponentProps(vNode)));
  }

  const element = document.createElement(vNode.tag);
  applyProps(element, vNode.props ?? {}, { hydrating: false, path: vNode.tag });
  appendChildren(element, vNode.children ?? []);
  return element;
}

function createReactiveRange(getter: () => any): Node {
  const start = document.createComment("adaptive-start");
  const end = document.createComment("adaptive-end");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(start);
  fragment.appendChild(end);
  let currentNodes: Node[] = [];

  const updateRange = () => {
    const parent = start.parentNode;
    if (!parent) return;
    for (const node of currentNodes) {
      if (node.parentNode === parent) {
        parent.removeChild(node);
      }
    }
    currentNodes = normalizeToNodes(getter());
    currentNodes.forEach((node) => parent.insertBefore(node, end));
  };

  queueMicrotask(updateRange);
  useLayoutEffect(updateRange);

  return fragment;
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
      if (isNestedClientBoundaryElement(element)) {
        current = current.nextSibling;
        continue;
      }
      if (element.getAttribute(HYDRATION_ATTR) === id) {
        return element;
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
      if (isNestedClientBoundaryElement(element, boundaryRoot)) {
        current = current.nextSibling;
        continue;
      }
      if (element.getAttribute(HYDRATION_ATTR) === id) {
        return element;
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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let start: Comment | null = null;
  let end: Comment | null = null;

  let current = walker.nextNode();
  while (current) {
    const comment = current as Comment;
    if (comment.data === startMarker) {
      start = comment;
    } else if (comment.data === endMarker) {
      end = comment;
      if (start) {
        break;
      }
    }
    current = walker.nextNode();
  }

  return { start, end };
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
  const node = renderToDOM(value);
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return Array.from(node.childNodes);
  }
  return [node];
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


  useLayoutEffect(() => {
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
  }
) {
  if (!start || !end) {
    warnMismatch({
      path: `hydrate.instruction.${config.kind}.${config.id}`,
      message: "Reactive content markers were not found in existing DOM",
      expected: `markers for ${config.kind}:${config.id}`,
      found: "nothing",
      node: start ?? end ?? undefined
    });
    return;
  }

  const parent = start.parentNode;
  if (!parent) {
    return;
  }

  const startAnchor = document.createTextNode("");
  const endAnchor = document.createTextNode("");
  parent.replaceChild(startAnchor, start);
  parent.replaceChild(endAnchor, end);

  let initialized = false;
  let pendingToken = 0;

  useLayoutEffect(() => {
    const nextValue = config.getter();
    const currentToken = ++pendingToken;

    if (!initialized) {
      initialized = true;
      if (isPromiseLike(nextValue)) {
        void nextValue.then((resolved) => {
          if (currentToken !== pendingToken) return;
          replaceReactiveRangeContent(startAnchor, endAnchor, resolved);
        });
      }
      return;
    }

    if (isPromiseLike(nextValue)) {
      void nextValue.then((resolved) => {
        if (currentToken !== pendingToken) return;
        replaceReactiveRangeContent(startAnchor, endAnchor, resolved);
      });
      return;
    }

    replaceReactiveRangeContent(startAnchor, endAnchor, nextValue);
  });
}

function replaceReactiveRangeContent(start: Node, end: Node, value: any) {
  const parent = start.parentNode;
  if (!parent) return;

  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    parent.removeChild(current);
    current = next;
  }

  const nextNodes = normalizeToNodes(value);
  nextNodes.forEach((node) => parent.insertBefore(node, end));
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

    if (isNestedClientBoundaryElement(current, options.boundaryRoot)) {
      current = next;
      continue;
    }

    if (isSafeToRemoveAdaptiveComment(current)) {
      current.remove();
      current = next;
      continue;
    }

    if (current.nodeType === Node.ELEMENT_NODE) {
      cleanupAdaptiveMarkersInNode(current as unknown as ParentNode, options);
    }

    current = next;
  }
}

function isNestedClientBoundaryElement(
  node: Node | null | undefined,
  boundaryRoot?: ParentNode
): boolean {
  return Boolean(
    node &&
    node.nodeType === Node.ELEMENT_NODE &&
    node !== boundaryRoot &&
    (node as Element).hasAttribute("data-adaptive-client-module")
  );
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

function matchesCurrentHydratedProp(element: HTMLElement, key: string, nextValue: any) {
  if (key === "className" || key === "class") {
    return element.getAttribute("class") === String(nextValue ?? "");
  }
  if (key === "style" && typeof nextValue === "object" && nextValue !== null) {
    const expected = serializeStyleLike(nextValue);
    return normalizeInlineStyle(element.getAttribute("style")) === normalizeInlineStyle(expected);
  }
  if (key === "dataset" && typeof nextValue === "object" && nextValue !== null) {
    return Object.entries(nextValue).every(([entryKey, entryValue]) => element.dataset[entryKey] === String(entryValue ?? ""));
  }
  if (key === "value" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return element.value === String(nextValue ?? "");
  }
  if (key === "checked" && element instanceof HTMLInputElement) {
    return element.checked === Boolean(nextValue);
  }
  if (key === "disabled" || key === "hidden") {
    return element.hasAttribute(key) === Boolean(nextValue);
  }
  if (key === "title" || key === "id") {
    return element.getAttribute(key) === String(nextValue ?? "");
  }
  if (key in element) {
    return String((element as any)[key] ?? "") === String(nextValue ?? "");
  }
  return element.getAttribute(key) === String(nextValue ?? "");
}

function describeCurrentHydratedProp(element: HTMLElement, key: string) {
  if (key === "className" || key === "class") {
    return element.getAttribute("class") ?? "";
  }
  if (key === "style") {
    return element.getAttribute("style") ?? "";
  }
  if (key === "dataset") {
    return JSON.stringify({ ...element.dataset });
  }
  if (key === "value" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return element.value;
  }
  if (key === "checked" && element instanceof HTMLInputElement) {
    return String(element.checked);
  }
  if (key === "disabled" || key === "hidden") {
    return String(element.hasAttribute(key));
  }
  if (key === "title" || key === "id") {
    return element.getAttribute(key) ?? "";
  }
  if (key in element) {
    return String((element as any)[key] ?? "");
  }
  return element.getAttribute(key) ?? "";
}

function describeHydrationValue(value: any) {
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function serializeStyleLike(style: Record<string, any>) {
  return Object.entries(style)
    .map(([styleKey, styleValue]) => `${styleKey.replace(/([A-Z])/g, "-$1").toLowerCase()}:${styleValue}`)
    .join(";");
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
  element: HTMLElement,
  instruction: Extract<HydrationInstruction, { kind: "dynamic-prop" }>
) {
  let initialized = false;
  useLayoutEffect(() => {
    const nextValue = instruction.getter();
    if (!initialized) {
      initialized = true;
      if (!matchesCurrentHydratedProp(element, instruction.prop, nextValue)) {
        warnMismatch({
          path: `hydrate.instruction.dynamic-prop.${instruction.id}.${instruction.prop}`,
          message: "Dynamic prop SSR value does not match hydrated getter value",
          expected: describeHydrationValue(nextValue),
          found: describeCurrentHydratedProp(element, instruction.prop),
          node: element
        });
      }
      return;
    }

    setProp(element, instruction.prop, nextValue, {
      hydrating: true,
      path: `hydrate.dynamic-prop.${instruction.id}.${instruction.prop}`
    });
  });
}

function runCollectedEffect(
  instruction: Extract<HydrationInstruction, { kind: "layout-effect" | "effect" }>,
  phase: "layout" | "effect"
) {
  if (instruction.deps) {
    useEffectWithDeps(instruction.effect, instruction.deps, phase);
    return;
  }

  if (phase === "layout") {
    useLayoutEffect(instruction.effect);
    return;
  }

  useEffect(instruction.effect);
}

function applyProps(
  element: HTMLElement,
  props: Record<string, any>,
  options: { hydrating: boolean; path: string }
) {
  for (const [key, rawValue] of Object.entries(props)) {
    if (key === "children" || key === "client") continue;
    if (key === "ref") {
      bindRef(rawValue, element);
      continue;
    }
    if (key.startsWith("on") && typeof rawValue === "function") {
      bindDelegatedEvent(element, key.slice(2).toLowerCase(), rawValue as EventListener);
      continue;
    }

    if (typeof rawValue === "function") {
      useLayoutEffect(() => {
        setProp(element, key, rawValue(), options);
      });
      continue;
    }

    setProp(element, key, rawValue, options);
  }
}

function setProp(
  element: HTMLElement,
  key: string,
  value: any,
  options: { hydrating: boolean; path: string }
) {
  if (key === "className") {
    element.setAttribute("class", value ?? "");
    return;
  }
  if (key === "style" && typeof value === "object" && value !== null) {
    Object.assign(element.style, value);
    return;
  }
  if (key === "dataset" && typeof value === "object" && value !== null) {
    Object.assign(element.dataset, value);
    return;
  }
  if (value === undefined || value === null || value === false) {
    element.removeAttribute(key);
    return;
  }
  if (options.hydrating && shouldPreserveRuntimeProp(element, key, value)) {
    return;
  }
  if (key in element) {
    applyPropertyValue(element, key, value, options);
  } else {
    element.setAttribute(key, String(value));
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

export function appendChildren(parent: Node, children: any[]) {
  children.flat(Infinity).forEach((child) => {
    if (child == null || child === false) return;
    parent.appendChild(renderToDOM(child));
  });
}

function hydrateChildren(parent: Node, vChildren: any[], path: string, options: Required<HydrateOptions>) {
  let cursor = 0;

  for (let index = 0; index < vChildren.length; index++) {
    cursor = hydrateNode(parent, vChildren[index], cursor, `${path}.${index}`, options);
  }

  if (!options.recover) {
    for (let extraIndex = cursor; extraIndex < parent.childNodes.length; extraIndex++) {
      warnMismatch({
        path: `${path}.extra.${extraIndex - cursor}`,
        message: "Unexpected extra DOM node during hydration",
        expected: "no extra node",
        found: describeNode(parent.childNodes[extraIndex]),
        node: parent.childNodes[extraIndex]
      });
    }
    return;
  }

  while (parent.childNodes.length > cursor) {
    parent.removeChild(parent.childNodes[cursor]);
  }
}

function hydrateChildrenBetween(
  parent: Node,
  start: Comment,
  end: Comment,
  vChildren: any[],
  path: string,
  options: Required<HydrateOptions>
) {
  let cursor = childIndexOf(parent, start) + 1;

  for (let index = 0; index < vChildren.length; index++) {
    cursor = hydrateNode(parent, vChildren[index], cursor, `${path}.${index}`, options);
  }

  if (!options.recover) {
    let extraNode: ChildNode | null = parent.childNodes[cursor] ?? null;
    let extraIndex = 0;
    while (extraNode && extraNode !== end) {
      warnMismatch({
        path: `${path}.extra.${extraIndex}`,
        message: "Unexpected extra DOM node between hydration markers",
        expected: "no extra node",
        found: describeNode(extraNode),
        node: extraNode
      });
      extraNode = extraNode.nextSibling;
      extraIndex += 1;
    }
    return;
  }

  while (parent.childNodes[cursor] && parent.childNodes[cursor] !== end) {
    parent.removeChild(parent.childNodes[cursor]);
  }
}

function hydrateNode(parent: Node, input: any, index: number, path: string, options: Required<HydrateOptions>): number {
  const vNode = resolveVNode(input);

  if (vNode == null || vNode === false) {
    return index;
  }

  if (vNode instanceof Node) {
    const existing = parent.childNodes[index];
    if (existing === vNode) {
      return index + 1;
    }
    warnMismatch({
      path,
      message: "Expected existing DOM node to match hydrated node",
      expected: describeNode(vNode),
      found: describeNode(existing),
      node: existing
    });
    if (options.recover) {
      replaceAt(parent, index, vNode);
    }
    return index + 1;
  }

  if (typeof vNode === "function") {
    return hydrateReactiveChild(parent, vNode, index, path, options);
  }

  if (typeof vNode === "string" || typeof vNode === "number") {
    const existing = parent.childNodes[index];
    if (existing?.nodeType === Node.TEXT_NODE) {
      const nextValue = String(vNode);
      if (existing.textContent !== nextValue) {
        warnMismatch({
          path,
          message: `Text content mismatch: expected "${nextValue}" got "${existing.textContent ?? ""}"`,
          expected: nextValue,
          found: existing.textContent ?? "",
          node: existing
        });
        if (options.recover) {
          existing.textContent = nextValue;
        }
      }
    } else {
      warnMismatch({
        path,
        message: "Expected text node during hydration",
        expected: "text node",
        found: describeNode(existing),
        node: existing
      });
      if (options.recover) {
        replaceAt(parent, index, document.createTextNode(String(vNode)));
      }
    }
    return index + 1;
  }

  if (Array.isArray(vNode)) {
    let cursor = index;
    for (let childIndex = 0; childIndex < vNode.length; childIndex++) {
      cursor = hydrateNode(parent, vNode[childIndex], cursor, `${path}[${childIndex}]`, options);
    }
    return cursor;
  }

  if (vNode.tag === "Fragment") {
    let cursor = index;
    const children = normalizeChildren(vNode.children ?? []);
    for (let childIndex = 0; childIndex < children.length; childIndex++) {
      cursor = hydrateNode(parent, children[childIndex], cursor, `${path}#fragment.${childIndex}`, options);
    }
    return cursor;
  }

  if (isHydrateSlotTag(vNode.tag)) {
    return hydrateSlot(parent, vNode, index, path, options);
  }

  if (typeof vNode.tag === "function") {
    return hydrateNode(parent, vNode.tag(resolveComponentProps(vNode)), index, `${path}#component`, options);
  }

  const existing = parent.childNodes[index];

  if (isHydratableElement(existing, vNode.tag)) {
    const element = existing as HTMLElement;
    applyProps(element, vNode.props ?? {}, { hydrating: true, path });
    hydrateChildren(element, normalizeChildren(vNode.children ?? []), path, options);
  } else {
    warnMismatch({
      path,
      message: `Expected <${String(vNode.tag)}> but found ${describeNode(existing)}`,
      expected: `<${String(vNode.tag)}>`,
      found: describeNode(existing),
      node: existing
    });
    if (options.recover) {
      replaceAt(parent, index, renderToDOM(vNode));
    }
  }

  return index + 1;
}

function hydrateReactiveChild(
  parent: Node,
  getter: () => any,
  index: number,
  path: string,
  options: Required<HydrateOptions>
): number {
  const start = parent.childNodes[index];
  if (!isReactiveStartMarker(start)) {
    warnMismatch({
      path,
      message: "Reactive function child remounted during hydration",
      expected: `<!--${REACTIVE_CHILD_START}-->`,
      found: describeNode(start),
      node: start
    });
    if (options.recover) {
      replaceAt(parent, index, createReactiveRange(getter));
      return index + 2;
    }
    return index;
  }

  const markerPair = resolveReactiveMarkerPairFromComment((start as Comment).data);
  if (!markerPair) {
    if (!options.recover) {
      return index + 1;
    }
    return index;
  }

  const end = findMatchingMarkerEnd(parent, start as Comment, markerPair.start, markerPair.end);
  if (!end) {
    warnMismatch({
      path,
      message: "Missing reactive child end marker during hydration",
      expected: `<!--${REACTIVE_CHILD_END}-->`,
      found: "nothing",
      node: start
    });
    if (!options.recover) {
      return index + 1;
    }
    return index;
  }

  const rangeStart = document.createComment("adaptive-start");
  const rangeEnd = document.createComment("adaptive-end");
  parent.replaceChild(rangeStart, start as Comment);
  parent.replaceChild(rangeEnd, end);

  let currentNodes = collectSiblingNodesBetween(rangeStart, rangeEnd);
  let initialized = false;

  const updateRange = () => {
    const rangeParent = rangeStart.parentNode;
    if (!rangeParent) return;

    const nextValue = getter();
    if (!initialized) {
      initialized = true;
      return;
    }

    for (const node of currentNodes) {
      if (node.parentNode === rangeParent) {
        rangeParent.removeChild(node);
      }
    }

    currentNodes = normalizeToNodes(nextValue);
    currentNodes.forEach((node) => rangeParent.insertBefore(node, rangeEnd));
  };

  useLayoutEffect(updateRange);
  return index + currentNodes.length + 2;
}

function replaceAt(parent: Node, index: number, nextNode: Node) {
  const existing = parent.childNodes[index];
  if (existing) {
    parent.replaceChild(nextNode, existing);
    return;
  }

  parent.appendChild(nextNode);
}

function childIndexOf(parent: Node, target: Node) {
  const nodes = parent.childNodes;
  for (let index = 0; index < nodes.length; index++) {
    if (nodes[index] === target) {
      return index;
    }
  }
  return -1;
}

function collectSiblingNodesBetween(start: Comment, end: Comment) {
  const nodes: Node[] = [];
  let current = start.nextSibling;

  while (current && current !== end) {
    nodes.push(current);
    current = current.nextSibling;
  }

  return nodes;
}

function hydrateSlot(parent: Node, vNode: any, index: number, path: string, options: Required<HydrateOptions>) {
  const start = parent.childNodes[index];
  if (!isSlotMarker(start, HYDRATE_SLOT_START)) {
    if (vNode.props?.hydrate === true) {
      return index;
    }
    warnMismatch({
      path,
      message: "Expected hydrate slot start marker during hydration",
      expected: `<!--${HYDRATE_SLOT_START}-->`,
      found: describeNode(start),
      node: start
    });
    if (options.recover) {
      replaceAt(parent, index, renderToDOM(vNode));
    }
    return index + 1;
  }

  const end = findMatchingSlotEnd(parent, start as Comment);
  if (!end) {
    warnMismatch({
      path,
      message: "Missing hydrate slot end marker during hydration",
      expected: `<!--${HYDRATE_SLOT_END}-->`,
      found: "nothing",
      node: start
    });
    return index;
  }

  if (vNode.props?.hydrate !== true) {
    hydrateChildrenBetween(parent, start as Comment, end, normalizeChildren(vNode.children ?? []), path, options);
  }

  const preservedNodes = collectSiblingNodesBetween(start as Comment, end);
  if (options.removeMarkers) {
    (start as Comment).remove();
    end.remove();
    return index + preservedNodes.length;
  }
  return index + preservedNodes.length + 2;
}

function isSlotMarker(node: Node | undefined, expectedValue: string) {
  return Boolean(
    node &&
    node.nodeType === Node.COMMENT_NODE &&
    (node as Comment).data === expectedValue
  );
}

function isReactiveStartMarker(node: Node | undefined) {
  return Boolean(
    node &&
    node.nodeType === Node.COMMENT_NODE &&
    Boolean(resolveReactiveMarkerPairFromComment((node as Comment).data))
  );
}

function resolveReactiveMarkerPairFromComment(data: string) {
  const candidates = [
    { start: REACTIVE_CHILD_START, end: REACTIVE_CHILD_END },
    { start: REACTIVE_STRUCT_START, end: REACTIVE_STRUCT_END },
    { start: REACTIVE_LIST_START, end: REACTIVE_LIST_END },
    { start: REACTIVE_ASYNC_START, end: REACTIVE_ASYNC_END }
  ];

  for (const candidate of candidates) {
    if (data === candidate.start || data.startsWith(`${candidate.start}:`)) {
      return candidate;
    }
  }

  return null;
}

function isClientBoundaryStartComment(node: Node | null | undefined): node is Comment {
  return Boolean(
    node &&
    node.nodeType === Node.COMMENT_NODE &&
    (((node as Comment).data ?? "").startsWith(CLIENT_BOUNDARY_START_PREFIX))
  );
}

function findMatchingSlotEnd(parent: Node, start: Comment) {
  return findMatchingMarkerEnd(parent, start, HYDRATE_SLOT_START, HYDRATE_SLOT_END);
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

function resolveHydrateOptions(options: HydrateOptions): Required<HydrateOptions> {
  return {
    recover: options.recover ?? DEFAULT_HYDRATE_OPTIONS.recover,
    removeMarkers: options.removeMarkers ?? DEFAULT_HYDRATE_OPTIONS.removeMarkers
  };
}

function resolveVNode(value: any): any {
  if (value == null || value === false) return null;
  if (value instanceof Node) return value;
  if (typeof value === "function") return value;
  if (Array.isArray(value)) return value.flat(Infinity).map((item) => resolveVNode(item)).filter((item) => item != null);
  return value;
}

function normalizeChildren(value: any): any[] {
  const normalized = Array.isArray(value) ? value : [value];
  return normalized.flat(Infinity).map((child) => resolveVNode(child)).filter((child) => child != null);
}

function resolveComponentProps(vNode: any) {
  const props = { ...(vNode.props ?? {}) };
  const children = vNode.children ?? [];
  if (children.length > 0 || props.children === undefined) {
    props.children = children;
  }
  return props;
}

function isHydratableElement(node: Node | undefined, expectedTag: string) {
  return Boolean(
    node &&
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).tagName.toLowerCase() === expectedTag.toLowerCase()
  );
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
  handlers.set(eventName, handler);

  if (delegatedEvents.has(eventName)) {
    return;
  }

  delegatedEvents.add(eventName);
  document.addEventListener(eventName, (event) => {
    let current: EventTarget | null = event.target;

    while (current) {
      const currentHandlers = eventHandlers.get(current);
      const delegated = currentHandlers?.get(eventName);
      if (delegated) {
        delegated.call(current, event);
        if (event.cancelBubble) {
          return;
        }
      }

      current = current instanceof Node ? current.parentNode : null;
    }
  });
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

function describeNode(node: Node | undefined) {
  if (!node) return "nothing";
  if (node.nodeType === Node.TEXT_NODE) return "text node";
  if (node.nodeType === Node.COMMENT_NODE) return "comment node";
  if (node.nodeType === Node.ELEMENT_NODE) return `<${(node as Element).tagName.toLowerCase()}>`;
  return `nodeType(${node.nodeType})`;
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

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
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
