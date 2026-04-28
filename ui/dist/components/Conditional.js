import { adaptiveFragment } from "../primitives.js";
import { adaptiveWrap } from "../internal/shared.js";
export function Conditional(condition, whenTrue, whenFalse) {
	if (condition) return adaptiveWrap(whenTrue());
	if (whenFalse) return adaptiveWrap(whenFalse());
	return adaptiveFragment();
}

//# sourceMappingURL=Conditional.js.map
