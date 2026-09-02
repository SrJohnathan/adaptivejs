/*
 * Licensed under the MIT License.
 *
 * Bloco reativo com estabilidade por key (on/off).
 * Versão corrigida: extrai key de vnode.key OU props.key
 */

import {
    cleanupEffectScope,
    createEffectScope,
    runWithEffectScope,
} from "../reactive/index.js";
import { createReactiveEffect } from "../reactive/events.js";

export type RenderToDOM = (vnode: any, namespace: string | null) => Node;

/**
 * Extrai key de um vnode Adaptive.
 * Em Adaptive/JSX a key pode estar em:
 * - vnode.key (padrão React-like)
 * - vnode.props.key
 * - vnode.props["data-key"]
 */
export function getVNodeKey(value: any): string | number | null {
    if (value == null || value === false || value === true) return null;
    if (typeof value === "function") return null;

    if (Array.isArray(value)) {
        const list = value.flat(Infinity).filter((v) => v != null && v !== false && v !== true);
        if (list.length === 1) return getVNodeKey(list[0]);
        const keys = list.map(getVNodeKey);
        if (keys.every((k) => k != null)) return keys.join("|");
        return null;
    }

    if (typeof value === "object") {
        // 1. vnode.key direto (JSX runtime padrão)
        if ((value as any).key != null && (value as any).key !== false) {
            return (value as any).key as string | number;
        }
        // 2. props.key
        if (value.props != null) {
            const k = value.props.key;
            if (k != null && k !== false) return k as string | number;
            // fallback para data-key
            const dk = value.props["data-key"];
            if (dk != null && dk !== false) return dk as string | number;
        }
    }

    return null;
}

type CachedEntry = {
    scope: ReturnType<typeof createEffectScope>;
    nodes: Node[];
};

export function mountKeyedReactiveFunction(
    thunk: () => any,
    namespace: string | null,
    renderToDOM: RenderToDOM
): DocumentFragment {
    const start = document.createTextNode("");
    const end = document.createTextNode("");
    const fragment = document.createDocumentFragment();
    fragment.appendChild(start);
    fragment.appendChild(end);

    let currentKey: string | number | null | undefined = undefined;
    let currentScope: ReturnType<typeof createEffectScope> | null = null;
    let hasMounted = false;

    // Cache por key: on -> off -> on restaura sem remontar
    const cache = new Map<string | number, CachedEntry>();

    // Final cleanup: quando o componente pai desmontar, limpa tudo que ficou em cache
    // Este efeito roda uma vez e só é disposto no unmount final
    createReactiveEffect(() => {
        return () => {
            for (const entry of cache.values()) {
                cleanupEffectScope(entry.scope);
            }
            cache.clear();
            if (currentScope) {
                cleanupEffectScope(currentScope);
                currentScope = null;
            }
        };
    }, "layout");

    // Efeito reativo principal: troca de key com cache
    createReactiveEffect(() => {
        const nextValue = thunk();
        const parent = start.parentNode;
        if (!parent) return;

        const nextKey = getVNodeKey(nextValue); // "on" | "off" | null

        // mesma key → não mexe (count 1→2→3)
        if (
            hasMounted &&
            nextKey != null &&
            currentKey != null &&
            Object.is(nextKey, currentKey)
        ) {
            return;
        }

        // branch mudou (ou primeira vez): destrói o atual de verdade
        if (currentScope) {
            cleanupEffectScope(currentScope); // ← unmounting BeerCSS
            currentScope = null;
        }

        let node: Node | null = start.nextSibling;
        while (node && node !== end) {
            const next = node.nextSibling;
            parent.removeChild(node);
            node = next;
        }

        // monta o branch novo
        currentScope = createEffectScope(
            `reactive-keyed:${String(nextKey ?? "nokey")}`,
        );
        const rendered = runWithEffectScope(currentScope, () =>
            renderToDOM(nextValue, namespace),
        );
        parent.insertBefore(rendered, end);

        currentKey = nextKey;
        hasMounted = true;
    });

    return fragment;
}