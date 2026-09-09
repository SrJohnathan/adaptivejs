/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */


/**
 * Hydration bootstrap via JSON data island (não executa JS).
 * CSP script-src não bloqueia type="application/json".
 */

export const ADAPTIVE_HYDRATION_SCRIPT_ID = "__ADAPTIVE_HYDRATION__";

export interface AdaptiveHydrationPayload {
    route: string;
    params: Record<string, string>;
    query: Record<string, string>;
}

export function safeJsonForScript(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

export function buildHydrationPayloadHtml(payload: AdaptiveHydrationPayload): string {
    const body = safeJsonForScript({
        route: payload.route,
        params: payload.params ?? {},
        query: payload.query ?? {},
    });

    return (
        `<script type="application/json" id="${ADAPTIVE_HYDRATION_SCRIPT_ID}">` +
        body +
        `</script>`
    );
}

export type HydrationRoot = {
    querySelector(selectors: string): { textContent: string | null } | null;
};

function defaultBrowserRoot(): HydrationRoot | null {
    if (typeof globalThis === "undefined") return null;
    const doc = (globalThis as { document?: HydrationRoot }).document;
    return doc ?? null;
}

export function parseHydrationPayload(
    root: HydrationRoot | null | undefined = defaultBrowserRoot()
): AdaptiveHydrationPayload | null {
    if (!root) return null;

    const el = root.querySelector(`#${ADAPTIVE_HYDRATION_SCRIPT_ID}`);
    if (!el) return null;

    try {
        const data = JSON.parse(el.textContent ?? "") as Partial<AdaptiveHydrationPayload>;
        if (!data || typeof data !== "object") return null;
        return {
            route: typeof data.route === "string" ? data.route : "/",
            params:
                data.params && typeof data.params === "object" && !Array.isArray(data.params)
                    ? (data.params as Record<string, string>)
                    : {},
            query:
                data.query && typeof data.query === "object" && !Array.isArray(data.query)
                    ? (data.query as Record<string, string>)
                    : {},
        };
    } catch {
        return null;
    }
}

export function applyHydrationPayloadToWindow(
    root: HydrationRoot | null | undefined = defaultBrowserRoot()
): AdaptiveHydrationPayload | null {
    const payload = parseHydrationPayload(root);
    if (!payload) return null;

    const win = (globalThis as { window?: any }).window;
    if (win) {
        win.__ROUTE__ = payload.route;
        win.__PARAMS__ = payload.params;
        win.__QUERYS__ = payload.query;
    }
    return payload;
}

