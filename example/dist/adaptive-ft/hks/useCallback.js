import { useRef } from "../jsx-runtime.js";
export function useCallback(fn, deps) {
	const ref = useRef({
		fn,
		deps
	});
	const isSameDeps = (a, b) => a.length === b.length && a.every((val, i) => Object.is(val, b[i]));
	if (!ref.current || !isSameDeps(ref.current.deps, deps)) {
		ref.current = {
			fn,
			deps
		};
	}
	return ref.current.fn;
}

//# sourceMappingURL=useCallback.js.map
