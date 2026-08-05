import { useLayoutEffect, useRef } from "@adaptive-js/web";
import type { RefObject } from "@adaptive-js/web";

export type BaseDivProps = {
  className?: string;
  onMouseEnter?: (event: MouseEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
  [key: string]: any;
};

export type AnimatedLucideIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

export type AnimatedLucideIconProps = BaseDivProps & {
  size?: number;
  duration?: number;
  strokeWidth?:number;
  animateOnHover?: boolean;
  iconRef?: RefObject<AnimatedLucideIconHandle> | ((handle: AnimatedLucideIconHandle | null) => void);
};

export type AnimationTarget = SVGElement;
export type AnimationFactory = () => Animation | null;
export type VariantPrimitive = string | number;
export type VariantTransition = {
  duration?: number;
  delay?: number;
  ease?: string;
  times?: number[];
  [key: string]: unknown;
};
export type VariantState = {
  transition?: VariantTransition;
  [key: string]: VariantPrimitive | VariantPrimitive[] | VariantTransition | undefined;
};
export type VariantDefinitionMap = Record<string, VariantState>;

export class AnimatedIconController {
  private activeAnimations: Animation[] = [];

  stopRunningAnimations() {
    for (const animation of this.activeAnimations) {
      animation.cancel();
    }

    this.activeAnimations = [];
  }

  start(factories: AnimationFactory[]) {
    this.stopRunningAnimations();
    this.activeAnimations = factories.map((factory) => factory()).filter(Boolean) as Animation[];
  }

  reset(targets: AnimationTarget[], duration: number) {
    this.stopRunningAnimations();
    this.activeAnimations = targets
      .map((target, index) => createNormalAnimation(target, duration, index * 18))
      .filter(Boolean) as Animation[];
  }

  destroy(targets: AnimationTarget[]) {
    this.stopRunningAnimations();
    finishAnimation(targets);
  }
}

export function cn(...values: Array<string | null | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function assignHandle(
  target: AnimatedLucideIconProps["iconRef"],
  handle: AnimatedLucideIconHandle | null
) {
  if (!target) {
    return;
  }

  if (typeof target === "function") {
    target(handle);
    return;
  }

  target.current = handle;
}

export function collectElements(...elements: Array<SVGElement | null>) {
  return elements.filter(Boolean) as SVGElement[];
}

export function finishAnimation(elements: SVGElement[]) {
  for (const element of elements) {
    element.style.opacity = "1";
    element.style.transform = "none";
  }
}

export function createNormalAnimation(element: SVGElement, duration: number, delay = 0) {
  return element.animate(
    [
      { opacity: Number(element.style.opacity || 1), transform: element.style.transform || "none" },
      { opacity: 1, transform: "none" }
    ],
    {
      duration,
      delay,
      easing: "ease-out",
      fill: "forwards"
    }
  );
}

export function createIconAnimation(
  element: SVGElement,
  keyframes: Keyframe[],
  duration: number,
  delay = 0,
  easing = "ease-in-out"
) {
  return element.animate(keyframes, {
    duration,
    delay,
    easing,
    fill: "forwards"
  });
}

export function createVariantAnimation(
  element: SVGElement | null,
  variants: VariantDefinitionMap,
  stateName: string,
  fallbackDuration = 300
) {
  if (!element) {
    return null;
  }

  const targetState = variants[stateName];
  if (!targetState) {
    return createNormalAnimation(element, fallbackDuration);
  }

  const normalState = variants.normal ?? {};
  const transition = resolveVariantTransition(targetState.transition);
  const keyframes = buildVariantKeyframes(element, normalState, targetState);

  return element.animate(keyframes, {
    duration: transition.duration ?? fallbackDuration,
    delay: transition.delay ?? 0,
    easing: transition.easing,
    fill: "forwards"
  });
}

export function useAnimatedIconHandle(
  iconRef: AnimatedLucideIconProps["iconRef"],
  controller: RefObject<AnimatedIconController | null>,
  getTargets: () => SVGElement[],
  startAnimation: () => void,
  stopAnimation: () => void
) {
  useLayoutEffect(() => {
    const handle: AnimatedLucideIconHandle = {
      startAnimation,
      stopAnimation
    };

    assignHandle(iconRef, handle);

    return () => {
      controller.current?.destroy(getTargets());
      assignHandle(iconRef, null);
    };
  }, [iconRef]);
}

export function createMouseHandlers(
  animateOnHover: boolean,
  startAnimation: () => void,
  stopAnimation: () => void,
  onMouseEnter?: (event: MouseEvent) => void,
  onMouseLeave?: (event: MouseEvent) => void
) {
  return {
    onMouseEnter: (event: MouseEvent) => {
      if (animateOnHover) {
        startAnimation();
      }

      onMouseEnter?.(event);
    },
    onMouseLeave: (event: MouseEvent) => {
      if (animateOnHover) {
        stopAnimation();
      }

      onMouseLeave?.(event);
    }
  };
}

function resolveVariantTransition(transition: VariantTransition | undefined) {
  return {
    duration: typeof transition?.duration === "number" ? transition.duration * 1000 : undefined,
    delay: typeof transition?.delay === "number" ? transition.delay * 1000 : undefined,
    easing: mapMotionEase(transition?.ease),
    offsets: Array.isArray(transition?.times)
      ? transition.times.filter((value): value is number => typeof value === "number")
      : undefined
  };
}

function buildVariantKeyframes(
  element: SVGElement,
  normalState: VariantState,
  targetState: VariantState
): Keyframe[] {
  const pathLength = canMeasurePathLength(element) ? safeTotalLength(element) : null;
  const stateKeys = new Set<string>();

  for (const key of Object.keys(normalState)) {
    if (key !== "transition") {
      stateKeys.add(key);
    }
  }

  for (const key of Object.keys(targetState)) {
    if (key !== "transition") {
      stateKeys.add(key);
    }
  }

  const keys = Array.from(stateKeys);
  const frameCount = Math.max(
    2,
    ...keys.map((key) => Math.max(getFrameCount(normalState[key]), getFrameCount(targetState[key])))
  );

  return Array.from({ length: frameCount }, (_, index) =>
    buildVariantFrame(keys, index, frameCount, normalState, targetState, pathLength)
  );
}

function buildVariantFrame(
  keys: string[],
  index: number,
  frameCount: number,
  normalState: VariantState,
  targetState: VariantState,
  pathLength: number | null
) {
  const frame: Keyframe = {};
  const transformParts: string[] = [];
  let currentPathLength: number | undefined;
  let currentPathOffset: number | undefined;

  for (const key of keys) {
    const resolved = resolveVariantValue(normalState[key], targetState[key], index, frameCount);
    if (resolved == null) {
      continue;
    }

    switch (key) {
      case "x":
      case "translateX":
        transformParts.push(`translateX(${resolved}px)`);
        break;
      case "y":
      case "translateY":
        transformParts.push(`translateY(${resolved}px)`);
        break;
      case "scale":
        transformParts.push(`scale(${resolved})`);
        break;
      case "scaleX":
        transformParts.push(`scaleX(${resolved})`);
        break;
      case "scaleY":
        transformParts.push(`scaleY(${resolved})`);
        break;
      case "rotate":
        transformParts.push(`rotate(${resolved}deg)`);
        break;
      case "pathLength":
        if (typeof resolved === "number") {
          currentPathLength = resolved;
        }
        break;
      case "pathOffset":
        if (typeof resolved === "number") {
          currentPathOffset = resolved;
        }
        break;
      default:
        frame[key] = resolved;
        break;
    }
  }

  if (transformParts.length > 0) {
    frame.transform = transformParts.join(" ");
  } else {
    frame.transform = "none";
  }

  if (pathLength != null && (currentPathLength != null || currentPathOffset != null)) {
    const lengthRatio = currentPathLength ?? 1;
    const offsetRatio = currentPathOffset ?? 0;
    frame.strokeDasharray = `${pathLength * lengthRatio} ${pathLength}`;
    frame.strokeDashoffset = `${pathLength * offsetRatio}`;
  }

  return frame;
}

function resolveVariantValue(
  normalValue: VariantState[string],
  targetValue: VariantState[string],
  index: number,
  frameCount: number
) {
  if (Array.isArray(targetValue)) {
    return targetValue[index] ?? targetValue[targetValue.length - 1];
  }

  if (typeof targetValue === "number" || typeof targetValue === "string") {
    if (frameCount === 2 && (typeof normalValue === "number" || typeof normalValue === "string")) {
      return index === 0 ? normalValue : targetValue;
    }

    return targetValue;
  }

  if (Array.isArray(normalValue)) {
    return normalValue[index] ?? normalValue[normalValue.length - 1];
  }

  if (typeof normalValue === "number" || typeof normalValue === "string") {
    return normalValue;
  }

  return undefined;
}

function getFrameCount(value: VariantState[string]) {
  return Array.isArray(value) ? value.length : 0;
}

function canMeasurePathLength(element: SVGElement): element is SVGGeometryElement {
  return typeof (element as SVGGeometryElement).getTotalLength === "function";
}

function safeTotalLength(element: SVGGeometryElement) {
  try {
    return element.getTotalLength();
  } catch {
    return 0;
  }
}

function mapMotionEase(ease: unknown) {
  switch (ease) {
    case "easeIn":
      return "ease-in";
    case "easeOut":
      return "ease-out";
    case "easeInOut":
      return "ease-in-out";
    case "linear":
      return "linear";
    default:
      return "ease-in-out";
  }
}
