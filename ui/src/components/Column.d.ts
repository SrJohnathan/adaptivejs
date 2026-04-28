import type { AdaptiveChild } from "@adaptivejs/core";
import { type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
export type ColumnProps = AdaptiveUIProps & {
    spacing?: number;
};
export type UIChildrenFactory = () => AdaptiveChild[];
export declare function Column(children: UIChildrenFactory, props?: ColumnProps, style?: AdaptiveUIStyle): AdaptiveChild;
