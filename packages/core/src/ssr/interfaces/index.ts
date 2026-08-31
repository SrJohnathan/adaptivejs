/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

export {
    AdaptiveMetadata,
    AdaptiveMetadataContext,
    AdaptiveMetadataResolver,
    AdaptiveRouteContext
} from "@adaptive-js/shared";

export interface AdaptiveRouteRequest {
    headers: Headers | Record<string, string | string[] | undefined>;
    url?: string;
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



