import { adaptiveCreateElement, Style } from "../primitives.js";
import { Surface } from "./Surface.js";
export function FormGroup(label, input, id) {
	return Surface(() => [adaptiveCreateElement("label", {
		htmlFor: id,
		style: {
			[Style.Display]: "block",
			[Style.FontWeight]: "600",
			[Style.MarginBottom]: "0.5rem"
		}
	}, label), input], {}, { [Style.MarginBottom]: "1rem" });
}

//# sourceMappingURL=FormGroup.js.map
