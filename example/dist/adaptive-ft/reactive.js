import { getEffectSystem, isSSR, useEffectWithDeps } from "./state.js";
export function onLayoutEffect(effect) {
	if (isSSR()) return;
	getEffectSystem().run(effect);
}
export function onEffect(effect, deps) {
	useEffectWithDeps(effect, deps);
}
export function onStart(effect) {
	if (isSSR()) return;
	const run = () => {
		const cleanup = effect();
		if (typeof cleanup === "function") cleanup();
	};
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", run, { once: true });
	} else {
		run();
	}
}

//# sourceMappingURL=reactive.js.map
