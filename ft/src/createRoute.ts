import { TSX5Node } from "./global";
import { renderToDOM } from "./hidrate.js";
import { backHydration, hydrateNavigation } from "./hidrate_app.js";
import { createElement } from "./jsx-runtime.js";
import { matchRoute, parseRoutePath } from "./matchRoute.js";

export type RouteComponent = (props?: { params?: Record<string, string> }) => TSX5Node;
export type RouteDefinition = {
  path: string;
  component: RouteComponent;
};

export type RouteModuleMap = Record<string, { default: RouteComponent } | RouteComponent>;

let routeModules: RouteModuleMap = {};

export function registerRouteModules(modules: RouteModuleMap) {
  routeModules = modules;
}

export const render = async (root: HTMLElement, modules?: RouteModuleMap) => {
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
  fast_push: (path: string) => hydrateNavigation(path),
  push: (path: string) => {
    window.location.href = path;
  },
  back: () => window.history.back(),
  fast_back: () => backHydration()
});

export function createRouterHidrate(modules?: RouteModuleMap) {
  const routes = createRoutesFromModules(modules ?? routeModules);
  return {
    routes,
    resolveRoute(pathname: string) {
      for (const route of routes) {
        const { matched, params } = matchRoute(route.path, pathname);
        if (matched) return { component: route.component, params };
      }
      return null;
    }
  };
}

export function createRouter(options: { test?: boolean; modules?: RouteModuleMap } = {}) {
  const routes = createRoutesFromModules(options.modules ?? routeModules);

  function resolveRoute(pathname: string) {
    for (const route of routes) {
      const { matched, params } = matchRoute(route.path, pathname);
      if (matched) return { component: route.component, params };
    }
    return null;
  }

  function renderCurrentRoute(): TSX5Node {
    const pathname = window.location.pathname.toLowerCase();
    const routeMatch = resolveRoute(pathname);
    if (!routeMatch) {
      return createElement("div", {}, "404 - Page not found");
    }
    return createElement(routeMatch.component, { params: routeMatch.params });
  }

  function navigateTo(path: string) {
    window.history.pushState({}, "", path);
  }

  return { routes, renderCurrentRoute, navigateTo };
}

function createRoutesFromModules(modules: RouteModuleMap): RouteDefinition[] {
  const routes: RouteDefinition[] = [];

  for (const filePath in modules) {
    const mod = modules[filePath] as any;
    const component = typeof mod === "function" ? mod : mod?.default;
    if (typeof component !== "function") continue;
    routes.push({ path: parseRoutePath(filePath), component });
  }

  return routes;
}
