import { createElement, Fragment } from "@adaptivejs/core";
import type { AdaptiveChild, AdaptiveNode } from "@adaptivejs/core";

export enum Style {
  AlignItems = "alignItems",
  Background = "background",
  BackgroundColor = "backgroundColor",
  BackdropFilter = "backdropFilter",
  Border = "border",
  BorderRadius = "borderRadius",
  BoxShadow = "boxShadow",
  Color = "color",
  Display = "display",
  Flex = "flex",
  FlexDirection = "flexDirection",
  FontSize = "fontSize",
  FontWeight = "fontWeight",
  Gap = "gap",
  Height = "height",
  JustifyContent = "justifyContent",
  Margin = "margin",
  MarginBottom = "marginBottom",
  MarginLeft = "marginLeft",
  MarginRight = "marginRight",
  MarginTop = "marginTop",
  MaxWidth = "maxWidth",
  MinHeight = "minHeight",
  MinWidth = "minWidth",
  Opacity = "opacity",
  Padding = "padding",
  PaddingBottom = "paddingBottom",
  PaddingLeft = "paddingLeft",
  PaddingRight = "paddingRight",
  PaddingTop = "paddingTop",
  Width = "width",
}

export type AdaptiveUIStyleValue = string | number | boolean | null | undefined;
export type AdaptiveUIStyle = Partial<Record<Style, AdaptiveUIStyleValue>>;

export type AdaptiveUIProps = Record<string, unknown> & {
  id?: string;
  key?: string | number;
  className?: string;
  style?: AdaptiveUIStyle;
};

export type AdaptiveUIChild = AdaptiveChild | AdaptiveNode;
export type AdaptiveUIElement = AdaptiveNode;

export function adaptiveCreateElement(
  tag: string | Function,
  props: AdaptiveUIProps = {},
  ...children: AdaptiveUIChild[]
): AdaptiveUIElement {
  return createElement(tag, props, ...(children as any[]));
}

export function adaptiveFragment(children: AdaptiveUIChild[] = []): AdaptiveUIElement {
  return createElement(Fragment, {}, ...(children as any[]));
}

export function createSemanticElement(
  tag: string,
  props: AdaptiveUIProps = {},
  children: AdaptiveUIChild[] = []
): AdaptiveUIElement {
  return adaptiveCreateElement(tag, props, ...children);
}
