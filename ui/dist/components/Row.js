import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Row(children, props = {}, style = {}) {
	return adaptiveCreateElement("row", mergeProps(props, {
		spacing: props.spacing ?? 8,
		style
	}), ...children());
}

//# sourceMappingURL=Row.js.map
