import type { AdaptiveUIChild, AdaptiveUIProps, AdaptiveUIStyle } from "../primitives.js";
import { Heading } from "./Heading.js";

export function Title(
  content: string,
  level: number = 1,
  props: AdaptiveUIProps = {},
  style: AdaptiveUIStyle = {},
): AdaptiveUIChild {
  return Heading(content, { ...props, level }, style);
}
