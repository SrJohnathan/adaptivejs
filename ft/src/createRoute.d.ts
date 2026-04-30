import { TSX5Node } from "./global";
export type RouteComponent = (props?: {
    params?: Record<string, string>;
}) => TSX5Node;
export type RouteDefinition = {
    path: string;
    component: RouteComponent;
};
export type RouteModuleMap = Record<string, {
    default: RouteComponent;
} | RouteComponent>;
export type RouterQueryValue = string | number | boolean | null | undefined;
export type RouterQueryPatch = Record<string, RouterQueryValue>;
export declare function registerRouteModules(modules: RouteModuleMap): void;
export declare const render: (root: HTMLElement, modules?: RouteModuleMap) => Promise<void>;
export declare const useNavigation: () => {
    push: (path: string) => void;
    back: () => void;
};
export declare const useRouter: () => {
    fast_push: (path: string) => Promise<void>;
    push: (path: string) => void;
    back: () => void;
    fast_back: () => void;
    query: () => {
        [k: string]: string;
    };
    get_query: (key: string) => string | null;
    set_query: (key: string, value: RouterQueryValue, options?: {
        replace?: boolean;
    }) => string;
    patch_query: (patch: RouterQueryPatch, options?: {
        replace?: boolean;
    }) => string;
    remove_query: (keys: string | string[], options?: {
        replace?: boolean;
    }) => string;
};
export declare function createRouterHidrate(modules?: RouteModuleMap): {
    routes: RouteDefinition[];
    resolveRoute(pathname: string): {
        component: RouteComponent;
        params: Record<string, string> | undefined;
    } | null;
};
export declare function createRouter(options?: {
    test?: boolean;
    modules?: RouteModuleMap;
}): {
    routes: RouteDefinition[];
    renderCurrentRoute: () => TSX5Node;
    navigateTo: (path: string) => void;
};
