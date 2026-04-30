import { useState } from "./state.js";
export function createContext(defaultValue) {
	const [current, setCurrent] = useState(defaultValue);
	const Provider = ({ value, children }) => {
		setCurrent(value);
		return {
			tag: "Fragment",
			props: {},
			children: Array.isArray(children) ? children : children ? [children] : []
		};
	};
	return {
		Provider,
		useContext: () => ({ current: current() })
	};
}
export function useContext(context) {
	return context.useContext();
}

//# sourceMappingURL=context-vanilla.js.map
