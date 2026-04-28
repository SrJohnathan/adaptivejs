type EffectFn = () => void | (() => void);
type DependencyList = any[];
export declare function onLayoutEffect(effect: EffectFn): void;
export declare function onEffect(effect: EffectFn, deps: DependencyList): void;
export declare function onStart(effect: EffectFn): void;
export {};
