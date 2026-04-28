import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";
export function Heading(content, props = {}, style = {}) {
	const level = props.level ?? 1;
	const headingProps = { ...props };
	delete headingProps.level;
	return adaptiveCreateElement("heading", mergeProps(headingProps, {
		level,
		style
	}), content);
}

//# sourceMappingURL=Heading.js.map
