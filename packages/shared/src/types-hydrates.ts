/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

export const CLIENT_COMPONENT_SYMBOL = Symbol.for("adaptive.client_component");

export type ClientMetadata = {
    moduleId: string;
    exportName: string;
    mode:string
};

export type ClientComponentFunction = ((props?: Record<string, any>) => any) & {
    [CLIENT_COMPONENT_SYMBOL]?: ClientMetadata;
};

export function getClientComponentMetadata(
    value: unknown
): ClientMetadata | null {
    if (typeof value !== "function") return null;
    const meta = (value as ClientComponentFunction)[CLIENT_COMPONENT_SYMBOL];
    return meta ?? null;
}
