import { adaptiveFragment, type AdaptiveUIChild } from "../primitives.js";
import { adaptiveWrap } from "../internal/shared.js";

export function Visibility(visible: boolean, child: () => AdaptiveUIChild): AdaptiveUIChild {
  return visible ? adaptiveWrap(child()) : adaptiveFragment();
}
