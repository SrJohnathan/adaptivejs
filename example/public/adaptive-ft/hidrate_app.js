import { createRouterHidrate } from "./createRoute.js";
import { hydrate } from "./hidrate.js";
import { createElement } from "./jsx-runtime.js";
import { cleanupAllEffects } from "./state.js";
import { config, logger } from "./logging_configuration.js";
export const hydrateApp = () => {
	const root = document.getElementById("root");
	if (!root) {
		throw new Error("Element with id 'root' was not found.");
	}
	const mountRoot = root;
	function doHydration() {
		const path = window.__ROUTE__ || window.location.pathname.toLowerCase();
		const { resolveRoute } = createRouterHidrate();
		const routeMatch = resolveRoute(path);
		try {
			const vnode = routeMatch ? createElement(routeMatch.component, { params: routeMatch.params }) : createElement("div", {}, "404 - Page not found");
			hydrate(mountRoot, () => vnode);
			logger.info("Adaptive hydration completed");
		} catch (error) {
			logger.error("Adaptive hydration failed", error);
		}
	}
	window.addEventListener("popstate", doHydration);
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", doHydration, { once: true });
	} else {
		doHydration();
	}
	cleanupAllEffects();
	return {
		forceHydration: doHydration,
		getConfig: () => ({ ...config })
	};
};
async function navigateAndHydrate(path) {
	const root = document.getElementById("root");
	if (!root) throw new Error("Element 'root' not found.");
	const mountRoot = root;
	const response = await fetch(path, { headers: { "X-Requested-With": "Adaptive-SSR" } });
	if (!response.ok) {
		throw new Error(`Navigation failed with status ${response.status}`);
	}
	mountRoot.innerHTML = await response.text();
	const { resolveRoute } = createRouterHidrate();
	const routeMatch = resolveRoute(path.toLowerCase());
	const vnode = routeMatch ? createElement(routeMatch.component, { params: routeMatch.params }) : createElement("div", {}, "404 - Page not found");
	hydrate(mountRoot, () => vnode);
	window.history.pushState({}, "", path);
}
export const hydrateNavigation = navigateAndHydrate;
export const popStateNavigation = () => navigateAndHydrate(window.location.pathname);
export const backHydration = () => window.history.back();

//# sourceMappingURL=hidrate_app.js.map
