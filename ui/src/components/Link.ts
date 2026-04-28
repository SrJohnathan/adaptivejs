import { adaptiveCreateElement, type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";

export type LinkProps = AdaptiveUIProps & {
  href: string;
  external?: boolean;
  onPress?: (...args: any[]) => void;
};

export function Link(label: string, props: LinkProps, style: AdaptiveUIStyle = {}): AdaptiveUIChild {
  return adaptiveCreateElement(
    "link",
    mergeProps(props, { style }),
    label
  );
}
