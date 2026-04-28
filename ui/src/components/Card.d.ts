import type { AdaptiveChild } from "@adaptivejs/core";
import type { AdaptiveUIStyle } from "../primitives.js";
import { type SurfaceProps } from "./Surface.js";
export type CardProps = SurfaceProps & {
    elevated?: boolean;
    variant?: "default" | "outlined" | "elevated";
};
export type UIChildrenFactory = () => AdaptiveChild[];
export declare function Card(children: UIChildrenFactory, props?: CardProps, style?: AdaptiveUIStyle): AdaptiveChild;
