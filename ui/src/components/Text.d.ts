import type { AdaptiveChild } from "@adaptivejs/core";
import type { AdaptiveUIProps, AdaptiveUIStyle } from "../primitives.js";
export type TextProps = AdaptiveUIProps & {
    selectable?: boolean;
    variant?: string;
};
export declare function Text(content: string, props?: TextProps, style?: AdaptiveUIStyle): AdaptiveChild;
