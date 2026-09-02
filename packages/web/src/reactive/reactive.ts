/*
 * API pública de estado reativo do Adaptive.
 * Nomes próprios (sem use* do React).
 *
 *   const [count, setCount] = signal(0);
 *   const box = ref<HTMLDivElement>(null);
 *   const label = memo(() => `n=${count()}`);
 *   const form = store({ name: "", age: 0 });
 */

import {
    type Cleanup,
    type DependencyList,
    type EffectFn,
    type ReactiveSource,
    createEventSignal,
    events,
    untrack,
    useHookSlot,
    isSSR,
} from "./events.js";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type Setter<T> = ((value: T | ((prev: T) => T)) => void) & {
    __adaptiveSource?: ReactiveSource;
};

export type Signal<T> = [() => T, Setter<T>];

export type RefBox<T> = {
    current: T | null;
};

export type StoreObject<T extends Record<string, any>> = {
    [K in keyof T]: Signal<T[K]>;
};

// ---------------------------------------------------------------------------
// signal
// ---------------------------------------------------------------------------

export function signal<T>(initialValue: T): Signal<T> {
    return useHookSlot(() => createEventSignal(initialValue));
}

export function rootSignal<T>(initialValue: T): Signal<T> {
    return createEventSignal(initialValue);
}

export function createSignal<T>(initialValue: T): Signal<T> {
    // alias compat - antes ficava no index.ts
    return createEventSignal(initialValue);
}

// ---------------------------------------------------------------------------
// ref
// ---------------------------------------------------------------------------

export function ref<T = any>(initialValue: T | null = null): RefBox<T> {
    return useHookSlot(() => ({ current: initialValue }));
}

// ---------------------------------------------------------------------------
// memo — valor derivado reativo (corrigido)
// ---------------------------------------------------------------------------

type MemoHookState<T> = {
    signal: Signal<T>;
    disposeRunner?: EffectFn;
    initialized: boolean;
    prevDeps?: DependencyList;
    prevComputedDeps?: DependencyList;
};

function depsChanged(prev: DependencyList | undefined, next: DependencyList): boolean {
    if (!prev) return true;
    if (prev.length !== next.length) return true;
    return next.some((d, i) => !Object.is(d, prev![i]));
}

export function memo<T>(compute: () => T, deps?: DependencyList): () => T {
    const hook = useHookSlot<MemoHookState<T>>(() => ({
        signal: createEventSignal(undefined as unknown as T),
        initialized: false,
    }));

    if (!hook.initialized) {
        hook.initialized = true;
        const [, set] = hook.signal;
        set(untrack(() => compute()));
        // efeito reativo que mantém memo atualizado automaticamente
        // guardamos runner via events para cleanup
        events(() => {
            set(compute());
        });
        if (deps) hook.prevDeps = deps.map(d => typeof d === "function" ? (d as any)() : d);
        return hook.signal[0];
    }

    // compat: se deps explicito for passado, só recomputa quando mudar
    if (Array.isArray(deps) && deps.length > 0) {
        const resolved = deps.map(d => typeof d === "function" ? (d as any)() : d);
        if (depsChanged(hook.prevDeps, resolved)) {
            hook.prevDeps = resolved;
            hook.signal[1](untrack(() => compute()));
        }
    }

    return hook.signal[0];
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

export function store<T extends Record<string, any>>(initialState: T): StoreObject<T> {
    return useHookSlot(() => {
        const out = {} as StoreObject<T>;
        for (const key of Object.keys(initialState) as Array<keyof T>) {
            out[key] = createEventSignal(initialState[key]);
        }
        return out;
    });
}

export function rootStore<T extends Record<string, any>>(initialState: T): StoreObject<T> {
    const out = {} as StoreObject<T>;
    for (const key of Object.keys(initialState) as Array<keyof T>) {
        out[key] = createEventSignal(initialState[key]);
    }
    return out;
}

export function createStore<T extends Record<string, any>>(initialState: T): StoreObject<T> {
    return store(initialState);
}

// ---------------------------------------------------------------------------
// Aliases legados (compat com index.ts antigo)
// ---------------------------------------------------------------------------

/** @deprecated use signal() */
export const useReactive = signal;

/** @deprecated use ref() */
export const useRef = ref;

/** @deprecated use memo() */
export const useMemo = memo;

/** @deprecated use createSignal() */
export const useReactiveState = signal;

export type { Cleanup, DependencyList, EffectFn, ReactiveSource };
export { events, untrack, isSSR };