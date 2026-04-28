import {
  adaptiveCreateElement,
  type AdaptiveUIChild,
  type AdaptiveUIProps,
  type AdaptiveUIStyle
} from "../primitives.js";
import { mergeProps } from "../internal/shared.js";

export type ButtonProps = AdaptiveUIProps & {
  disabled?: boolean;
  variant?: string;
  onPress?: (...args: any[]) => void;
};

export function Button(
  label: string,
  props: ButtonProps = {},
  style: AdaptiveUIStyle = {}
): AdaptiveUIChild {
  return adaptiveCreateElement(
    "button",
    mergeProps(props, { style }),
    label
  );
}
