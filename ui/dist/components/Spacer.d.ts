import { type AdaptiveUIChild, type AdaptiveUIProps } from "../primitives.js";
export type SpacerProps = AdaptiveUIProps & {
    size?: number | string;
    width?: number | string;
    height?: number | string;
};
export declare function Spacer(size?: number | string, props?: AdaptiveUIProps): AdaptiveUIChild;
export declare function SpacerBox(props?: SpacerProps): AdaptiveUIChild;
export default Spacer;
