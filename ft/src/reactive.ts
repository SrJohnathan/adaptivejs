import { getEffectSystem, isSSR, useEffectWithDeps, useLayoutEffect } from "./state.js";

type EffectFn = () => void | (() => void);
type DependencyList = any[];

export function onLayoutEffect(effect: EffectFn): void {
  useLayoutEffect(effect);
}

export function onEffect(effect: EffectFn, deps: DependencyList): void {
  useEffectWithDeps(effect, deps);
}

export function onStart(effect: EffectFn): void {
  if (isSSR()) return;
  const run = () => {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanup();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
