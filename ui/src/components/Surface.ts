import { adaptiveCreateElement, type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";

export type UIChildrenFactory = () => AdaptiveUIChild[];

export type SurfaceProps = AdaptiveUIProps & {
  padding?: number | string;
  variant?: string;
};

export function Surface(
  children: UIChildrenFactory,
  props: SurfaceProps = {},
  style: AdaptiveUIStyle = {}
): AdaptiveUIChild {
  return adaptiveCreateElement(
    "surface",
    mergeProps(props, {
      padding: props.padding ?? 16,
      style
    }),
    ...children()
  );
}
