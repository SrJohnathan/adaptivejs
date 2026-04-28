type Cleanup = void | (() => void);
type EffectFn = () => Cleanup;
type DependencyList = any[];
export declare const isSSR: () => boolean;
declare class EffectSystem {
    private currentEffect;
    private cleanups;
    private dependencies;
    private queue;
    private flushing;
    getCurrentEffect(): EffectFn | null;
    setCurrentEffect(effect: EffectFn | null): void;
    runCleanup(effect: EffectFn): void;
    registerCleanup(effect: EffectFn, cleanup: Cleanup): void;
    haveDepsChanged(effect: EffectFn, deps: DependencyList): boolean;
    setDependencies(effect: EffectFn, deps: DependencyList): void;
    schedule(effect: EffectFn): void;
    flush(): void;
    run(effect: EffectFn): void;
    cleanupAll(): void;
}
export declare const getEffectSystem: () => EffectSystem;
export declare class TSX5Observer<T = any> {
    private value;
    private subscribers;
    constructor(value: T);
    get(): T;
    set(nextValue: T): void;
    update(updater: (current: T) => T): void;
}
export declare function useState<T>(initialValue: T): [() => T, (value: T | ((prev: T) => T)) => void];
export declare function createStore<T extends Record<string, any>>(initialState: T): { [K in keyof T]: [() => T[K], (value: T[K] | ((prev: T[K]) => T[K])) => void]; };
export declare const useStateAlt: typeof createStore;
export declare function useEffect(effect: EffectFn): void;
export declare function useEffectWithDeps(effect: EffectFn, deps: DependencyList): void;
export declare const useEffectDep: typeof useEffectWithDeps;
export declare function useDOMEffect(effect: EffectFn): void;
export declare function useMemo<T>(compute: () => T, deps: DependencyList): () => T;
export declare function useClientEffect(effect: EffectFn, deps?: DependencyList): void;
export declare function batch(fn: () => void): void;
export declare function cleanupAllEffects(): void;
export {};
