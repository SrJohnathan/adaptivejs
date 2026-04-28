import { Surface } from "./Surface.js";
export function Card(children, props = {}, style = {}) {
	const { elevated = false, variant = elevated ? "elevated" : "default",...surfaceProps } = props;
	return Surface(children, {
		...surfaceProps,
		variant,
		padding: surfaceProps.padding ?? 16
	}, style);
}

//# sourceMappingURL=Card.js.map
