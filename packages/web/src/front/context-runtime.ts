import {readContext} from "../reactive/index.js";

export { CONTEXT_PROVIDER_TAG } from "@adaptive-js/shared";
import { CONTEXT_PROVIDER_TAG } from "@adaptive-js/shared";


export type AdaptiveContext<T> = {
    id: symbol;
    defaultValue: T;
};

export function createContext<T>(defaultValue: T) {
    const ctx: AdaptiveContext<T> = {
        id: Symbol("adaptive.context"),
        defaultValue
    };

    function Provider(props: { value: T; children?: any }) {
        return {
            tag: CONTEXT_PROVIDER_TAG,
            props: {
                context: ctx,
                value: props.value
            },
            children: props.children
        };
    }

    return {
        Provider,
        _context: ctx
    };
}

export function useContext<T>(context: { _context: AdaptiveContext<T> }): T {
    return readContext(context._context.id, context._context.defaultValue);
}
