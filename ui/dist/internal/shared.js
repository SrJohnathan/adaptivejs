import { adaptiveFragment } from "../primitives.js";
export function mergeProps(props, additions) {
	const mergedStyle = {
		...props.style ?? {},
		...additions.style ?? {}
	};
	const nextProps = {
		...props,
		...additions,
		style: mergedStyle
	};
	if (Object.keys(mergedStyle).length === 0) {
		delete nextProps.style;
	}
	return nextProps;
}
export function adaptiveWrap(value) {
	if (value == null || value === false) {
		return adaptiveFragment();
	}
	if (Array.isArray(value)) {
		return adaptiveFragment(value);
	}
	return value;
}

//# sourceMappingURL=shared.js.map
