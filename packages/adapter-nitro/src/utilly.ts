/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */



import path from "node:path";

export function getAdaptiveRoot(appDir: string) {
    return path.join(appDir, ".adaptivejs");
}

export function getAdaptiveOutputDir(appDir: string) {
    return path.join(getAdaptiveRoot(appDir), "output");
}

export function getAdaptiveAdapterDir(appDir: string) {
    return path.join(getAdaptiveRoot(appDir), "adapters", "nitro");
}

export function getAdaptiveNitroCacheDir(appDir: string) {
    return path.join(getAdaptiveRoot(appDir), "cache", "nitro");
}
