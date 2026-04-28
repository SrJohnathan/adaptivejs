import type { AdaptiveChild } from "@adaptivejs/core";
import { type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
export type UIChildrenFactory = () => AdaptiveChild[];
export type SurfaceProps = AdaptiveUIProps & {
    padding?: number | string;
    variant?: string;
};
export declare function Surface(children: UIChildrenFactory, props?: SurfaceProps, style?: AdaptiveUIStyle): AdaptiveChild;
