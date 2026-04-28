import { type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
export type UIChildrenFactory = () => AdaptiveUIChild[];
export type SurfaceProps = AdaptiveUIProps & {
    padding?: number | string;
    variant?: string;
};
export declare function Surface(children: UIChildrenFactory, props?: SurfaceProps, style?: AdaptiveUIStyle): AdaptiveUIChild;
