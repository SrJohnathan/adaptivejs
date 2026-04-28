export const isSSR = () => typeof window === "undefined";
class EffectSystem {
	currentEffect = null;
	cleanups = new Map();
	dependencies = new WeakMap();
	queue = new Set();
	flushing = false;
	getCurrentEffect() {
		return this.currentEffect;
	}
	setCurrentEffect(effect) {
		this.currentEffect = effect;
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
	schedule(effect) {
		if (isSSR()) return;
		this.queue.add(effect);
		if (this.flushing) return;
		this.flushing = true;
		queueMicrotask(() => this.flush());
	}
	flush() {
		if (isSSR()) return;
		const effects = [...this.queue];
		this.queue.clear();
		this.flushing = false;
		for (const effect of effects) {
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
	cleanupAll() {
		for (const effect of this.cleanups.keys()) {
			this.runCleanup(effect);
		}
	}
}
const effectSystem = new EffectSystem();
export const getEffectSystem = () => effectSystem;
export class TSX5Observer {
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
	const observer = new TSX5Observer(initialValue);
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
export function createStore(initialState) {
	const store = {};
	for (const key in initialState) {
		store[key] = createSignal(initialState[key]);
	}
	return store;
}
export const useStateAlt = createStore;
export function useEffect(effect) {
	effectSystem.run(effect);
}
export function useEffectWithDeps(effect, deps) {
	if (isSSR()) return;
	const resolvedDeps = deps.map((dep) => typeof dep === "function" ? dep() : dep);
	if (effectSystem.haveDepsChanged(effect, resolvedDeps)) {
		effectSystem.setDependencies(effect, resolvedDeps);
		effectSystem.run(effect);
	}
}
export const useEffectDep = useEffectWithDeps;
export function useDOMEffect(effect) {
	if (isSSR()) return;
	const run = () => effectSystem.run(effect);
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
export function cleanupAllEffects() {
	effectSystem.cleanupAll();
}

//# sourceMappingURL=state.js.map
