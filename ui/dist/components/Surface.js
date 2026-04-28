import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Surface(children, props = {}, style = {}) {
	return adaptiveCreateElement("surface", mergeProps(props, {
		padding: props.padding ?? 16,
		style
	}), ...children());
}

//# sourceMappingURL=Surface.js.map
