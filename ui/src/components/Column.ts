import { adaptiveCreateElement, type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";

export type ColumnProps = AdaptiveUIProps & {
  spacing?: number;
};

export type UIChildrenFactory = () => AdaptiveUIChild[];

export function Column(
  children: UIChildrenFactory,
  props: ColumnProps = {},
  style: AdaptiveUIStyle = {}
): AdaptiveUIChild {
  return adaptiveCreateElement(
    "column",
    mergeProps(props, {
      spacing: props.spacing ?? 8,
      style
    }),
    ...children()
  );
}
