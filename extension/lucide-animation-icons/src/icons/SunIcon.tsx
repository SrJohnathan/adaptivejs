'hydrate';

import { useRef } from "@adaptivejs/web";
import type { AnimatedLucideIconProps } from "../base.js";
import {
  AnimatedIconController,
  cn,
  collectElements,
  createIconAnimation,
  useAnimatedIconHandle
} from "../base.js";

const SUN_RAYS = [
  "M12 2v2",
  "m19.07 4.93-1.41 1.41",
  "M20 12h2",
  "m17.66 17.66 1.41 1.41",
  "M12 20v2",
  "m6.34 17.66-1.41 1.41",
  "M2 12h2",
  "m4.93 4.93 1.41 1.41"
] as const;

export type SunIconProps = AnimatedLucideIconProps & {
  color?: string;
  strokeWidth?: number;
};

export function SunIcon({
  color = "currentColor",
  size = 24,
  strokeWidth = 2,
  className,
  onMouseEnter,
  onMouseLeave,
  duration = 1100,
  animateOnHover = true,
  iconRef,
  ...props
}: SunIconProps) {
  const controller = useRef(new AnimatedIconController());
  const isPlaying = useRef(false);
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rayRefs = Array.from({ length: SUN_RAYS.length }, () => useRef<SVGPathElement | null>(null));

  const getTargets = () => collectElements(...rayRefs.map((ref) => ref.current));

  const startAnimation = () => {
    if (isPlaying.current) {
      return;
    }

    isPlaying.current = true;
    if (resetTimeout.current) {
      clearTimeout(resetTimeout.current);
      resetTimeout.current = null;
    }
    controller.current?.stopRunningAnimations();

    controller.current?.start(
      rayRefs.map((ref, index) => () => {
        const element = ref.current;
        if (!element) {
          return null;
        }

        element.style.opacity = "0";
        return createIconAnimation(
          element,
          [{ opacity: 0 }, { opacity: 1 }],
          300,
          100 + index * 90,
          "ease-out"
        );
      })
    );

    resetTimeout.current = setTimeout(() => {
      isPlaying.current = false;
      resetTimeout.current = null;
    }, duration);
  };

  const stopAnimation = () => {
    isPlaying.current = false;
    if (resetTimeout.current) {
      clearTimeout(resetTimeout.current);
      resetTimeout.current = null;
    }
    controller.current?.destroy(getTargets());
  };

  useAnimatedIconHandle(iconRef, controller, getTargets, startAnimation, stopAnimation);

  return (
    <div
      className={cn(className)}
      aria-label="sun"
      role="img"
      onMouseEnter={(event: MouseEvent) => {
        if (animateOnHover) {
          startAnimation();
        }

        onMouseEnter?.(event);
      }}
      onMouseLeave={(event: MouseEvent) => {
        onMouseLeave?.(event);
      }}
      {...props}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        {SUN_RAYS.map((d, index) => (
          <path ref={rayRefs[index]} d={d} />
        ))}
      </svg>
    </div>
  );
}
