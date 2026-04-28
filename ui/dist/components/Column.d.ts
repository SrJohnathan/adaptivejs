import { type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
export type ColumnProps = AdaptiveUIProps & {
    spacing?: number;
};
export type UIChildrenFactory = () => AdaptiveUIChild[];
export declare function Column(children: UIChildrenFactory, props?: ColumnProps, style?: AdaptiveUIStyle): AdaptiveUIChild;
