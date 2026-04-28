import { Express, Request, Response } from "express";
export interface AdaptiveRequest extends Request {
}
export interface AdaptiveResponse extends Response {
}
export interface Plugin {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    callback: (req: AdaptiveRequest, res: AdaptiveResponse) => Promise<any> | void;
}
export interface ServerOptions {
    port?: number | string;
    base?: string;
    appDir?: string;
    sourceDir?: string;
    serverBuildDir?: string;
    clientBuildDir?: string;
    templatePath?: string;
    publicDir?: string;
    plugins?: Plugin[];
}
export type RouteDefinition = {
    path: string;
    component: (props?: {
        params?: Record<string, string>;
        querys?: Record<string, string>;
    }) => any;
    clientEntry?: string;
};
export declare function init_server(options?: ServerOptions): Promise<Express>;
export declare function createRouter(url: string, routes?: RouteDefinition[], options?: {
    isProduction?: boolean;
    sourceDir?: string;
    serverBuildDir?: string;
    clientBuildDir?: string;
}): Promise<{
    html: string;
    params: Record<string, string>;
    query: Record<string, string>;
    clientEntries: string[];
}>;
