import { type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
export type AppBarProps = AdaptiveUIProps & {
    title: string;
    subtitle?: string;
    leading?: () => AdaptiveUIChild[];
    actions?: () => AdaptiveUIChild[];
};
export declare function AppBar(props: AppBarProps, style?: AdaptiveUIStyle): AdaptiveUIChild;
