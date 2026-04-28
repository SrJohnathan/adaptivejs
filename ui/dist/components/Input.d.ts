import { type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
export type InputProps = AdaptiveUIProps & {
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    type?: string;
    onInput?: (...args: any[]) => void;
    onChange?: (...args: any[]) => void;
};
export declare function Input(props?: InputProps, style?: AdaptiveUIStyle): AdaptiveUIChild;
