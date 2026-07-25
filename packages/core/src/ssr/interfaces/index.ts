/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

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

export interface AdaptiveRouteRequest {
    headers: Headers | Record<string, string | string[] | undefined>;
    url?: string;
}

export interface AdaptiveRouteContext {
    params?: Record<string, string>;
    query?: Record<string, string>;
    request?: AdaptiveRouteRequest;
    appendSetCookie?: (header: string) => void;
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

export type AdaptiveMetadataResolver =
    | AdaptiveMetadata
    | ((context: AdaptiveMetadataContext) => AdaptiveMetadata | Promise<AdaptiveMetadata>);

export type RouteDefinition = {
    path: string;
    component: (props?: AdaptiveRouteContext) => any;
    clientEntry?: string;
    metadata?: AdaptiveMetadataResolver;
};
