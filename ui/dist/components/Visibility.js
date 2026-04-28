import { adaptiveFragment } from "../primitives.js";
import { adaptiveWrap } from "../internal/shared.js";
export function Visibility(visible, child) {
	return visible ? adaptiveWrap(child()) : adaptiveFragment();
}

//# sourceMappingURL=Visibility.js.map
