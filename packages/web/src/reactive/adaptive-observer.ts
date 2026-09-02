/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import {createEventSignal, ReactiveSource, EventSource, EffectFn} from "./events.js";

export class AdaptiveObserver<T> implements ReactiveSource {
    private _get: () => T;
    private _set: (v: T | ((p: T) => T)) => void;
    private _source: EventSource<T>;

    constructor(initial: T) {
        const [get, set] = createEventSignal(initial);
        this._get = get;
        this._set = set as any;
        this._source = (set as any).__adaptiveSource as EventSource<T>;
    }

    get(): T {
        return this._get();
    }

    set(value: T | ((prev: T) => T)): void {
        (this._set as any)(value);
    }

    update(fn: (prev: T) => T): void {
        this._source.update(fn);
    }

    removeSubscriber(effect: EffectFn): void {
        this._source.removeSubscriber(effect);
    }

    // compat: alguns lugares antigos acessavam .value direto
    get value(): T {
        return this._get();
    }
}