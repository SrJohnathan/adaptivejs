import { type AdaptiveUIChild } from "../primitives.js";
export declare function Conditional(condition: boolean, whenTrue: () => AdaptiveUIChild, whenFalse?: () => AdaptiveUIChild): AdaptiveUIChild;
