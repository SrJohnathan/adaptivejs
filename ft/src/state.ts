type Subscriber = () => void;
type Cleanup = void | (() => void);
type EffectFn = () => Cleanup;
type DependencyList = any[];
type EffectPhase = "layout" | "effect";
type EffectScope = {
  id: number;
  label?: string;
};

export const isSSR = (): boolean => typeof window === "undefined";

class EffectSystem {
  private currentEffect: EffectFn | null = null;
  private currentScope: EffectScope | null = null;
  private cleanups = new Map<EffectFn, Cleanup>();
  private dependencies = new WeakMap<EffectFn, DependencyList>();
  private layoutQueue = new Set<EffectFn>();
  private effectQueue = new Set<EffectFn>();
  private pending = new WeakSet<EffectFn>();
  private flushing = false;
  private nextScopeId = 1;
  private effectScopes = new Map<EffectFn, EffectScope>();

  getCurrentEffect(): EffectFn | null {
    return this.currentEffect;
  }

  setCurrentEffect(effect: EffectFn | null) {
    this.currentEffect = effect;
  }

  createScope(label?: string): EffectScope {
    return {
      id: this.nextScopeId++,
      label
    };
  }

  runWithScope<T>(scope: EffectScope, fn: () => T): T {
    const previousScope = this.currentScope;
    this.currentScope = scope;
    try {
      return fn();
    } finally {
      this.currentScope = previousScope;
    }
  }

  registerEffectScope(effect: EffectFn) {
    if (this.currentScope) {
      this.effectScopes.set(effect, this.currentScope);
    }
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

  registerCleanup(effect: EffectFn, cleanup: Cleanup) {
    this.cleanups.set(effect, cleanup);
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

  schedule(effect: EffectFn, phase: EffectPhase = "effect") {
    if (isSSR()) return;
    this.registerEffectScope(effect);
    if (this.pending.has(effect)) return;
    this.pending.add(effect);
    if (phase === "layout") {
      this.layoutQueue.add(effect);
    } else {
      this.effectQueue.add(effect);
    }
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => this.flush());
  }

  flush() {
    if (isSSR()) return;
    const layoutEffects = [...this.layoutQueue];
    const effects = [...this.effectQueue];
    this.layoutQueue.clear();
    this.effectQueue.clear();
    this.flushing = false;
    for (const effect of layoutEffects) {
      this.pending.delete(effect);
      this.run(effect);
    }
    for (const effect of effects) {
      this.pending.delete(effect);
      this.run(effect);
    }
  }

  run(effect: EffectFn) {
    if (isSSR()) return;
    this.runCleanup(effect);
    try {
      this.setCurrentEffect(effect);
      const cleanup = effect();
      this.registerCleanup(effect, cleanup);
    } catch (error) {
      console.error("Adaptive effect error:", error);
    } finally {
      this.setCurrentEffect(null);
    }
  }

  cleanupScope(scope: EffectScope) {
    const pendingEffects: EffectFn[] = [];

    for (const effect of this.effectScopes.keys()) {
      const effectScope = this.effectScopes.get(effect);
      if (!effectScope || effectScope.id !== scope.id) continue;
      pendingEffects.push(effect);
    }

    for (const effect of pendingEffects) {
      this.layoutQueue.delete(effect);
      this.effectQueue.delete(effect);
      this.runCleanup(effect);
      this.effectScopes.delete(effect);
    }
  }

  cleanupAll() {
    const effects = [...this.cleanups.keys()];
    for (const effect of effects) {
      this.runCleanup(effect);
    }
    this.effectScopes.clear();
    this.layoutQueue.clear();
    this.effectQueue.clear();
  }
}

const effectSystem = new EffectSystem();
export const getEffectSystem = () => effectSystem;

export class AdaptiveObserver<T = any> {
  private subscribers = new Set<Subscriber>();

  constructor(private value: T) {}

  get(): T {
    const currentEffect = effectSystem.getCurrentEffect();
    if (currentEffect) {
      this.subscribers.add(currentEffect);
    }
    return this.value;
  }

  set(nextValue: T) {
    if (Object.is(this.value, nextValue)) return;
    this.value = nextValue;
    for (const subscriber of this.subscribers) {
      effectSystem.schedule(subscriber);
    }
  }

  update(updater: (current: T) => T) {
    this.set(updater(this.value));
  }
}

function createSignal<T>(initialValue: T): [() => T, (value: T | ((prev: T) => T)) => void] {
  const observer = new AdaptiveObserver(initialValue);
  const getter = () => observer.get();
  const setter = (next: T | ((prev: T) => T)) => {
    if (typeof next === "function") {
      observer.update(next as (prev: T) => T);
    } else {
      observer.set(next);
    }
  };
  return [getter, setter];
}

export function useState<T>(initialValue: T) {
  return createSignal(initialValue);
}

export const useReactive = useState;

export function createStore<T extends Record<string, any>>(initialState: T) {
  const store: any = {};
  for (const key in initialState) {
    store[key] = createSignal(initialState[key]);
  }
  return store as {
    [K in keyof T]: [() => T[K], (value: T[K] | ((prev: T[K]) => T[K])) => void];
  };
}

export const useReactiveStore = createStore;
export const useStateAlt = createStore;
export const TSX5Observer = AdaptiveObserver;

export function useEffect(effect: EffectFn, deps?: DependencyList): void {
  if (isSSR()) return;

  if (deps) {
    useEffectWithDeps(effect, deps);
    return;
  }

  effectSystem.schedule(effect);
}

export function useLayoutEffect(effect: EffectFn, deps?: DependencyList): void {
  if (isSSR()) return;

  if (deps) {
    useEffectWithDeps(effect, deps, "layout");
    return;
  }

  effectSystem.schedule(effect, "layout");
}

export function useEffectWithDeps(effect: EffectFn, deps: DependencyList, phase: EffectPhase = "effect"): void {
  if (isSSR()) return;
  const resolvedDeps = deps.map((dep) => (typeof dep === "function" ? dep() : dep));
  if (effectSystem.haveDepsChanged(effect, resolvedDeps)) {
    effectSystem.setDependencies(effect, resolvedDeps);
    effectSystem.schedule(effect, phase);
  }
}

export const useEffectDep = useEffectWithDeps;

export function useDOMEffect(effect: EffectFn): void {
  if (isSSR()) return;
  const run = () => effectSystem.schedule(effect);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}

export function useMemo<T>(compute: () => T, deps: DependencyList): () => T {
  const [getValue, setValue] = createSignal(compute());
  useEffectWithDeps(() => {
    setValue(compute());
  }, deps);
  return getValue;
}

export function useClientEffect(effect: EffectFn, deps: DependencyList = []): void {
  if (isSSR()) return;
  useEffectWithDeps(effect, deps);
}

export function batch(fn: () => void): void {
  fn();
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
