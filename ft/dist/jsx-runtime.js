function flattenChildren(children) {
	return children.flat(Infinity).filter((child) => child !== undefined && child !== null && child !== false);
}
export function jsx(type, props) {
	const rawChildren = props?.children === undefined ? [] : Array.isArray(props.children) ? props.children : [props.children];
	return createElement(type, props, ...rawChildren);
}
export function jsxs(type, props) {
	return jsx(type, props);
}
export function jsxDEV(type, props) {
	return jsx(type, props);
}
export function createElement(tag, props = {}, ...children) {
	const normalizedChildren = flattenChildren(children);
	return {
		tag: tag === "<>" ? Fragment : tag,
		props: props ?? {},
		children: normalizedChildren
	};
}
export function Fragment(props) {
	const children = props.children === undefined ? [] : Array.isArray(props.children) ? props.children : [props.children];
	return {
		tag: "Fragment",
		props: {},
		children: flattenChildren(children)
	};
}
export function useRefReactive(initialValue = null) {
	let current = initialValue;
	return {
		get current() {
			return current;
		},
		set current(value) {
			current = value;
		}
	};
}
export function useRef(initialValue = null) {
	return { current: initialValue };
}

//# sourceMappingURL=jsx-runtime.js.map
