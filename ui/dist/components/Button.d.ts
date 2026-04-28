import { type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
export type ButtonProps = AdaptiveUIProps & {
    disabled?: boolean;
    variant?: string;
    onPress?: (...args: any[]) => void;
};
export declare function Button(label: string, props?: ButtonProps, style?: AdaptiveUIStyle): AdaptiveUIChild;
