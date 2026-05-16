import { readServerContext } from "@adaptive-js/shared";

/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

type Subscriber = EffectFn;
type Cleanup = void | (() => void);
export type EffectFn = () => Cleanup;
export type DependencyList = any[];
export type EffectPhase = "layout" | "effect";

type EffectScope = {
    id: number;
    label?: string;
    context?: Map<symbol, any>;

    //REF
    hooks: any[];
    hookIndex: number;
};

type HydrationCollectionState = {
    unsupportedFeatures: Set<string>;
    effectInstructions: Array<{
        kind: "layout-effect" | "effect";
        effect: EffectFn;
        deps?: DependencyList;
        ignoredSources?: ReactiveSource[];
    }>;
};

export type ReactiveSource = {
    removeSubscriber(effect: EffectFn): void;
};

export type ReactiveSetter<T> = {
    (value: T | ((prev: T) => T)): void;
    __adaptiveSource?: ReactiveSource;
};

type ReactiveSetterLike = Function & {
    __adaptiveSource?: ReactiveSource;
};

type ReactiveIgnoreTarget = ReactiveSetterLike | {
    __adaptiveSource?: ReactiveSource;
};

export type ReactiveEffectOptions = {
    ignore?: ReactiveIgnoreTarget[];
    phase?: EffectPhase;
};

export const isSSR = (): boolean => typeof window === "undefined";

let activeHydrationCollection: HydrationCollectionState | null = null;

function isAdaptiveHydrationDebugEnabled() {
    if (typeof window !== "undefined" && (window as any).__ADAPTIVE_DEBUG_HYDRATION__ === true) {
        return true;
    }

    return (globalThis as any)?.process?.env?.ADAPTIVE_PUBLIC_DEBUG_HYDRATION === "true";
}

function debugSignalLog(...args: any[]) {
    if (!isAdaptiveHydrationDebugEnabled()) {
        return;
    }

    console.log(...args);
}

class EffectSystem {
    private currentEffect: EffectFn | null = null;
    private currentScope: EffectScope | null = null;

    private cleanups = new Map<EffectFn, Cleanup>();
    private dependencies = new WeakMap<EffectFn, DependencyList>();
    private effectSources = new Map<EffectFn, Set<ReactiveSource>>();
    private ignoredSources = new WeakMap<EffectFn, WeakSet<ReactiveSource>>();
    private effectPhases = new WeakMap<EffectFn, EffectPhase>();

    private layoutQueue = new Set<EffectFn>();
    private effectQueue = new Set<EffectFn>();
    private pending = new WeakSet<EffectFn>();

    private flushing = false;
    private batchDepth = 0;
    private nextScopeId = 1;

    private effectScopes = new Map<EffectFn, EffectScope>();
    private disposedEffects = new WeakSet<EffectFn>();

    getCurrentEffect(): EffectFn | null {
        return this.currentEffect;
    }

    setCurrentEffect(effect: EffectFn | null) {
        this.currentEffect = effect;
    }

    createScope(label?: string): EffectScope {
        return {
            id: this.nextScopeId++,
            label,
            hooks: [],
            hookIndex: 0
        };
    }

    runWithScope<T>(scope: EffectScope, fn: () => T): T {
        const previousScope = this.currentScope;
        const previousHookIndex = scope.hookIndex;

        this.currentScope = scope;
        scope.hookIndex = 0;

        try {
            return fn();
        } finally {
            scope.hookIndex = previousHookIndex;
            this.currentScope = previousScope;
        }
    }

    registerEffectScope(effect: EffectFn) {
        if (this.currentScope && !this.effectScopes.has(effect)) {
            this.effectScopes.set(effect, this.currentScope);
        }
    }

    trackSource(effect: EffectFn, source: ReactiveSource) {
        let sources = this.effectSources.get(effect);
        if (!sources) {
            sources = new Set<ReactiveSource>();
            this.effectSources.set(effect, sources);
        }
        sources.add(source);
    }

    cleanupSources(effect: EffectFn) {
        const sources = this.effectSources.get(effect);
        if (!sources) return;

        for (const source of sources) {
            source.removeSubscriber(effect);
        }

        sources.clear();
        this.effectSources.delete(effect);
    }

    runCleanup(effect: EffectFn) {
        const cleanup = this.cleanups.get(effect);
        if (typeof cleanup === "function") {
            try {
                cleanup();
            } catch (error) {
                console.error("Adaptive cleanup error:", error);
            }
        }
        this.cleanups.delete(effect);
    }

    disposeEffect(effect: EffectFn) {
        this.layoutQueue.delete(effect);
        this.effectQueue.delete(effect);
        this.runCleanup(effect);
        this.cleanupSources(effect);
        this.ignoredSources.delete(effect);
        this.effectPhases.delete(effect);
        this.effectScopes.delete(effect);
        this.disposedEffects.add(effect);
    }

    registerCleanup(effect: EffectFn, cleanup: Cleanup) {
        if (typeof cleanup === "function") {
            this.cleanups.set(effect, cleanup);
        } else {
            this.cleanups.delete(effect);
        }
    }

    haveDepsChanged(effect: EffectFn, deps: DependencyList): boolean {
        const previous = this.dependencies.get(effect);
        if (!previous) return true;
        if (previous.length !== deps.length) return true;
        return deps.some((dep, index) => !Object.is(dep, previous[index]));
    }

    setDependencies(effect: EffectFn, deps: DependencyList) {
        this.dependencies.set(effect, deps);
    }

    setIgnoredSources(effect: EffectFn, sources: ReactiveSource[] = []) {
        if (sources.length === 0) {
            this.ignoredSources.delete(effect);
            return;
        }

        const next = new WeakSet<ReactiveSource>();
        sources.forEach((source) => next.add(source));
        this.ignoredSources.set(effect, next);
    }

    shouldIgnoreTrigger(effect: EffectFn, source: ReactiveSource): boolean {
        const ignored = this.ignoredSources.get(effect);
        if (!ignored) {
            return false;
        }

        return ignored.has(source);
    }

    setEffectPhase(effect: EffectFn, phase: EffectPhase) {
        this.effectPhases.set(effect, phase);
    }

    scheduleFromSource(effect: EffectFn, source: ReactiveSource) {
        const phase =
            this.effectPhases.get(effect) ?? "effect";

        this.schedule(effect, phase, source);
    }

    schedule(effect: EffectFn, phase: EffectPhase = "effect", source?: ReactiveSource) {
        if (isSSR()) return;
        if (this.disposedEffects.has(effect)) return;

        // Effects subscribe to every signal they read while running. If the same
        // effect later writes back into one of those signals, that source can
        // schedule the effect again and create a loop:
        // read -> subscribe -> set -> schedule -> run -> set -> ...
        //
        // useReactiveEffect allows a caller to opt into ignoring specific
        // sources by identity. We only skip the reschedule when the trigger
        // came from one of those exact sources; every other source and every
        // other subscriber keeps working normally.
        if (source && this.shouldIgnoreTrigger(effect, source)) return;

        this.registerEffectScope(effect);

        if (this.pending.has(effect)) return;
        this.pending.add(effect);

        if (phase === "layout") {
            this.layoutQueue.add(effect);
        } else {
            this.effectQueue.add(effect);
        }

        if (this.batchDepth > 0 || this.flushing) return;

        this.flushing = true;
        queueMicrotask(() => this.flush());
    }

    batch<T>(fn: () => T): T {
        this.batchDepth++;
        try {
            return fn();
        } finally {
            this.batchDepth--;
            if (this.batchDepth === 0 && this.hasQueuedEffects() && !this.flushing) {
                this.flushing = true;
                queueMicrotask(() => this.flush());
            }
        }
    }

    private hasQueuedEffects() {
        return this.layoutQueue.size > 0 || this.effectQueue.size > 0;
    }

    flush() {
        if (isSSR()) return;

        while (this.hasQueuedEffects()) {
            const layoutEffects = [...this.layoutQueue];
            const effects = [...this.effectQueue];

            this.layoutQueue.clear();
            this.effectQueue.clear();

            for (const effect of layoutEffects) {
                this.pending.delete(effect);
                this.run(effect);
            }

            for (const effect of effects) {
                this.pending.delete(effect);
                this.run(effect);
            }
        }

        this.flushing = false;
    }

    run(effect: EffectFn) {
        if (isSSR()) return;
        if (this.disposedEffects.has(effect)) return;

        this.runCleanup(effect);
        this.cleanupSources(effect);

        const previousEffect = this.currentEffect;

        try {
            this.setCurrentEffect(effect);
            this.registerEffectScope(effect);
            const cleanup = effect();
            this.registerCleanup(effect, cleanup);
        } catch (error) {
            console.error("Adaptive effect error:", error);
        } finally {
            this.setCurrentEffect(previousEffect);
        }
    }

    cleanupScope(scope: EffectScope) {
        const scopedEffects: EffectFn[] = [];

        for (const [effect, effectScope] of this.effectScopes) {
            if (effectScope.id === scope.id) {
                scopedEffects.push(effect);
            }
        }

        for (const effect of scopedEffects) {
            this.disposeEffect(effect);
        }
    }

    cleanupAll() {
        const effects = new Set<EffectFn>([
            ...this.cleanups.keys(),
            ...this.effectSources.keys(),
            ...this.effectScopes.keys()
        ]);

        for (const effect of effects) {
            this.disposeEffect(effect);
        }

        this.layoutQueue.clear();
        this.effectQueue.clear();
        this.flushing = false;
        this.batchDepth = 0;
    }


    // CONTEXT

    getCurrentScope() {
        return this.currentScope;
    }

    runWithContext<T>(ctxId: symbol, value: any, fn: () => T): T {
        const scope = this.currentScope;

        if (!scope) {
            return fn();
        }

        const previousContext = scope.context;
        const nextContext = new Map(previousContext ?? []);
        nextContext.set(ctxId, value);

        scope.context = nextContext;

        try {
            return fn();
        } finally {
            scope.context = previousContext;
        }
    }

    readContext<T>(ctxId: symbol, defaultValue: T): T {
        const scope = this.currentScope;

        if (!scope?.context?.has(ctxId)) {
            return defaultValue;
        }

        return scope.context.get(ctxId);
    }

    isDisposed(effect: EffectFn): boolean {
        return this.disposedEffects.has(effect);
    }

    untrack<T>(fn: () => T): T {
        const previous = this.currentEffect;
        this.currentEffect = null;
        try {
            return fn();
        } finally {
            this.currentEffect = previous;
        }
    }




}

const effectSystem = new EffectSystem();


// WRAPPER CONTEXT

export function runWithContext<T>(ctxId: symbol, value: any, fn: () => T): T {
    return effectSystem.runWithContext(ctxId, value, fn);
}

export function readContext<T>(ctxId: symbol, defaultValue: T): T {
    const value = effectSystem.readContext(ctxId, defaultValue);

    if (value !== defaultValue) {
        return value;
    }

    return readServerContext(ctxId, defaultValue);
}

function useHookSlot<T>(factory: () => T): T {
    const scope = effectSystem.getCurrentScope();

    if (!scope) {
        return factory();
    }

    const index = scope.hookIndex++;

    if (!scope.hooks[index]) {
        scope.hooks[index] = factory();
    }

    return scope.hooks[index] as T;
}

export const getEffectSystem = () => effectSystem;

/**
 * Runs fn without tracking any reactive reads inside it.
 * Signals read within fn will NOT subscribe the current effect.
 */
export function untrack<T>(fn: () => T): T {
    return effectSystem.untrack(fn);
}

export class AdaptiveObserver<T = any> implements ReactiveSource {
    private subscribers = new Set<Subscriber>();

    constructor(private value: T) {}

    get(): T {
        const currentEffect = effectSystem.getCurrentEffect();

        if (currentEffect && !effectSystem.isDisposed(currentEffect)) {
            this.subscribers.add(currentEffect);
            effectSystem.trackSource(currentEffect, this);
        }

        return this.value;
    }

    set(nextValue: T) {
        if (Object.is(this.value, nextValue)) return;

        this.value = nextValue;
        debugSignalLog("[signal:set]", nextValue, this.subscribers.size);

        const subscribers = [...this.subscribers];
        for (const subscriber of subscribers) {
            effectSystem.scheduleFromSource(subscriber, this);
        }
    }

    update(updater: (current: T) => T) {
        this.set(updater(this.value));
    }

    removeSubscriber(effect: EffectFn): void {
        this.subscribers.delete(effect);
    }
}

function createSignal<T>(initialValue: T): [() => T, ReactiveSetter<T>] {
    const observer = new AdaptiveObserver(initialValue);
    const getter = () => observer.get();
    const setter: ReactiveSetter<T> = (next: T | ((prev: T) => T)) => {
        if (typeof next === "function") {
            observer.update(next as (prev: T) => T);
        } else {
            observer.set(next);
        }
    };
    // The setter keeps a pointer to the exact source that owns the signal.
    // useReactiveEffect can use this metadata to ignore reschedules coming
    // from that source without affecting any other subscriber.
    setter.__adaptiveSource = observer;
    return [getter, setter];
}

function useState<T>(initialValue: T) {
    return useHookSlot(() => createSignal(initialValue));
}

export const useReactive = useState;


export type RefObject<T> = {
    current: T | null;
};

export function useRef<T = any>(initialValue: T | null = null): RefObject<T> {
    const scope = effectSystem.getCurrentScope();

    if (!scope) {
        return { current: initialValue };
    }

    const index = scope.hookIndex++;

    if (!scope.hooks[index]) {
        scope.hooks[index] = {
            current: initialValue
        };
    }

    return scope.hooks[index] as RefObject<T>;
}



export function createStore<T extends Record<string, any>>(initialState: T) {
    const store: any = {};
    for (const key in initialState) {
        store[key] = createSignal(initialState[key]);
    }
    return store as {
        [K in keyof T]: [() => T[K], ReactiveSetter<T[K]>];
    };
}



export function useEffect(effect: EffectFn, deps?: DependencyList): void {
    if (deps) {
        useEffectWithDeps(effect, deps);
        return;
    }

    useEffectWithDeps(effect, []);
}

export function useLayoutEffect(effect: EffectFn, deps?: DependencyList): void {
    if (deps) {
        useEffectWithDeps(effect, deps, "layout");
        return;
    }

    useEffectWithDeps(effect, [], "layout");
}

type EffectHookState = {
    runner: EffectFn;
    effect: EffectFn;
    deps?: DependencyList;
    initialized: boolean;
};

function resolveIgnoredSources(ignore?: ReactiveIgnoreTarget[]): ReactiveSource[] {
    if (!ignore || ignore.length === 0) {
        return [];
    }

    return ignore
        .map((setter) => setter.__adaptiveSource)
        .filter((source): source is ReactiveSource => Boolean(source));
}

function useScheduledEffect(
    effect: EffectFn,
    deps: DependencyList,
    options: ReactiveEffectOptions = {}
): void {
    const phase = options.phase ?? "effect";
    const ignoredSources = resolveIgnoredSources(options.ignore);

    if (activeHydrationCollection) {
        activeHydrationCollection.effectInstructions.push({
            kind: phase === "layout" ? "layout-effect" : "effect",
            effect,
            deps,
            ignoredSources
        });
        return;
    }

    if (isSSR()) return;

    const resolvedDeps = deps.map((dep) =>
        typeof dep === "function" ? dep() : dep
    );

    const hook = useHookSlot<EffectHookState>(() => {
        const state: EffectHookState = {
            effect,
            deps: undefined,
            initialized: false,
            runner: () => state.effect()
        };

        return state;
    });

    hook.effect = effect;
    effectSystem.setIgnoredSources(hook.runner, ignoredSources);
    effectSystem.setEffectPhase(
        hook.runner,
        phase
    );

    const changed =
        !hook.initialized ||
        !hook.deps ||
        hook.deps.length !== resolvedDeps.length ||
        resolvedDeps.some((dep, index) => !Object.is(dep, hook.deps![index]));

    if (!changed) return;

    hook.initialized = true;
    hook.deps = resolvedDeps;

    effectSystem.schedule(hook.runner, phase);
}

export function useEffectWithDeps(
    effect: EffectFn,
    deps: DependencyList,
    phase: EffectPhase = "effect"
): void {
    useScheduledEffect(effect, deps, { phase });
}

export const useEffectDep = useEffectWithDeps;

export function useReactiveEffect(
    effect: EffectFn,
    deps: DependencyList,
    options: ReactiveEffectOptions = {}
): void {
    // Limitations:
    // - ignore is source-based, not value-based
    // - it only skips re-schedules triggered by the listed setters
    // - reads/writes involving other signals can still re-run the effect
    // - this is opt-in and does not change useEffect/useLayoutEffect behavior
    useScheduledEffect(effect, deps, options);
}

export function useDOMEffect(effect: EffectFn): void {
    useEffect(() => {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", effect, { once: true });

            return () => {
                document.removeEventListener("DOMContentLoaded", effect);
            };
        }

        return effect();
    }, []);
}

export function useMemo<T>(compute: () => T, deps: DependencyList): () => T {
    const hook = useHookSlot<{
        value: [() => T, (value: T) => void];
        deps?: DependencyList;
        initialized: boolean;
    }>(() => ({
        value: createSignal(compute()),
        deps: undefined,
        initialized: false
    }));

    const resolvedDeps = deps.map((dep) =>
        typeof dep === "function" ? dep() : dep
    );

    const changed =
        !hook.initialized ||
        !hook.deps ||
        hook.deps.length !== resolvedDeps.length ||
        resolvedDeps.some((dep, index) => !Object.is(dep, hook.deps![index]));

    if (changed) {
        hook.initialized = true;
        hook.deps = resolvedDeps;
        hook.value[1](compute());
    }

    return hook.value[0];
}

export function useClientEffect(effect: EffectFn, deps: DependencyList = []): void {
    if (isSSR()) return;
    useEffectWithDeps(effect, deps);
}

export function batch<T>(fn: () => T): T {
    return effectSystem.batch(fn);
}

export function flushEffects(): void {
    effectSystem.flush();
}

export function createEffectScope(label?: string) {
    return effectSystem.createScope(label);
}

export function runWithEffectScope<T>(scope: ReturnType<typeof createEffectScope>, fn: () => T): T {
    return effectSystem.runWithScope(scope, fn);
}

export function cleanupEffectScope(scope: ReturnType<typeof createEffectScope>) {
    effectSystem.cleanupScope(scope);
}

export function cleanupAllEffects() {
    effectSystem.cleanupAll();
}

export function runHydrationCollection<T>(fn: () => T): {
    value: T;
    unsupportedFeatures: string[];
    effectInstructions: Array<{
        kind: "layout-effect" | "effect";
        effect: EffectFn;
        deps?: DependencyList;
        ignoredSources?: ReactiveSource[];
    }>;
} {
    const previousCollection = activeHydrationCollection;
    const state: HydrationCollectionState = {
        unsupportedFeatures: new Set<string>(),
        effectInstructions: []
    };
    activeHydrationCollection = state;
    try {
        return {
            value: fn(),
            unsupportedFeatures: Array.from(state.unsupportedFeatures),
            effectInstructions: [...state.effectInstructions]
        };
    } finally {
        activeHydrationCollection = previousCollection;
    }
}
