import { adaptiveCreateElement, type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
import { mergeProps, type UIChildrenFactory } from "../internal/shared.js";

export function Form(
  children: UIChildrenFactory,
  props: AdaptiveUIProps = {},
  style: AdaptiveUIStyle = {},
): AdaptiveUIChild {
  return adaptiveCreateElement(
    "form",
    mergeProps(props, { style }),
    ...children(),
  );
}
