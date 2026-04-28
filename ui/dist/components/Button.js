import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Button(label, props = {}, style = {}) {
	return adaptiveCreateElement("button", mergeProps(props, { style }), label);
}

//# sourceMappingURL=Button.js.map
