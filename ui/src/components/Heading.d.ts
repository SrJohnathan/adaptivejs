import type { AdaptiveChild } from "@adaptivejs/core";
import type { AdaptiveUIProps, AdaptiveUIStyle } from "../primitives.js";
export type HeadingProps = AdaptiveUIProps & {
    level?: number;
};
export declare function Heading(content: string, props?: HeadingProps, style?: AdaptiveUIStyle): AdaptiveChild;
