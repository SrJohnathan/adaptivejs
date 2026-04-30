import { renderToDOM } from "./hidrate.js";
import { backHydration, hydrateNavigation } from "./hidrate_app.js";
import { createElement } from "./jsx-runtime.js";
import { matchRoute, parseRoutePath } from "./matchRoute.js";
import { createStore } from "./state.js";
let routeModules = {};
const routerRuntimeStore = createStore({
	pathname: "/",
	search: "",
	query: {}
});
if (typeof window !== "undefined") {
	syncRouterRuntimeStore();
}
export function registerRouteModules(modules) {
	routeModules = modules;
}
export const render = async (root, modules) => {
	const { renderCurrentRoute } = createRouter({ modules });
	function renderApp() {
		if (!root) return;
		syncRouterRuntimeStore();
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
		if (typeof window === "undefined") return;
		window.location.href = path;
	},
	back: () => {
		if (typeof window === "undefined") return;
		window.history.back();
	},
	fast_back: () => {
		if (typeof window === "undefined") return;
		backHydration();
	},
	query: () => {
		return routerRuntimeStore.query[0]();
	},
	get_query: (key) => {
		return routerRuntimeStore.query[0]()[key] ?? null;
	},
	set_query: (key, value, options = {}) => {
		if (typeof window === "undefined") return "";
		const url = new URL(window.location.href);
		if (value === undefined || value === null || value === "") {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, String(value));
		}
		if (options.replace) {
			window.history.replaceState({}, "", url.toString());
		} else {
			window.history.pushState({}, "", url.toString());
		}
		syncRouterRuntimeStore();
		return url.toString();
	},
	patch_query: (patch, options = {}) => {
		if (typeof window === "undefined") return "";
		const url = new URL(window.location.href);
		for (const [key, value] of Object.entries(patch)) {
			if (value === undefined || value === null || value === "") {
				url.searchParams.delete(key);
			} else {
				url.searchParams.set(key, String(value));
			}
		}
		if (options.replace) {
			window.history.replaceState({}, "", url.toString());
		} else {
			window.history.pushState({}, "", url.toString());
		}
		syncRouterRuntimeStore();
		return url.toString();
	},
	remove_query: (keys, options = {}) => {
		if (typeof window === "undefined") return "";
		const url = new URL(window.location.href);
		for (const key of Array.isArray(keys) ? keys : [keys]) {
			url.searchParams.delete(key);
		}
		if (options.replace) {
			window.history.replaceState({}, "", url.toString());
		} else {
			window.history.pushState({}, "", url.toString());
		}
		syncRouterRuntimeStore();
		return url.toString();
	}
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
		syncRouterRuntimeStore();
	}
	return {
		routes,
		renderCurrentRoute,
		navigateTo
	};
}
function syncRouterRuntimeStore() {
	const state = readRouterRuntimeState();
	routerRuntimeStore.pathname[1](state.pathname);
	routerRuntimeStore.search[1](state.search);
	routerRuntimeStore.query[1](state.query);
}
function readRouterRuntimeState() {
	if (typeof window === "undefined") {
		return {
			pathname: "/",
			search: "",
			query: {}
		};
	}
	const url = new URL(window.location.href);
	return {
		pathname: url.pathname,
		search: url.search,
		query: Object.fromEntries(url.searchParams.entries())
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
