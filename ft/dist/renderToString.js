import { isClientBoundaryTag } from "./client-component.js";
export function renderToString(node) {
	return renderNode(node, {});
}
export function renderToStringWithMetadata(node) {
	const context = { clientModuleIds: new Set() };
	return {
		html: renderNode(node, context),
		clientModuleIds: Array.from(context.clientModuleIds ?? [])
	};
}
function renderNode(node, context) {
	if (typeof node === "function") {
		return renderNode(node(), context);
	}
	if (node == null || node === false) return "";
	if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map((child) => renderNode(child, context)).join("");
	}
	if (typeof node.tag === "function") {
		const result = node.tag({
			...node.props ?? {},
			children: node.children ?? []
		});
		return renderNode(result, context);
	}
	if (node.tag === "Fragment") {
		return renderNode(node.children ?? [], context);
	}
	if (isClientBoundaryTag(node.tag)) {
		return renderClientBoundary(node, context);
	}
	const { tag, props = {}, children = [] } = node;
	let propsString = "";
	for (const [key, value] of Object.entries(props)) {
		if (key === "children" || key === "ref" || value == null) continue;
		if (key.startsWith("on") && typeof value === "function") continue;
		const attrKey = key === "className" ? "class" : key;
		if (key === "style" && typeof value === "object") {
			const styleString = Object.entries(value).map(([styleKey, styleValue]) => `${styleKey.replace(/([A-Z])/g, "-$1").toLowerCase()}:${styleValue}`).join(";");
			propsString += ` style="${styleString}"`;
			continue;
		}
		const resolved = typeof value === "function" ? value() : value;
		propsString += ` ${attrKey}="${String(resolved).replace(/"/g, "&quot;")}"`;
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
function renderClientBoundary(node, context) {
	const props = node.props ?? {};
	const moduleId = String(props["data-adaptive-client-module"] ?? "");
	const exportName = String(props["data-adaptive-client-export"] ?? "default");
	const rawProps = String(props["data-adaptive-client-props"] ?? "{}");
	if (moduleId) {
		context.clientModuleIds?.add(moduleId);
	}
	const innerHtml = renderNode(node.children ?? [], context);
	return `<div data-adaptive-client-module="${escapeAttribute(moduleId)}" data-adaptive-client-export="${escapeAttribute(exportName)}" data-adaptive-client-props="${escapeAttribute(rawProps)}">${innerHtml}</div>`;
}
function escapeAttribute(value) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

//# sourceMappingURL=renderToString.js.map
