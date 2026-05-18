/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

export function toCssPropertyName(styleKey: string) {
    return styleKey.replace(/([A-Z])/g, "-$1").toLowerCase();
}

export function resolveStyleEntries(style: Record<string, any> | (() => Record<string, any>) | null | undefined) {
    const resolved = typeof style === "function" ? style() : style;

    if (!resolved || typeof resolved !== "object") {
        return [] as Array<[string, any]>;
    }

    return Object.entries(resolved).flatMap(([styleKey, styleValue]) => {
        const value = typeof styleValue === "function" ? styleValue() : styleValue;

        if (value == null || value === false) {
            return [];
        }

        return [[styleKey, value] as [string, any]];
    });
}

export function serializeStyleLike(style: Record<string, any> | (() => Record<string, any>) | null | undefined) {
    return resolveStyleEntries(style)
        .map(([styleKey, styleValue]) => `${toCssPropertyName(styleKey)}:${styleValue}`)
        .join(";");
}
