import { adaptiveCreateElement } from "../primitives.js";
export function Spacer(size = 16, props = {}) {
	return adaptiveCreateElement("spacer", {
		...props,
		size
	});
}
export function SpacerBox(props = {}) {
	const { size, width = size, height = size,...rest } = props;
	return adaptiveCreateElement("spacer", {
		...rest,
		...size !== undefined ? { size } : {},
		...width !== undefined ? { width } : {},
		...height !== undefined ? { height } : {}
	});
}
export default Spacer;

//# sourceMappingURL=Spacer.js.map
