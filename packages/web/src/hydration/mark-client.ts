/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import { CLIENT_COMPONENT_SYMBOL } from "./client-boundary.js";

export function markClientExport<T extends Function>(
    fn: T,
    moduleId: string,
    exportName: string,
    mode: "client" | "hydrate"
): T {
    (fn as any)[CLIENT_COMPONENT_SYMBOL] = { moduleId, exportName, mode };
    return fn;
}