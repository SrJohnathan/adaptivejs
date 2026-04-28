import type { AdaptiveChild } from "@adaptivejs/core";
import { type AdaptiveUIProps } from "../primitives.js";
export type SpacerProps = AdaptiveUIProps & {
    size?: number | string;
    width?: number | string;
    height?: number | string;
};
export declare function Spacer(size?: number | string, props?: AdaptiveUIProps): AdaptiveChild;
export declare function SpacerBox(props?: SpacerProps): AdaptiveChild;
export default Spacer;
