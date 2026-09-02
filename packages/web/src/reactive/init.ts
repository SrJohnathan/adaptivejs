/*
 * init() — ciclo de vida de aparição do componente.
 * + compat: useClientEffect, useDOMEffect
 */

import {
    type EffectFn,
    type EffectScope,
    getEventsSystem,
    events,
    untrack,
    isSSR,
} from "./events.js";

type InitHookState = {
    scheduled: boolean;
    runner: EffectFn | null;
};

/**
 * Executa quando o componente aparece na tela (por instância / scope).
 * Return = cleanup na saída da tela (unmount).
 *
 * Agora 100% ligado ao ciclo de vida:
 * - mount: roda em layout phase, após DOM inserido
 * - unmount: cleanup é chamado quando cleanupEventsScope(scope) roda
 *           no boundary-component.ts (isConnected === false)
 */
export function init(effect: EffectFn): void {
    if (isSSR()) return;

    const system = getEventsSystem();
    const scope = system.getCurrentScope();

    if (!scope) {
        // fora de componente (ex: página server sem boundary)
        // roda uma vez global, sem lifecycle
        const runner: EffectFn = () => effect();
        system.setEffectPhase(runner, "layout");
        system.schedule(runner, "layout");
        return;
    }

    const index = scope.hookIndex++;
    if (!scope.hooks[index]) {
        scope.hooks[index] = { scheduled: false, runner: null } satisfies InitHookState;
    }

    const hook = scope.hooks[index] as InitHookState;
    if (hook.scheduled) return; // já montou esta instância

    hook.scheduled = true;

    const runner: EffectFn = () => effect();
    hook.runner = runner;

    // liga explicitamente este runner ao scope atual
    // para que cleanupScope(scope) consiga achar e dar dispose
    system.setEffectPhase(runner, "layout");
    // @ts-ignore - effectScopes é interno mas precisamos registrar aqui
    (system as any).effectScopes?.set?.(runner, scope);

    system.schedule(runner, "layout");
}

/**
 * Efeito cliente genérico (compat com useClientEffect antigo).
 * Roda como effect normal no client, respeita deps.
 */
export function useClientEffect(effect: EffectFn, deps: any[] = []): void {
    if (isSSR()) return;
    events(effect, deps, { phase: "effect" });
}

/**
 * Disparo inicial estreito (SEM REATIVIDADE) — compat com useDOMEffect antigo.
 * Isola completamente para que sinais lidos NÃO assinem o efeito.
 * Garante execução após DOM pronto.
 */
export function useDOMEffect(effect: EffectFn): void {
    if (isSSR()) return;
    events(() => {
        if (typeof document !== "undefined" && document.readyState === "loading") {
            const runner = () => untrack(effect);
            document.addEventListener("DOMContentLoaded", runner, { once: true });
            return () => document.removeEventListener("DOMContentLoaded", runner);
        }
        return untrack(effect);
    }, [], { phase: "layout" });
}

/** Helpers reexportados para o renderer */
export {
    createEventsScope as createInitScope,
    createEffectScope as createInitScopeCompat,
    runWithEventsScope as runWithInitScope,
    runWithEffectScope as runWithInitScopeCompat,
    cleanupEventsScope as cleanupInitScope,
    cleanupEffectScope as cleanupInitScopeCompat,
} from "./events.js";

export type { EffectScope as InitScope };