import { useLayoutEffect } from "./state.js";
const eventHandlers = new WeakMap();
const delegatedEvents = new Set();
const mismatchLog = new Set();
const mismatchHistory = [];
export function hydrate(root, renderFn) {
	hydrateChildren(root, normalizeChildren(renderFn()), "root");
}
export function mount(root, renderFn) {
	root.replaceChildren(renderToDOM(renderFn()));
}
export function getHydrationMismatches() {
	return [...mismatchHistory];
}
export function clearHydrationMismatches() {
	mismatchLog.clear();
	mismatchHistory.length = 0;
	if (typeof window !== "undefined") {
		window.__ADAPTIVE_HYDRATION_MISMATCHES__ = [];
	}
}
export function renderToDOM(vNode) {
	if (vNode instanceof Node) return vNode;
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
	if (typeof vNode.tag === "function") {
		return renderToDOM(vNode.tag({
			...vNode.props ?? {},
			children: vNode.children ?? []
		}));
	}
	const element = document.createElement(vNode.tag);
	applyProps(element, vNode.props ?? {}, {
		hydrating: false,
		path: vNode.tag
	});
	appendChildren(element, vNode.children ?? []);
	return element;
}
function createReactiveRange(getter) {
	const start = document.createComment("adaptive-start");
	const end = document.createComment("adaptive-end");
	const fragment = document.createDocumentFragment();
	fragment.appendChild(start);
	fragment.appendChild(end);
	let currentNodes = [];
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
function normalizeToNodes(value) {
	if (value == null || value === false) return [];
	if (Array.isArray(value)) {
		return value.flat(Infinity).flatMap((item) => normalizeToNodes(item));
	}
	return [renderToDOM(value)];
}
function applyProps(element, props, options) {
	for (const [key, rawValue] of Object.entries(props)) {
		if (key === "children" || key === "client") continue;
		if (key === "ref") {
			bindRef(rawValue, element);
			continue;
		}
		if (key.startsWith("on") && typeof rawValue === "function") {
			bindDelegatedEvent(element, key.slice(2).toLowerCase(), rawValue);
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
function setProp(element, key, value, options) {
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
function bindRef(ref, element) {
	if (!ref) return;
	if (typeof ref === "function") {
		ref(element);
		return;
	}
	if (typeof ref === "object") {
		ref.current = element;
	}
}
export function appendChildren(parent, children) {
	children.flat(Infinity).forEach((child) => {
		if (child == null || child === false) return;
		parent.appendChild(renderToDOM(child));
	});
}
function hydrateChildren(parent, vChildren, path) {
	let cursor = 0;
	for (let index = 0; index < vChildren.length; index++) {
		cursor = hydrateNode(parent, vChildren[index], cursor, `${path}.${index}`);
	}
	while (parent.childNodes.length > cursor) {
		parent.removeChild(parent.childNodes[cursor]);
	}
}
function hydrateNode(parent, input, index, path) {
	const vNode = resolveVNode(input);
	if (vNode == null || vNode === false) {
		return index;
	}
	if (typeof vNode === "function") {
		warnMismatch({
			path,
			message: "Reactive function child remounted during hydration",
			expected: "stable server-rendered child",
			found: describeNode(parent.childNodes[index]),
			node: parent.childNodes[index]
		});
		replaceAt(parent, index, createReactiveRange(vNode));
		return index + 2;
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
				existing.textContent = nextValue;
			}
		} else {
			warnMismatch({
				path,
				message: "Expected text node during hydration",
				expected: "text node",
				found: describeNode(existing),
				node: existing
			});
			replaceAt(parent, index, document.createTextNode(String(vNode)));
		}
		return index + 1;
	}
	if (Array.isArray(vNode)) {
		let cursor = index;
		for (let childIndex = 0; childIndex < vNode.length; childIndex++) {
			cursor = hydrateNode(parent, vNode[childIndex], cursor, `${path}[${childIndex}]`);
		}
		return cursor;
	}
	if (vNode.tag === "Fragment") {
		let cursor = index;
		const children = normalizeChildren(vNode.children ?? []);
		for (let childIndex = 0; childIndex < children.length; childIndex++) {
			cursor = hydrateNode(parent, children[childIndex], cursor, `${path}#fragment.${childIndex}`);
		}
		return cursor;
	}
	if (typeof vNode.tag === "function") {
		return hydrateNode(parent, vNode.tag({
			...vNode.props ?? {},
			children: vNode.children ?? []
		}), index, `${path}#component`);
	}
	const existing = parent.childNodes[index];
	if (isHydratableElement(existing, vNode.tag)) {
		const element = existing;
		applyProps(element, vNode.props ?? {}, {
			hydrating: true,
			path
		});
		hydrateChildren(element, normalizeChildren(vNode.children ?? []), path);
	} else {
		warnMismatch({
			path,
			message: `Expected <${String(vNode.tag)}> but found ${describeNode(existing)}`,
			expected: `<${String(vNode.tag)}>`,
			found: describeNode(existing),
			node: existing
		});
		replaceAt(parent, index, renderToDOM(vNode));
	}
	return index + 1;
}
function replaceAt(parent, index, nextNode) {
	const existing = parent.childNodes[index];
	if (existing) {
		parent.replaceChild(nextNode, existing);
		return;
	}
	parent.appendChild(nextNode);
}
function resolveVNode(value) {
	if (value == null || value === false) return null;
	if (typeof value === "function") return value;
	if (Array.isArray(value)) return value.flat(Infinity).map((item) => resolveVNode(item)).filter((item) => item != null);
	return value;
}
function normalizeChildren(value) {
	const normalized = Array.isArray(value) ? value : [value];
	return normalized.flat(Infinity).map((child) => resolveVNode(child)).filter((child) => child != null);
}
function isHydratableElement(node, expectedTag) {
	return Boolean(node && node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === expectedTag.toLowerCase());
}
function shouldPreserveRuntimeProp(element, key, nextValue) {
	if (key === "value" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
		return element === document.activeElement && element.value !== String(nextValue ?? "");
	}
	if (key === "checked" && element instanceof HTMLInputElement) {
		return element === document.activeElement && element.checked !== Boolean(nextValue);
	}
	if ((key === "scrollTop" || key === "scrollLeft") && element[key] !== 0) {
		return true;
	}
	if (element instanceof HTMLMediaElement && [
		"currentTime",
		"volume",
		"playbackRate"
	].includes(key)) {
		return true;
	}
	return false;
}
function bindDelegatedEvent(element, eventName, handler) {
	let handlers = eventHandlers.get(element);
	if (!handlers) {
		handlers = new Map();
		eventHandlers.set(element, handlers);
	}
	handlers.set(eventName, handler);
	if (delegatedEvents.has(eventName)) {
		return;
	}
	delegatedEvents.add(eventName);
	document.addEventListener(eventName, (event) => {
		let current = event.target;
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
function warnMismatch(details) {
	const { path, message, expected, found, node } = details;
	const key = `${path}:${message}`;
	if (mismatchLog.has(key)) return;
	mismatchLog.add(key);
	const entry = {
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
function isHydrationDebugEnabled() {
	if (typeof window !== "undefined" && window.__ADAPTIVE_DEBUG_HYDRATION__ === true) {
		return true;
	}
	return globalThis?.process?.env?.ADAPTIVE_PUBLIC_DEBUG_HYDRATION === "true";
}
function describeNode(node) {
	if (!node) return "nothing";
	if (node.nodeType === Node.TEXT_NODE) return "text node";
	if (node.nodeType === Node.COMMENT_NODE) return "comment node";
	if (node.nodeType === Node.ELEMENT_NODE) return `<${node.tagName.toLowerCase()}>`;
	return `nodeType(${node.nodeType})`;
}
function applyPropertyValue(element, key, value, options) {
	const preserveSelection = options.hydrating && key === "value" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && document.activeElement === element;
	const selection = preserveSelection ? captureSelection(element) : null;
	element[key] = value;
	if (selection) {
		restoreSelection(element, selection);
	}
}
function captureSelection(element) {
	return {
		start: element.selectionStart,
		end: element.selectionEnd,
		direction: element.selectionDirection
	};
}
function restoreSelection(element, selection) {
	if (selection.start == null || selection.end == null) return;
	try {
		element.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
	} catch {}
}
function readHydrationRoute() {
	if (typeof window === "undefined") {
		return "server";
	}
	return window.__ROUTE__ ?? window.location.pathname;
}
function captureNodeSnippet(node) {
	if (!node) return undefined;
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent ?? "";
	}
	if (node.nodeType === Node.COMMENT_NODE) {
		return `<!--${node.textContent ?? ""}-->`;
	}
	if (node.nodeType === Node.ELEMENT_NODE) {
		return node.outerHTML.slice(0, 200);
	}
	return undefined;
}

//# sourceMappingURL=hidrate.js.map
