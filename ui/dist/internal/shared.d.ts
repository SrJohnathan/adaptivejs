import { type AdaptiveUIChild, type AdaptiveUIProps } from "../primitives.js";
export type UIChildrenFactory = () => AdaptiveUIChild[];
export declare function mergeProps<T extends AdaptiveUIProps>(props: T, additions: AdaptiveUIProps): T;
export declare function adaptiveWrap(value: AdaptiveUIChild): AdaptiveUIChild;
