/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 *
 * Bloco reativo com estabilidade por key (on/off).
 *
 * Uso no JSX (com ou sem @thunk):
 *
 *   {() => count() > 0
 *     ? <Test key="on" />
 *     : <div key="off">TEX</div>}
 *
 * Enquanto a key do root não mudar, o DOM e o effect scope dos children
 * são preservados — count 1→2→3 não desmonta <Test key="on" />.
 * Só troca de "on" → "off" (ou ausência de key → replace total).
 *
 * Integrar em hidrate.ts no branch `typeof vnode === "function"`.
 */



import {
    cleanupEffectScope,
    createEffectScope,
    runWithEffectScope,
} from "../reactive/index.js";
import {createReactiveEffect} from "../reactive/events.js";


export type RenderToDOM = (vnode: any, namespace: string | null) => Node;

/**
 * Extrai key de um vnode Adaptive (props.key) ou de lista normalizada.
 * Sem key → null (modo replace total, comportamento antigo).
 */
export function getVNodeKey(value: any): string | number | null {
    if (value == null || value === false || value === true) {
        return null;
    }
    if (typeof value === "function") {
        // thunk aninhado: não estabiliza por key no nível de fora
        return null;
    }
    if (Array.isArray(value)) {
        const list = value.flat(Infinity).filter(
            (v) => v != null && v !== false && v !== true,
        );
        if (list.length === 1) return getVNodeKey(list[0]);
        // várias roots: key composta se todas tiverem key
        const keys = list.map(getVNodeKey);
        if (keys.every((k) => k != null)) return keys.join("|");
        return null;
    }
    if (typeof value === "object" && value.props != null) {
        const k = value.props.key;
        if (k != null && k !== false) return k as string | number;
    }
    return null;
}

/**
 * Substitui o path genérico de function-child em renderToDOM.
 *
 * createReactiveEffect:
 *  - sempre reexecuta quando signals lidos no thunk mudam
 *  - só faz unmount/remount se a key mudou (ou não há key)
 */
export function mountKeyedReactiveFunction(
    thunk: () => any,
    namespace: string | null,
    renderToDOM: RenderToDOM,
): DocumentFragment {
    const start = document.createTextNode("");
    const end = document.createTextNode("");
    const fragment = document.createDocumentFragment();
    fragment.appendChild(start);
    fragment.appendChild(end);

    let currentKey: string | number | null | undefined = undefined;
    let currentScope: ReturnType<typeof createEffectScope> | null = null;
    let hasMounted = false;

    createReactiveEffect(() => {
        const nextValue = thunk();
        const parent = start.parentNode;
        if (!parent) return;

        const nextKey = getVNodeKey(nextValue);

        // Mesma key e já montado → não mexe no DOM / scope
        if (
            hasMounted &&
            nextKey != null &&
            currentKey != null &&
            Object.is(nextKey, currentKey)
        ) {
            return;
        }

        // key mudou ou primeira montagem ou sem key → replace
        if (currentScope) {
            cleanupEffectScope(currentScope);
            currentScope = null;
        }

        let node: Node | null = start.nextSibling;
        while (node && node !== end) {
            const next = node.nextSibling;
            parent.removeChild(node);
            node = next;
        }

        currentScope = createEffectScope("reactive-keyed");
        const rendered = runWithEffectScope(currentScope, () =>
            renderToDOM(nextValue, namespace),
        );
        parent.insertBefore(rendered, end);

        currentKey = nextKey;
        hasMounted = true;
    });

    return fragment;
}
