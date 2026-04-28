export declare function parseRoutePathServer(filePath: string): string;
export declare function matchRouteServer(routePath: string, pathname: string): {
    matched: boolean;
    params?: Record<string, string>;
};
