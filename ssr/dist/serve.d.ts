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
export interface AdaptiveMetadataContext {
    url: string;
    pathname: string;
    params: Record<string, string>;
    query: Record<string, string>;
}
export interface AdaptiveOpenGraphMetadata {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    siteName?: string;
    locale?: string;
}
export interface AdaptiveTwitterMetadata {
    card?: string;
    title?: string;
    description?: string;
    image?: string;
    site?: string;
    creator?: string;
}
export interface AdaptiveMetadata {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    canonical?: string;
    siteName?: string;
    locale?: string;
    type?: string;
    themeColor?: string;
    robots?: string;
    keywords?: string[] | string;
    openGraph?: AdaptiveOpenGraphMetadata;
    twitter?: AdaptiveTwitterMetadata;
}
export type AdaptiveMetadataResolver = AdaptiveMetadata | ((context: AdaptiveMetadataContext) => AdaptiveMetadata | Promise<AdaptiveMetadata>);
export type RouteDefinition = {
    path: string;
    component: (props?: {
        params?: Record<string, string>;
        querys?: Record<string, string>;
    }) => any;
    clientEntry?: string;
    metadata?: AdaptiveMetadataResolver;
};
export declare function init_server(options?: ServerOptions): Promise<Express>;
export declare function createRouter(url: string, routes?: RouteDefinition[], options?: {
    isProduction?: boolean;
    sourceDir?: string;
    serverBuildDir?: string;
    clientBuildDir?: string;
}): Promise<{
    html: string;
    params: {};
    query: {};
    clientEntries: never[];
    metadata?: undefined;
} | {
    html: string;
    params: Record<string, string>;
    query: Record<string, string>;
    metadata: AdaptiveMetadata | null;
    clientEntries: string[];
}>;
