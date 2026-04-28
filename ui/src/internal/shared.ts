import {
  adaptiveFragment,
  type AdaptiveUIChild,
  type AdaptiveUIProps
} from "../primitives.js";

export type UIChildrenFactory = () => AdaptiveUIChild[];

export function mergeProps<T extends AdaptiveUIProps>(
  props: T,
  additions: AdaptiveUIProps
): T {
  const mergedStyle = {
    ...(props.style ?? {}),
    ...(additions.style ?? {})
  };

  const nextProps = {
    ...props,
    ...additions,
    style: mergedStyle
  };

  if (Object.keys(mergedStyle).length === 0) {
    delete (nextProps as Record<string, unknown>).style;
  }

  return nextProps as T;
}

export function adaptiveWrap(value: AdaptiveUIChild): AdaptiveUIChild {
  if (value == null || value === false) {
    return adaptiveFragment();
  }

  if (Array.isArray(value)) {
    return adaptiveFragment(value);
  }

  return value;
}
