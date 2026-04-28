import { AdaptiveType } from "./global";
export declare function jsx(type: any, props: any): AdaptiveType;
export declare function jsxs(type: any, props: any): AdaptiveType;
export declare function jsxDEV(type: any, props: any): AdaptiveType;
export declare function createElement(tag: any, props?: any, ...children: any[]): AdaptiveType;
export declare function Fragment(props: {
    children?: any;
}): AdaptiveType;
export declare function useRefReactive<T>(initialValue?: T | null): {
    current: T | null;
};
export declare function useRef<T>(initialValue?: T | null): {
    current: T | null;
};
