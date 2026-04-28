import { createElement, Fragment } from "../jsx-runtime.js";
export function Column(children, props = {}, style = {}) {
	return createElement("div", {
		...props,
		style: {
			display: "flex",
			flexDirection: "column",
			gap: "0.5rem",
			...style
		}
	}, ...children());
}
export function Row(children, props = {}, style = {}) {
	return createElement("div", {
		...props,
		style: {
			display: "flex",
			flexDirection: "row",
			gap: "0.5rem",
			...style
		}
	}, ...children());
}
export function Text(content, props = {}, style = {}) {
	return createElement("span", {
		...props,
		style
	}, content);
}
export function Title(text, level = 1, props = {}, style = {}) {
	const tag = `h${level}`;
	return createElement(tag, {
		...props,
		style
	}, text);
}
export function Button(label, props = {}, style = {}) {
	return createElement("button", {
		...props,
		style
	}, label);
}
export function Input(props = {}, style = {}) {
	return createElement("input", {
		...props,
		style
	});
}
export function Label(text, htmlFor, props = {}, style = {}) {
	return createElement("label", {
		htmlFor,
		...props,
		style
	}, text);
}
export function Textarea(props = {}, style = {}) {
	return createElement("textarea", {
		...props,
		style
	});
}
export function Select(options, props = {}, style = {}) {
	const grouped = {};
	const flat = [];
	for (const option of options) {
		if (typeof option === "string") {
			flat.push({
				label: option,
				value: option
			});
		} else if (option.group) {
			grouped[option.group] ??= [];
			grouped[option.group].push({
				label: option.label,
				value: option.value,
				disabled: option.disabled
			});
		} else {
			flat.push({
				label: option.label,
				value: option.value,
				disabled: option.disabled
			});
		}
	}
	const children = [];
	if (flat.length) {
		children.push(...flat.map((option) => createElement("option", {
			value: option.value,
			disabled: option.disabled
		}, option.label)));
	}
	for (const group in grouped) {
		children.push(createElement("optgroup", { label: group }, ...grouped[group].map((option) => () => createElement("option", {
			value: option.value,
			disabled: option.disabled
		}, option.label))));
	}
	return createElement("select", {
		multiple: false,
		...props,
		style
	}, ...children);
}
export function Form(children, props = {}, style = {}) {
	return createElement("form", {
		...props,
		style
	}, ...children());
}
export function FormGroup(label, input, id) {
	const htmlFor = id || input?.props?.id;
	return Surface(() => [Label(label, htmlFor || "", { style: { fontWeight: "bold" } }), input], { style: { marginBottom: "1rem" } });
}
export function Spacer(height = "1rem", props = {}) {
	return createElement("div", {
		...props,
		style: { height }
	});
}
export function Image(src, alt = "", props = {}, style = {}) {
	return createElement("img", {
		src,
		alt,
		...props,
		style
	});
}
export function Surface(children, props = {}, style = {}) {
	return createElement("div", {
		...props,
		style: {
			padding: "1rem",
			border: "1px solid #ccc",
			borderRadius: "8px",
			...style
		}
	}, ...children());
}
export function Card(children, props = {}, style = {}) {
	return createElement("div", {
		...props,
		style: {
			boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
			borderRadius: "12px",
			padding: "1rem",
			...style
		}
	}, ...children());
}
export function Table(headers, rows, renderRow, props = {}, style = {}) {
	return createElement("table", {
		...props,
		style: {
			borderCollapse: "collapse",
			width: "100%",
			...style
		}
	}, () => createElement("thead", {}, () => createElement("tr", {}, ...headers.map((header) => () => createElement("th", { style: {
		border: "1px solid #ccc",
		padding: "0.5rem",
		backgroundColor: "#f0f0f0"
	} }, header)))), () => createElement("tbody", {}, ...rows.map((row, index) => () => createElement("tr", {}, ...renderRow(row, index)))));
}
export function Ul(items, props = {}, style = {}) {
	return createElement("ul", {
		...props,
		style
	}, ...items.map((item) => () => createElement("li", {}, item)));
}
export function Visibility(visible, child) {
	return visible ? child() : createElement(Fragment, {});
}
export function Conditional(cond, whenTrue, whenFalse) {
	return cond ? whenTrue() : whenFalse ? whenFalse() : createElement(Fragment, {});
}
export function ForEach(items, render) {
	return items.map((item, index) => render(item, index));
}
export function InjectJSX(component) {
	return component();
}
export function render(ui) {
	return ui();
}
export const Compose = {
	Column,
	Row,
	Text,
	Title,
	Button,
	Input,
	Label,
	Textarea,
	Select,
	Form,
	FormGroup,
	Spacer,
	Image,
	Surface,
	Card,
	Table,
	Ul,
	Visibility,
	Conditional,
	ForEach,
	InjectJSX,
	render
};
export const Box = Surface;

//# sourceMappingURL=compose.js.map
