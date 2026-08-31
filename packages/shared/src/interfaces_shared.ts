/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */



export interface AdaptiveMetadataContext {
    url: string;
    pathname: string;
    params: Record<string, string>;
    query: Record<string, string>;
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
    openGraph?: any;
    twitter?: any;
}

export type AdaptiveMetadataResolver =
    | AdaptiveMetadata
    | ((context: AdaptiveMetadataContext) => AdaptiveMetadata | Promise<AdaptiveMetadata>);

export interface AdaptiveRouteContext {
    params?: Record<string, string>;
    query?: Record<string, string>;
    request?: any;
    appendSetCookie?: (header: string) => void;
}

export type RouteDefinition = {
    path: string;
    component: (props?: AdaptiveRouteContext) => any;
    clientEntry?: string;
    metadata?: AdaptiveMetadataResolver;
};
