import { createElement, Fragment } from "@adaptivejs/core";
export let Style = /* @__PURE__ */ function(Style) {
	Style["AlignItems"] = "alignItems";
	Style["Background"] = "background";
	Style["BackgroundColor"] = "backgroundColor";
	Style["BackdropFilter"] = "backdropFilter";
	Style["Border"] = "border";
	Style["BorderRadius"] = "borderRadius";
	Style["BoxShadow"] = "boxShadow";
	Style["Color"] = "color";
	Style["Display"] = "display";
	Style["Flex"] = "flex";
	Style["FlexDirection"] = "flexDirection";
	Style["FontSize"] = "fontSize";
	Style["FontWeight"] = "fontWeight";
	Style["Gap"] = "gap";
	Style["Height"] = "height";
	Style["JustifyContent"] = "justifyContent";
	Style["Margin"] = "margin";
	Style["MarginBottom"] = "marginBottom";
	Style["MarginLeft"] = "marginLeft";
	Style["MarginRight"] = "marginRight";
	Style["MarginTop"] = "marginTop";
	Style["MaxWidth"] = "maxWidth";
	Style["MinHeight"] = "minHeight";
	Style["MinWidth"] = "minWidth";
	Style["Opacity"] = "opacity";
	Style["Padding"] = "padding";
	Style["PaddingBottom"] = "paddingBottom";
	Style["PaddingLeft"] = "paddingLeft";
	Style["PaddingRight"] = "paddingRight";
	Style["PaddingTop"] = "paddingTop";
	Style["Width"] = "width";
	return Style;
}({});
export function adaptiveCreateElement(tag, props = {}, ...children) {
	return createElement(tag, props, ...children);
}
export function adaptiveFragment(children = []) {
	return createElement(Fragment, {}, ...children);
}
export function createSemanticElement(tag, props = {}, children = []) {
	return adaptiveCreateElement(tag, props, ...children);
}

//# sourceMappingURL=primitives.js.map
