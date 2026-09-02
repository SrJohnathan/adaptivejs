/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 *
 * events() — motor de efeitos reativos do Adaptive (módulo autônomo).
 *
 * API:
 *   events(() => { console.log(count()); return () => cleanup })
 *   events(() => {}, [dep])
 *   events(() => {}, [], { phase: "layout", ignore: [setX] })
 *   layoutEvents(() => {})
 *   batch(() => { setA(1); setB(2); })
 */

import { readServerContext } from "@adaptive-js/shared";

export type Cleanup = void | (() => void);
export type EffectFn = () => Cleanup;
export type DependencyList = any[];
export type EffectPhase = "layout" | "effect";

export type ReactiveSource = {
    removeSubscriber(effect: EffectFn): void;
};

export type ReactiveSetterLike = Function & {
    __adaptiveSource?: ReactiveSource;
};

export type EventsOptions = {
    ignore?: Array<ReactiveSetterLike | { __adaptiveSource?: ReactiveSource }>;
    phase?: EffectPhase;
};

export type EffectScope = {
    id: number;
    label?: string;
    context?: Map<symbol, any>;
    hooks: any[];
    hookIndex: number;
};

export const isSSR = (): boolean => typeof window === "undefined";

function isAdaptiveHydrationDebugEnabled() {
    if (!isSSR() && (window as any).__ADAPTIVE_DEBUG_HYDRATION__ === true) return true;
    return (globalThis as any)?.process?.env?.ADAPTIVE_PUBLIC_DEBUG_HYDRATION === "true";
}

function debugSignalLog(...args: any[]) {
    if (!isAdaptiveHydrationDebugEnabled()) return;
    console.log("[adaptive:hydration]", ...args);
}

// ---------------------------------------------------------------------------
// Hydration collection
// ---------------------------------------------------------------------------

export type EffectInstruction = {
    kind: "layout-effect" | "effect";
    effect: EffectFn;
    deps?: DependencyList;
    ignoredSources?: ReactiveSource[];
};

type HydrationCollectionState = {
    unsupportedFeatures: Set<string>;
    effectInstructions: EffectInstruction[];
};

let activeHydrationCollection: HydrationCollectionState | null = null;

export function runHydrationCollection<T>(fn: () => T): {
    value: T;
    unsupportedFeatures: string[];
    effectInstructions: EffectInstruction[];
} {
    const previous = activeHydrationCollection;
    const state: HydrationCollectionState = {
        unsupportedFeatures: new Set<string>(),
        effectInstructions: [],
    };
    activeHydrationCollection = state;
    try {
        return {
            value: fn(),
            unsupportedFeatures: Array.from(state.unsupportedFeatures),
            effectInstructions: [...state.effectInstructions],
        };
    } finally {
        activeHydrationCollection = previous;
    }
}

export function markUnsupportedFeature(name: string): void {
    activeHydrationCollection?.unsupportedFeatures.add(name);
    debugSignalLog("unsupported feature:", name);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class EventSystem {
    private currentEffect: EffectFn | null = null;
    private currentScope: EffectScope | null = null;

    private cleanups = new Map<EffectFn, Cleanup>();
    private effectSources = new Map<EffectFn, Set<ReactiveSource>>();
    private ignoredSources = new WeakMap<EffectFn, WeakSet<ReactiveSource>>();
    private effectPhases = new WeakMap<EffectFn, EffectPhase>();
    private effectScopes = new Map<EffectFn, EffectScope>();
    private disposedEffects = new WeakSet<EffectFn>();
    private pending = new WeakSet<EffectFn>();

    private layoutQueue = new Set<EffectFn>();
    private effectQueue = new Set<EffectFn>();
    private flushing = false;
    private batchDepth = 0;
    private nextScopeId = 1;

    // cache for no-scope effects to respect deps when effect ref is stable
    private noScopeCache = new Map<EffectFn, { deps?: DependencyList; runner: EffectFn }>();

    getCurrentEffect() { return this.currentEffect; }
    getCurrentScope() { return this.currentScope; }
    isDisposed(effect: EffectFn) { return this.disposedEffects.has(effect); }

    setCurrentEffect(effect: EffectFn | null) { this.currentEffect = effect; }

    createScope(label?: string): EffectScope {
        return { id: this.nextScopeId++, label, hooks: [], hookIndex: 0 };
    }

    runWithScope<T>(scope: EffectScope, fn: () => T): T {
        const prev = this.currentScope;
        const prevIndex = scope.hookIndex;
        this.currentScope = scope;
        scope.hookIndex = 0;
        try { return fn(); }
        finally {
            scope.hookIndex = prevIndex;
            this.currentScope = prev;
        }
    }

    // -- Context (Provider) -----------------------------------------------
    runWithContext<T>(ctxId: symbol, value: any, fn: () => T): T {
        const scope = this.currentScope;
        if (!scope) return fn();
        const previousContext = scope.context;
        const nextContext = new Map(previousContext ?? []);
        nextContext.set(ctxId, value);
        scope.context = nextContext;
        try { return fn(); }
        finally { scope.context = previousContext; }
    }

    readContext<T>(ctxId: symbol, defaultValue: T): T {
        const scope = this.currentScope;
        if (!scope?.context?.has(ctxId)) return defaultValue;
        return scope.context.get(ctxId);
    }

    // -- Tracking ----------------------------------------------------------
    trackSource(effect: EffectFn, source: ReactiveSource) {
        let set = this.effectSources.get(effect);
        if (!set) { set = new Set(); this.effectSources.set(effect, set); }
        set.add(source);
    }

    cleanupSources(effect: EffectFn) {
        const set = this.effectSources.get(effect);
        if (!set) return;
        for (const source of set) {
            try { source.removeSubscriber(effect); } catch {}
        }
        set.clear();
        this.effectSources.delete(effect);
    }

    runCleanup(effect: EffectFn) {
        const cleanup = this.cleanups.get(effect);
        if (typeof cleanup === "function") {
            try { cleanup(); } catch (error) { console.error("Adaptive cleanup error:", error); }
        }
        this.cleanups.delete(effect);
    }

    disposeEffect(effect: EffectFn) {
        this.layoutQueue.delete(effect);
        this.effectQueue.delete(effect);
        this.pending.delete(effect);
        this.runCleanup(effect);
        this.cleanupSources(effect);
        this.ignoredSources.delete(effect);
        this.effectPhases.delete(effect);
        this.effectScopes.delete(effect);
        this.disposedEffects.add(effect);
        // also clean from noScopeCache if it was the runner
        for (const [key, val] of this.noScopeCache) {
            if (val.runner === effect) { this.noScopeCache.delete(key); break; }
        }
    }

    registerCleanup(effect: EffectFn, cleanup: Cleanup) {
        if (typeof cleanup === "function") this.cleanups.set(effect, cleanup);
        else this.cleanups.delete(effect);
    }

    setIgnoredSources(effect: EffectFn, sources: ReactiveSource[] = []) {
        if (sources.length === 0) { this.ignoredSources.delete(effect); return; }
        const next = new WeakSet<ReactiveSource>();
        sources.forEach(s => next.add(s));
        this.ignoredSources.set(effect, next);
    }

    setEffectPhase(effect: EffectFn, phase: EffectPhase) {
        this.effectPhases.set(effect, phase);
    }

    shouldIgnoreTrigger(effect: EffectFn, source: ReactiveSource): boolean {
        const ignored = this.ignoredSources.get(effect);
        return ignored ? ignored.has(source) : false;
    }

    // -- Scheduling --------------------------------------------------------
    schedule(effect: EffectFn, phase: EffectPhase = "effect") {
        if (this.isDisposed(effect)) return;
        if (this.pending.has(effect)) return; // dedup

        // liga ao lifecycle: captura o scope atual no momento do agendamento
        // assim cleanupScope consegue dar dispose mesmo se flush rodar depois
        if (this.currentScope && !this.effectScopes.has(effect)) {
            this.effectScopes.set(effect, this.currentScope);
        }

        this.pending.add(effect);
        if (phase === "layout") this.layoutQueue.add(effect);
        else this.effectQueue.add(effect);
        if (this.batchDepth === 0) {
            // microtask flush to batch sync sets
            queueMicrotask(() => this.flush());
        }
    }

    scheduleFromSource(effect: EffectFn, source: ReactiveSource) {
        if (this.isDisposed(effect)) return;
        if (this.shouldIgnoreTrigger(effect, source)) {
            debugSignalLog("ignored trigger", effect, source);
            return;
        }
        const phase = this.effectPhases.get(effect) ?? "effect";
        this.schedule(effect, phase);
    }

    private executeEffect(effect: EffectFn) {
        if (this.isDisposed(effect)) return;
        const prev = this.currentEffect;
        this.currentEffect = effect;
        this.cleanupSources(effect);
        this.runCleanup(effect);
        // register scope if exists
        if (this.currentScope && !this.effectScopes.has(effect)) {
            this.effectScopes.set(effect, this.currentScope);
        }
        try {
            const result = effect();
            this.registerCleanup(effect, result);
        } catch (e) {
            console.error("Adaptive effect error:", e);
        } finally {
            this.currentEffect = prev;
        }
    }

    flush() {
        if (this.flushing) return;
        if (this.layoutQueue.size === 0 && this.effectQueue.size === 0) return;
        this.flushing = true;
        try {
            // layout first
            while (this.layoutQueue.size > 0) {
                const toRun = Array.from(this.layoutQueue);
                this.layoutQueue.clear();
                for (const eff of toRun) {
                    this.pending.delete(eff);
                    this.executeEffect(eff);
                }
            }
            // then effect
            while (this.effectQueue.size > 0) {
                const toRun = Array.from(this.effectQueue);
                this.effectQueue.clear();
                for (const eff of toRun) {
                    this.pending.delete(eff);
                    this.executeEffect(eff);
                }
            }
        } finally {
            this.flushing = false;
        }
    }

    batch<T>(fn: () => T): T {
        this.batchDepth++;
        try { return fn(); }
        finally {
            this.batchDepth--;
            if (this.batchDepth === 0) this.flush();
        }
    }

    untrack<T>(fn: () => T): T {
        const prev = this.currentEffect;
        this.currentEffect = null;
        try { return fn(); }
        finally { this.currentEffect = prev; }
    }

    // -- Scopes ------------------------------------------------------------
    cleanupScope(scope: EffectScope) {

        for (const [eff, effScope] of this.effectScopes.entries()) {
            if (effScope === scope) this.disposeEffect(eff) // <- roda cleanup do init
        }

        // reset init hooks
        for (const hook of scope.hooks) {
            if (!hook) continue;
            if (typeof hook === "object") {
                if ("scheduled" in hook) (hook as any).scheduled = false;
                if ("runner" in hook && (hook as any).runner) {
                    this.disposeEffect((hook as any).runner);
                }
                if ("dispose" in hook && typeof (hook as any).dispose === "function") {
                    try { (hook as any).dispose(); } catch {}
                }
                if ((hook as any).signal && Array.isArray((hook as any).signal)) {
                    // memo signal cleanup is handled via dispose above
                }
            }
        }
        scope.hooks.length = 0;
        scope.hookIndex = 0;
        scope.context = undefined;


    }

    cleanupAll() {
        for (const eff of Array.from(this.effectSources.keys())) {
            this.disposeEffect(eff);
        }
        this.layoutQueue.clear();
        this.effectQueue.clear();
        this.noScopeCache.clear();
    }

    // no-scope helpers
    getNoScopeEntry(effect: EffectFn) { return this.noScopeCache.get(effect); }
    setNoScopeEntry(effect: EffectFn, deps: DependencyList | undefined, runner: EffectFn) {
        this.noScopeCache.set(effect, { deps, runner });
    }
}

const system = new EventSystem();

// ---------------------------------------------------------------------------
// EventSource — signal core
// ---------------------------------------------------------------------------

export class EventSource<T> implements ReactiveSource {
    private subscribers = new Set<EffectFn>();
    private value: T;
    constructor(initial: T) { this.value = initial; }

    get(): T {
        const effect = system.getCurrentEffect();
        if (effect && !system.isDisposed(effect)) {
            this.subscribers.add(effect);
            system.trackSource(effect, this);
        }
        return this.value;
    }

    set(next: T) {
        if (Object.is(this.value, next)) return;
        this.value = next;
        debugSignalLog("set", next, "subs:", this.subscribers.size);
        for (const sub of [...this.subscribers]) system.scheduleFromSource(sub, this);
    }

    update(fn: (prev: T) => T) { this.set(fn(this.value)); }

    removeSubscriber(effect: EffectFn) { this.subscribers.delete(effect); }

    // for bridge
    _getSubscribers() { return this.subscribers; }
}


export function createEventSignal<T>(initial: T): [() => T, ((v: T | ((p: T) => T)) => void) & { __adaptiveSource: EventSource<T> }] {
    const source = new EventSource(initial);
    const get = () => source.get();
    const set = ((v: T | ((p: T) => T)) => {
        if (typeof v === "function") source.update(v as (p: T) => T);
        else source.set(v);
    }) as ((v: T | ((p: T) => T)) => void) & { __adaptiveSource: EventSource<T> };
    set.__adaptiveSource = source;
    return [get, set];
}

/** Bridge: signal legado avisa este motor no set(). */
export function notifyExternalSource(source: ReactiveSource, subscribers: Iterable<EffectFn>) {
    for (const effect of subscribers) system.scheduleFromSource(effect, source);
}

/** Bridge: signal legado assina no get() se houver effect ativo. */
export function trackExternalSource(effect: EffectFn, source: ReactiveSource) {
    system.trackSource(effect, source);
}

// ---------------------------------------------------------------------------
// Context API
// ---------------------------------------------------------------------------

export function runWithContext<T>(ctxId: symbol, value: any, fn: () => T): T {
    return system.runWithContext(ctxId, value, fn);
}

export function readContext<T>(ctxId: symbol, defaultValue: T): T {
    const value = system.readContext(ctxId, defaultValue);
    if (value !== defaultValue) return value;
    return readServerContext(ctxId, defaultValue);
}

// ---------------------------------------------------------------------------
// Hook slot
// ---------------------------------------------------------------------------

export function useHookSlot<T>(factory: () => T): T {
    const scope = system.getCurrentScope();
    if (!scope) return factory();
    const index = scope.hookIndex++;
    if (!scope.hooks[index]) scope.hooks[index] = factory();
    return scope.hooks[index] as T;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

function resolveIgnored(ignore?: EventsOptions["ignore"]): ReactiveSource[] {
    if (!ignore?.length) return [];
    return ignore.map(item => item.__adaptiveSource).filter((s): s is ReactiveSource => Boolean(s));
}

type HookState = {
    runner: EffectFn;
    effect: EffectFn;
    deps?: DependencyList;
    initialized: boolean;
};

function haveDepsChanged(prev: DependencyList | undefined, next: DependencyList): boolean {
    if (!prev) return true;
    if (prev.length !== next.length) return true;
    return next.some((d, i) => !Object.is(d, prev![i]));
}

export function events(effect: EffectFn, deps: DependencyList = [], options: EventsOptions = {}): void {
    const phase: EffectPhase = options.phase ?? "effect";
    const ignored = resolveIgnored(options.ignore);
    const resolvedDeps = deps.map(d => (typeof d === "function" ? d() : d));

    if (activeHydrationCollection) {
        activeHydrationCollection.effectInstructions.push({
            kind: phase === "layout" ? "layout-effect" : "effect",
            effect,
            deps: resolvedDeps,
            ignoredSources: ignored,
        });
        debugSignalLog("collect", phase, effect);
        return;
    }

    if (isSSR()) return;

    const scope = system.getCurrentScope();

    if (!scope) {
        // no-scope path: respect deps if same effect reference reused
        const cached = system.getNoScopeEntry(effect);
        if (cached && !haveDepsChanged(cached.deps, resolvedDeps)) {
            return; // deps equal, skip
        }
        const runner: EffectFn = () => effect();
        system.setIgnoredSources(runner, ignored);
        system.setEffectPhase(runner, phase);
        system.setNoScopeEntry(effect, resolvedDeps, runner);
        system.schedule(runner, phase);
        return;
    }

    const index = scope.hookIndex++;
    if (!scope.hooks[index]) {
        const state: HookState = {
            effect,
            deps: undefined,
            initialized: false,
            runner: () => state.effect(),
        };
        scope.hooks[index] = state;
    }

    const hook = scope.hooks[index] as HookState;
    hook.effect = effect;
    system.setIgnoredSources(hook.runner, ignored);
    system.setEffectPhase(hook.runner, phase);

    if (hook.initialized && !haveDepsChanged(hook.deps, resolvedDeps)) return;

    hook.initialized = true;
    hook.deps = resolvedDeps;
    system.schedule(hook.runner, phase);
}

export function layoutEvents(effect: EffectFn, deps: DependencyList = [], options: Omit<EventsOptions, "phase"> = {}): void {
    events(effect, deps, { ...options, phase: "layout" });
}

export function batch<T>(fn: () => T): T { return system.batch(fn); }
export function flushEvents(): void { system.flush(); }
export function flushEffects(): void { system.flush(); } // alias compat
export function untrack<T>(fn: () => T): T { return system.untrack(fn); }

export function createEventsScope(label?: string) { return system.createScope(label); }
export function createEffectScope(label?: string) { return system.createScope(label); } // compat
export function runWithEventsScope<T>(scope: EffectScope, fn: () => T): T { return system.runWithScope(scope, fn); }
export function runWithEffectScope<T>(scope: EffectScope, fn: () => T): T { return system.runWithScope(scope, fn); }
export function cleanupEventsScope(scope: EffectScope) { system.cleanupScope(scope); }
export function cleanupEffectScope(scope: EffectScope) { system.cleanupScope(scope); }
export function cleanupAllEvents() { system.cleanupAll(); }
export function cleanupAllEffects() { system.cleanupAll(); }

export function getEventsSystem() { return system; }
export { debugSignalLog, isAdaptiveHydrationDebugEnabled };

// ---------------------------------------------------------------------------
// Aliases de compatibilidade com o index.ts antigo (pra poder apagar index)
// ---------------------------------------------------------------------------

export function createReactiveEffect(
    effect: EffectFn,
    phase: EffectPhase = "layout",
    options: Pick<EventsOptions, "ignore"> = {}
): () => void {
    const runner: EffectFn = () => effect();
    system.setIgnoredSources(runner, resolveIgnored(options.ignore));
    system.setEffectPhase(runner, phase);
    system.schedule(runner, phase);

    return () => {
        system.disposeEffect(runner);
    };
}


export type ReactiveSetter<T> = {
    (value: T | ((prev: T) => T)): void;
    __adaptiveSource?: ReactiveSource;
};
export type Subscriber = EffectFn;