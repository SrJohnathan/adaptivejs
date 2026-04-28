import type { AdaptiveUIChild, AdaptiveUIProps, AdaptiveUIStyle } from "../primitives.js";
import { adaptiveCreateElement } from "../primitives.js";
import { mergeProps } from "../internal/shared.js";

export type HeadingProps = AdaptiveUIProps & {
  level?: number;
};

export function Heading(
  content: string,
  props: HeadingProps = {},
  style: AdaptiveUIStyle = {}
): AdaptiveUIChild {
  const level = props.level ?? 1;
  const headingProps = { ...props };
  delete headingProps.level;

  return adaptiveCreateElement(
    "heading",
    mergeProps(headingProps, {
      level,
      style
    }),
    content
  );
}
