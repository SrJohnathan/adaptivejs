import { adaptiveCreateElement, type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
import { mergeProps, type UIChildrenFactory } from "../internal/shared.js";

export function Row(
  children: UIChildrenFactory,
  props: AdaptiveUIProps = {},
  style: AdaptiveUIStyle = {}
): AdaptiveUIChild {
  return adaptiveCreateElement(
    "row",
    mergeProps(props, {
      spacing: props.spacing ?? 8,
      style
    }),
    ...children()
  );
}
