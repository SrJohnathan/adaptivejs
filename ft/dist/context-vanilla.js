import { Fragment } from "./jsx-runtime.js";
import { useState } from "./state.js";
export function createContext(defaultValue) {
	const [stack, setStack] = useState([defaultValue]);
	const Provider = ({ value, children }) => {
		setStack([value]);
		return Fragment({ children });
	};
	const useContextHook = () => ({ get current() {
		const values = stack();
		return values[values.length - 1];
	} });
	return {
		Provider,
		useContext: useContextHook
	};
}
export function useContext(context) {
	return context.useContext();
}

//# sourceMappingURL=context-vanilla.js.map
