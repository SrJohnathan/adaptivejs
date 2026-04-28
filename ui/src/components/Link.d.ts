import type { AdaptiveChild } from "@adaptivejs/core";
import { type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
export type LinkProps = AdaptiveUIProps & {
    href: string;
    external?: boolean;
    onPress?: (...args: any[]) => void;
};
export declare function Link(label: string, props: LinkProps, style?: AdaptiveUIStyle): AdaptiveChild;
