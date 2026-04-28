import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Form(children, props = {}, style = {}) {
	return adaptiveCreateElement("form", mergeProps(props, { style }), ...children());
}

//# sourceMappingURL=Form.js.map
