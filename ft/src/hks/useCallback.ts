import { useRef } from "../jsx-runtime.js";


export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: unknown[]): T {
    const ref = useRef<{ fn: T; deps: unknown[] }>({ fn, deps });

    const isSameDeps = (a: unknown[], b: unknown[]) =>
        a.length === b.length && a.every((val, i) => Object.is(val, b[i]));

    if (!ref.current || !isSameDeps(ref.current.deps, deps)) {
        ref.current = { fn, deps };
    }

    return ref.current.fn;
}
