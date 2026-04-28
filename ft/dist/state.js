export const isSSR = () => typeof window === "undefined";
class EffectSystem {
	currentEffect = null;
	currentScope = null;
	cleanups = new Map();
	dependencies = new WeakMap();
	layoutQueue = new Set();
	effectQueue = new Set();
	pending = new WeakSet();
	flushing = false;
	nextScopeId = 1;
	effectScopes = new Map();
	getCurrentEffect() {
		return this.currentEffect;
	}
	setCurrentEffect(effect) {
		this.currentEffect = effect;
	}
	createScope(label) {
		return {
			id: this.nextScopeId++,
			label
		};
	}
	runWithScope(scope, fn) {
		const previousScope = this.currentScope;
		this.currentScope = scope;
		try {
			return fn();
		} finally {
			this.currentScope = previousScope;
		}
	}
	registerEffectScope(effect) {
		if (this.currentScope) {
			this.effectScopes.set(effect, this.currentScope);
		}
	}
	runCleanup(effect) {
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
	registerCleanup(effect, cleanup) {
		this.cleanups.set(effect, cleanup);
	}
	haveDepsChanged(effect, deps) {
		const previous = this.dependencies.get(effect);
		if (!previous) return true;
		if (previous.length !== deps.length) return true;
		return deps.some((dep, index) => !Object.is(dep, previous[index]));
	}
	setDependencies(effect, deps) {
		this.dependencies.set(effect, deps);
	}
	schedule(effect, phase = "effect") {
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
	run(effect) {
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
	cleanupScope(scope) {
		const pendingEffects = [];
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
export class AdaptiveObserver {
	subscribers = new Set();
	constructor(value) {
		this.value = value;
	}
	get() {
		const currentEffect = effectSystem.getCurrentEffect();
		if (currentEffect) {
			this.subscribers.add(currentEffect);
		}
		return this.value;
	}
	set(nextValue) {
		if (Object.is(this.value, nextValue)) return;
		this.value = nextValue;
		for (const subscriber of this.subscribers) {
			effectSystem.schedule(subscriber);
		}
	}
	update(updater) {
		this.set(updater(this.value));
	}
}
function createSignal(initialValue) {
	const observer = new AdaptiveObserver(initialValue);
	const getter = () => observer.get();
	const setter = (next) => {
		if (typeof next === "function") {
			observer.update(next);
		} else {
			observer.set(next);
		}
	};
	return [getter, setter];
}
export function useState(initialValue) {
	return createSignal(initialValue);
}
export const useReactive = useState;
export function createStore(initialState) {
	const store = {};
	for (const key in initialState) {
		store[key] = createSignal(initialState[key]);
	}
	return store;
}
export const useReactiveStore = createStore;
export const useStateAlt = createStore;
export const TSX5Observer = AdaptiveObserver;
export function useEffect(effect, deps) {
	if (isSSR()) return;
	if (deps) {
		useEffectWithDeps(effect, deps);
		return;
	}
	effectSystem.schedule(effect);
}
export function useLayoutEffect(effect, deps) {
	if (isSSR()) return;
	if (deps) {
		useEffectWithDeps(effect, deps, "layout");
		return;
	}
	effectSystem.schedule(effect, "layout");
}
export function useEffectWithDeps(effect, deps, phase = "effect") {
	if (isSSR()) return;
	const resolvedDeps = deps.map((dep) => typeof dep === "function" ? dep() : dep);
	if (effectSystem.haveDepsChanged(effect, resolvedDeps)) {
		effectSystem.setDependencies(effect, resolvedDeps);
		effectSystem.schedule(effect, phase);
	}
}
export const useEffectDep = useEffectWithDeps;
export function useDOMEffect(effect) {
	if (isSSR()) return;
	const run = () => effectSystem.schedule(effect);
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", run, { once: true });
	} else {
		run();
	}
}
export function useMemo(compute, deps) {
	const [getValue, setValue] = createSignal(compute());
	useEffectWithDeps(() => {
		setValue(compute());
	}, deps);
	return getValue;
}
export function useClientEffect(effect, deps = []) {
	if (isSSR()) return;
	useEffectWithDeps(effect, deps);
}
export function batch(fn) {
	fn();
	effectSystem.flush();
}
export function createEffectScope(label) {
	return effectSystem.createScope(label);
}
export function runWithEffectScope(scope, fn) {
	return effectSystem.runWithScope(scope, fn);
}
export function cleanupEffectScope(scope) {
	effectSystem.cleanupScope(scope);
}
export function cleanupAllEffects() {
	effectSystem.cleanupAll();
}

//# sourceMappingURL=state.js.map
