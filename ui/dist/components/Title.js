import { Heading } from "./Heading.js";
export function Title(content, level = 1, props = {}, style = {}) {
	return Heading(content, {
		...props,
		level
	}, style);
}

//# sourceMappingURL=Title.js.map
