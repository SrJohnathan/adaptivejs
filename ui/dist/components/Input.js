import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Input(props = {}, style = {}) {
	return adaptiveCreateElement("input", mergeProps(props, { style }));
}

//# sourceMappingURL=Input.js.map
