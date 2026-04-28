import type { AdaptiveUIChild, AdaptiveUIProps, AdaptiveUIStyle } from "../primitives.js";
import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";

export type TextProps = AdaptiveUIProps & {
  selectable?: boolean;
  variant?: string;
};

export function Text(
  content: string,
  props: TextProps = {},
  style: AdaptiveUIStyle = {}
): AdaptiveUIChild {
  return adaptiveCreateElement(
    "text",
    mergeProps(props, { style }),
    content
  );
}
