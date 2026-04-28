import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Column(children, props = {}, style = {}) {
	return adaptiveCreateElement("column", mergeProps(props, {
		spacing: props.spacing ?? 8,
		style
	}), ...children());
}

//# sourceMappingURL=Column.js.map
