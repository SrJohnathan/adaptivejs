import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Text(content, props = {}, style = {}) {
	return adaptiveCreateElement("text", mergeProps(props, { style }), content);
}

//# sourceMappingURL=Text.js.map
