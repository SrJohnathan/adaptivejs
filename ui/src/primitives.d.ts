import type { AdaptiveChild, AdaptiveType } from "@adaptivejs/core";
export type AdaptiveUIStyle = Record<string, string | number | boolean | null | undefined>;
export type AdaptiveUIProps = Record<string, unknown> & {
    id?: string;
    key?: string | number;
    className?: string;
    style?: AdaptiveUIStyle;
};
export type AdaptiveUIChild = AdaptiveChild;
export type AdaptiveUIElement = AdaptiveType;
export declare function adaptiveCreateElement(tag: string | Function, props?: AdaptiveUIProps, ...children: AdaptiveUIChild[]): AdaptiveUIElement;
export declare function adaptiveFragment(children?: AdaptiveUIChild[]): AdaptiveUIElement;
export declare function createSemanticElement(tag: string, props?: AdaptiveUIProps, children?: AdaptiveUIChild[]): AdaptiveUIElement;
