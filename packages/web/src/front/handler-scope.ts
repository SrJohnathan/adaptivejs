/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */
// handler-scope.ts


export type HandlerCallback<TPayload = any> = (payload?: TPayload) => void;
let isDispatchingHandler = false;

export type HandlerScope = {
    id: number;
    label?: string;

    // handlers registrados por este componente/scope
    handlers: Map<string, HandlerCallback>;
};

let currentHandlerScope: HandlerScope | null = null;
let nextHandlerScopeId = 1;

// registry global:
// id do handler -> scope -> callback
const handlers = new Map<string, Map<number, HandlerCallback>>();

export function createHandlerScope(label?: string): HandlerScope {
    return {
        id: nextHandlerScopeId++,
        label,
        handlers: new Map()
    };
}

export function runWithHandlerScope<T>(scope: HandlerScope, fn: () => T): T {
    const previous = currentHandlerScope;
    currentHandlerScope = scope;

    try {
        return fn();
    } finally {
        currentHandlerScope = previous;
    }
}

export function cleanupHandlerScope(scope: HandlerScope) {
    for (const id of scope.handlers.keys()) {
        const group = handlers.get(id);

        if (group) {
            group.delete(scope.id);

            if (group.size === 0) {
                handlers.delete(id);
            }
        }
    }

    scope.handlers.clear();
}


export function createHandler<TPayload = any>(
    id: string,
    callback: HandlerCallback<TPayload>
): void {

    if (isDispatchingHandler) {
        throw new Error(
            `[Adaptive Handler] createHandler("${id}") não pode ser chamado dentro de outro handler.`

        );
    }

    if (!currentHandlerScope) {
        /*throw new Error(
            `[Adaptive Handler] createHandler("${id}") precisa ser chamado dentro de um HandlerScope.`
        );*/

        return;
    }

    const scope = currentHandlerScope;
    const cb = callback as HandlerCallback;

    // se já existe handler com esse id nesse componente,
    // substitui pelo último
    scope.handlers.set(id, cb);

    let group = handlers.get(id);

    if (!group) {
        group = new Map();
        handlers.set(id, group);
    }

    group.set(scope.id, cb);
}

export function useHandler<TPayload = any>(id: string) {
    return (payload?: TPayload) => {
        const group = handlers.get(id);
        if (!group || group.size === 0) return;

        isDispatchingHandler = true;
        try {
            for (const callback of [...group.values()]) {
                callback(payload);
            }
        } finally {
            isDispatchingHandler = false;
        }
    };
}

export function hasHandler(id: string): boolean {
    return Boolean(handlers.get(id)?.size);
}

export function clearHandlers(id?: string) {
    if (id) {
        const group = handlers.get(id);

        if (group) {
            for (const scopeId of group.keys()) {
                // não temos acesso direto ao scope aqui,
                // então só limpa o registry global
                group.delete(scopeId);
            }
        }

        handlers.delete(id);
        return;
    }

    handlers.clear();
}