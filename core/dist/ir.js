const DEFAULT_OPTIONS = {
	resolveComponents: true,
	evaluateDynamicChildren: false,
	evaluateDynamicProps: false,
	includeNulls: false
};
export function createIRText(value) {
	return {
		kind: "text",
		value
	};
}
export function createIRDynamic(hint) {
	return {
		kind: "dynamic",
		hint
	};
}
export function createIRFragment(children = []) {
	return {
		kind: "fragment",
		children
	};
}
export function createIRElement(tag, props = {}, children = []) {
	return {
		kind: "element",
		tag,
		props,
		children
	};
}
export function serializeIR(node) {
	return JSON.stringify(node, null, 2);
}
export function createIRPageDocument(route, source, tree) {
	return {
		kind: "page",
		route,
		source,
		tree
	};
}
export function createIRDesktopDocument(entry, tree, state = [], bindings = [], actions = [], effects = [], componentBindings = [], componentActions = [], initialRoute = "/", pages = []) {
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
export function serializeIRPageDocument(document) {
	return JSON.stringify(document, null, 2);
}
export function serializeIRDesktopDocument(document) {
	return JSON.stringify(document, null, 2);
}
export function normalizeToIR(input, options = {}) {
	const resolvedOptions = {
		...DEFAULT_OPTIONS,
		...options
	};
	return normalizeChild(input, resolvedOptions);
}
function normalizeChild(input, options) {
	if (input == null || input === false) {
		return options.includeNulls ? createIRDynamic("nullish") : null;
	}
	if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
		return createIRText(String(input));
	}
	if (Array.isArray(input)) {
		const children = input.map((child) => normalizeChild(child, options)).filter((child) => child !== null);
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
		return normalizeElement(input, options);
	}
	return createIRDynamic("unsupported-child");
}
function normalizeElement(node, options) {
	if (typeof node.tag === "function") {
		const tagName = node.tag.name || "AnonymousComponent";
		if (tagName === "Fragment") {
			const fragmentChildren = (node.children ?? []).map((child) => normalizeChild(child, options)).filter((child) => child !== null);
			return createIRFragment(fragmentChildren);
		}
		if (!options.resolveComponents) {
			return createIRDynamic(`component:${tagName}`);
		}
		try {
			const rendered = node.tag({
				...node.props ?? {},
				children: node.children ?? []
			});
			return normalizeChild(rendered, options);
		} catch {
			return createIRDynamic(`component-error:${tagName}`);
		}
	}
	const props = normalizeProps(node.props ?? {}, options);
	const children = (node.children ?? []).map((child) => normalizeChild(child, options)).filter((child) => child !== null).flatMap((child) => child.kind === "fragment" ? child.children : [child]);
	if (node.tag === "Fragment") {
		return createIRFragment(children);
	}
	return createIRElement(String(node.tag), props, children);
}
function normalizeProps(props, options) {
	const output = {};
	for (const [key, value] of Object.entries(props)) {
		if (key === "children") continue;
		const normalized = normalizePropValue(key, value, options);
		if (normalized !== undefined) {
			output[key] = normalized;
		}
	}
	return output;
}
function normalizePropValue(key, value, options) {
	if (value == null) return options.includeNulls ? null : undefined;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "function") {
		if (/^on[A-Z]/.test(key)) {
			return {
				kind: "event",
				name: key
			};
		}
		if (!options.evaluateDynamicProps) {
			return {
				kind: "dynamic",
				hint: `prop:${key}`
			};
		}
		try {
			return normalizePropValue(key, value(), options);
		} catch {
			return {
				kind: "dynamic",
				hint: `prop-error:${key}`
			};
		}
	}
	if (Array.isArray(value)) {
		return value.map((item) => normalizeCollectionItem(item, options)).filter((item) => item !== undefined);
	}
	if (typeof value === "object") {
		const record = {};
		for (const [nestedKey, nestedValue] of Object.entries(value)) {
			const normalized = normalizePropValue(nestedKey, nestedValue, options);
			if (normalized !== undefined) {
				record[nestedKey] = normalized;
			}
		}
		return record;
	}
	return {
		kind: "dynamic",
		hint: `prop:${key}`
	};
}
function normalizeCollectionItem(value, options) {
	if (value == null) return options.includeNulls ? null : undefined;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	return undefined;
}

//# sourceMappingURL=ir.js.map
