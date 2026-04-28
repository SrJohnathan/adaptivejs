import { AdaptiveType } from "./global";

function flattenChildren(children: any[]): any[] {
  return children.flat(Infinity).filter((child) => child !== undefined && child !== null && child !== false);
}

export function jsx(type: any, props: any) {
  const rawChildren = props?.children === undefined ? [] : Array.isArray(props.children) ? props.children : [props.children];
  return createElement(type, props, ...rawChildren);
}

export function jsxs(type: any, props: any) {
  return jsx(type, props);
}

export function jsxDEV(type: any, props: any) {
  return jsx(type, props);
}

export function createElement(tag: any, props: any = {}, ...children: any[]): AdaptiveType {
  const normalizedChildren = flattenChildren(children);
  return {
    tag: tag === "<>" ? Fragment : tag,
    props: props ?? {},
    children: normalizedChildren
  };
}

export function Fragment(props: { children?: any }): AdaptiveType {
  const children = props.children === undefined ? [] : Array.isArray(props.children) ? props.children : [props.children];
  return {
    tag: "Fragment",
    props: {},
    children: flattenChildren(children)
  };
}

export function useRefReactive<T>(initialValue: T | null = null) {
  let current = initialValue;
  return {
    get current() {
      return current;
    },
    set current(value: T | null) {
      current = value;
    }
  };
}

export function useRef<T>(initialValue: T | null = null): { current: T | null } {
  return { current: initialValue };
}
