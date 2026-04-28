import type { AdaptiveUIChild, AdaptiveUIStyle } from "../primitives.js";
import { Surface, type SurfaceProps } from "./Surface.js";

export type CardProps = SurfaceProps & {
  elevated?: boolean;
  variant?: "default" | "outlined" | "elevated";
};

export type UIChildrenFactory = () => AdaptiveUIChild[];

export function Card(
  children: UIChildrenFactory,
  props: CardProps = {},
  style: AdaptiveUIStyle = {}
): AdaptiveUIChild {
  const {
    elevated = false,
    variant = elevated ? "elevated" : "default",
    ...surfaceProps
  } = props;

  return Surface(
    children,
    {
      ...surfaceProps,
      variant,
      padding: surfaceProps.padding ?? 16
    },
    style
  );
}
