import {
  adaptiveCreateElement,
  type AdaptiveUIChild,
  type AdaptiveUIProps,
  type AdaptiveUIStyle
} from "../primitives.js";
import { mergeProps } from "../internal/shared.js";

export type InputProps = AdaptiveUIProps & {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  onInput?: (...args: any[]) => void;
  onChange?: (...args: any[]) => void;
};

export function Input(
  props: InputProps = {},
  style: AdaptiveUIStyle = {}
): AdaptiveUIChild {
  return adaptiveCreateElement("input", mergeProps(props, { style }));
}
