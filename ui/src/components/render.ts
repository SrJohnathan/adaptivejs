import type { AdaptiveUIChild } from "../primitives.js";
import { adaptiveWrap } from "../internal/shared.js";

export { adaptiveWrap } from "../internal/shared.js";

export function render(ui: () => AdaptiveUIChild): AdaptiveUIChild {
  return adaptiveWrap(ui());
}
