import type { AdaptiveChild } from "@adaptivejs/core";
import { type AdaptiveUIProps } from "../primitives.js";
export type UIChildrenFactory = () => AdaptiveChild[];
export declare function mergeProps<T extends AdaptiveUIProps>(props: T, additions: AdaptiveUIProps): T;
export declare function adaptiveWrap(value: AdaptiveChild): AdaptiveChild;
