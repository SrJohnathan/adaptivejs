import type { AdaptiveUIChild, AdaptiveUIStyle } from "../primitives.js";
import { type SurfaceProps } from "./Surface.js";
export type CardProps = SurfaceProps & {
    elevated?: boolean;
    variant?: "default" | "outlined" | "elevated";
};
export type UIChildrenFactory = () => AdaptiveUIChild[];
export declare function Card(children: UIChildrenFactory, props?: CardProps, style?: AdaptiveUIStyle): AdaptiveUIChild;
