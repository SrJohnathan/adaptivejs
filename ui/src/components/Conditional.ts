import { adaptiveFragment, type AdaptiveUIChild } from "../primitives.js";
import { adaptiveWrap } from "../internal/shared.js";

export function Conditional(
  condition: boolean,
  whenTrue: () => AdaptiveUIChild,
  whenFalse?: () => AdaptiveUIChild
): AdaptiveUIChild {
  if (condition) return adaptiveWrap(whenTrue());
  if (whenFalse) return adaptiveWrap(whenFalse());
  return adaptiveFragment();
}
