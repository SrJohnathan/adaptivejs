import { createRouterHidrate } from "./createRoute.js";
import { cleanupClientComponentScopes } from "./client-component.js";
import { hydrate } from "./hidrate.js";
import { createElement } from "./jsx-runtime.js";
import { cleanupEffectScope, createEffectScope, runWithEffectScope } from "./state.js";
import { config, logger } from "./logging_configuration.js";
const loadedClientEntries = new Set();
let activeHydrationScope = createEffectScope("route:bootstrap");
export const hydrateApp = () => {
	const root = document.getElementById("root");
	if (!root) {
		throw new Error("Element with id 'root' was not found.");
	}
	const mountRoot = root;
	activeHydrationScope = createEffectScope(`route:${window.__ROUTE__ || window.location.pathname.toLowerCase()}`);
	function doHydration() {
		const path = window.__ROUTE__ || window.location.pathname.toLowerCase();
		const { resolveRoute } = createRouterHidrate();
		const routeMatch = resolveRoute(path);
		try {
			const vnode = routeMatch ? createElement(routeMatch.component, { params: routeMatch.params }) : createElement("div", {}, "404 - Page not found");
			cleanupClientComponentScopes(mountRoot);
			cleanupEffectScope(activeHydrationScope);
			activeHydrationScope = createEffectScope(`route:${path}`);
			runWithEffectScope(activeHydrationScope, () => hydrate(mountRoot, () => vnode));
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
	const html = await response.text();
	const parsed = parseHydrationResponse(html, path);
	await loadClientEntries(parsed.clientEntries);
	mountRoot.innerHTML = parsed.rootHtml;
	const { resolveRoute } = createRouterHidrate();
	const routeMatch = resolveRoute(parsed.route.toLowerCase());
	const vnode = routeMatch ? createElement(routeMatch.component, { params: routeMatch.params }) : createElement("div", {}, "404 - Page not found");
	window.__ROUTE__ = parsed.route;
	window.__PARAMS__ = routeMatch?.params ?? {};
	window.__QUERYS__ = parsed.query;
	cleanupClientComponentScopes(mountRoot);
	cleanupEffectScope(activeHydrationScope);
	activeHydrationScope = createEffectScope(`route:${parsed.route}`);
	runWithEffectScope(activeHydrationScope, () => hydrate(mountRoot, () => vnode));
	window.history.pushState({}, "", path);
}
export const hydrateNavigation = navigateAndHydrate;
export const popStateNavigation = () => navigateAndHydrate(window.location.pathname);
export const backHydration = () => window.history.back();
function parseHydrationResponse(html, requestedPath) {
	const parser = new DOMParser();
	const documentNode = parser.parseFromString(html, "text/html");
	const parsedRoot = documentNode.getElementById("root");
	const route = readInjectedRoute(documentNode) ?? window.location.pathname;
	const query = Object.fromEntries(new URL(requestedPath, window.location.origin).searchParams.entries());
	const clientEntries = Array.from(documentNode.querySelectorAll("script[type=\"module\"][src]")).map((script) => script.getAttribute("src")).filter((value) => Boolean(value));
	return {
		route,
		query,
		clientEntries,
		rootHtml: parsedRoot?.innerHTML ?? html
	};
}
function readInjectedRoute(documentNode) {
	for (const script of Array.from(documentNode.scripts)) {
		const content = script.textContent ?? "";
		const match = content.match(/window\.__ROUTE__=("[^"]*"|'[^']*')/);
		if (!match) continue;
		try {
			return JSON.parse(match[1]);
		} catch {
			return match[1].slice(1, -1);
		}
	}
	return null;
}
async function loadClientEntries(entries) {
	for (const entry of entries) {
		const resolvedUrl = new URL(entry, window.location.origin).href;
		if (loadedClientEntries.has(resolvedUrl)) {
			continue;
		}
		await import(
			/* @vite-ignore */
			resolvedUrl
);
		loadedClientEntries.add(resolvedUrl);
	}
}

//# sourceMappingURL=hidrate_app.js.map
