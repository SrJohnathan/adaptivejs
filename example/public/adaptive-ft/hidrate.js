import { useEffect } from "./state.js";
export function hydrate(root, renderFn) {
	root.replaceChildren(renderToDOM(renderFn()));
}
export function mount(root, renderFn) {
	root.replaceChildren(renderToDOM(renderFn()));
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
	applyProps(element, vNode.props ?? {});
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
	useEffect(() => {
		const parent = start.parentNode;
		if (!parent) return;
		for (const node of currentNodes) {
			if (node.parentNode === parent) {
				parent.removeChild(node);
			}
		}
		currentNodes = normalizeToNodes(getter());
		currentNodes.forEach((node) => parent.insertBefore(node, end));
	});
	return fragment;
}
function normalizeToNodes(value) {
	if (value == null || value === false) return [];
	if (Array.isArray(value)) {
		return value.flat(Infinity).flatMap((item) => normalizeToNodes(item));
	}
	return [renderToDOM(value)];
}
function applyProps(element, props) {
	for (const [key, rawValue] of Object.entries(props)) {
		if (key === "children" || key === "client") continue;
		if (key === "ref") {
			bindRef(rawValue, element);
			continue;
		}
		if (key.startsWith("on") && typeof rawValue === "function") {
			element.addEventListener(key.slice(2).toLowerCase(), rawValue);
			continue;
		}
		if (typeof rawValue === "function") {
			useEffect(() => {
				setProp(element, key, rawValue());
			});
			continue;
		}
		setProp(element, key, rawValue);
	}
}
function setProp(element, key, value) {
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
	if (key in element) {
		element[key] = value;
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

//# sourceMappingURL=hidrate.js.map
