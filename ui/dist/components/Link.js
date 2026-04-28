import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Link(label, props, style = {}) {
	return adaptiveCreateElement("link", mergeProps(props, { style }), label);
}

//# sourceMappingURL=Link.js.map
