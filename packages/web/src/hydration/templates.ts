/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

// $s — reactive style string
export function $s(strings: TemplateStringsArray, ...parts: any[]): () => string {
    return () =>
        strings.reduce((acc, str, i) => {
            const part = parts[i];
            return acc + str + (i < parts.length
                ? (typeof part === "function" ? part() : part ?? "")
                : "");
        }, "");
}