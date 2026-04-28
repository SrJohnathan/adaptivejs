import { renderToDOM } from "./hidrate.js";
import { backHydration, hydrateNavigation } from "./hidrate_app.js";
import { createElement } from "./jsx-runtime.js";
import { matchRoute, parseRoutePath } from "./matchRoute.js";
let routeModules = {};
export function registerRouteModules(modules) {
	routeModules = modules;
}
export const render = async (root, modules) => {
	const { renderCurrentRoute } = createRouter({ modules });
	function renderApp() {
		if (!root) return;
		root.replaceChildren(renderToDOM(renderCurrentRoute()));
	}
	window.addEventListener("popstate", renderApp);
	renderApp();
};
export const useNavigation = () => {
	const { navigateTo } = createRouter();
	return {
		push: navigateTo,
		back: () => window.history.back()
	};
};
export const useRouter = () => ({
	fast_push: (path) => hydrateNavigation(path),
	push: (path) => {
		window.location.href = path;
	},
	back: () => window.history.back(),
	fast_back: () => backHydration()
});
export function createRouterHidrate(modules) {
	const routes = createRoutesFromModules(modules ?? routeModules);
	return {
		routes,
		resolveRoute(pathname) {
			for (const route of routes) {
				const { matched, params } = matchRoute(route.path, pathname);
				if (matched) return {
					component: route.component,
					params
				};
			}
			return null;
		}
	};
}
export function createRouter(options = {}) {
	const routes = createRoutesFromModules(options.modules ?? routeModules);
	function resolveRoute(pathname) {
		for (const route of routes) {
			const { matched, params } = matchRoute(route.path, pathname);
			if (matched) return {
				component: route.component,
				params
			};
		}
		return null;
	}
	function renderCurrentRoute() {
		const pathname = window.location.pathname.toLowerCase();
		const routeMatch = resolveRoute(pathname);
		if (!routeMatch) {
			return createElement("div", {}, "404 - Page not found");
		}
		return createElement(routeMatch.component, { params: routeMatch.params });
	}
	function navigateTo(path) {
		window.history.pushState({}, "", path);
	}
	return {
		routes,
		renderCurrentRoute,
		navigateTo
	};
}
function createRoutesFromModules(modules) {
	const routes = [];
	for (const filePath in modules) {
		const mod = modules[filePath];
		const component = typeof mod === "function" ? mod : mod?.default;
		if (typeof component !== "function") continue;
		routes.push({
			path: parseRoutePath(filePath),
			component
		});
	}
	return routes;
}

//# sourceMappingURL=createRoute.js.map
