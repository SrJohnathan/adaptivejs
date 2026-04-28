export function renderToString(node) {
	if (typeof node === "function") {
		return renderToString(node());
	}
	if (node == null || node === false) return "";
	if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map(renderToString).join("");
	}
	if (typeof node.tag === "function") {
		const result = node.tag({
			...node.props ?? {},
			children: node.children ?? []
		});
		return renderToString(result);
	}
	if (node.tag === "Fragment") {
		return renderToString(node.children ?? []);
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
	return `<${tag}${propsString}>${renderToString(children)}</${tag}>`;
}

//# sourceMappingURL=renderToString.js.map
