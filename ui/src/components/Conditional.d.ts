import type { AdaptiveChild } from "@adaptivejs/core";
export declare function Conditional(condition: boolean, whenTrue: () => AdaptiveChild, whenFalse?: () => AdaptiveChild): AdaptiveChild;
