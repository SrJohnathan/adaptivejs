'client';

import { useRef } from "@adaptive-js/web";
import type { AnimatedLucideIconProps } from "../base.js";
import {
  AnimatedIconController,
  cn,
  createIconAnimation,
  useAnimatedIconHandle
} from "../base.js";

export type MoonIconProps = AnimatedLucideIconProps;

export function MoonIcon({
  onMouseEnter,
  onMouseLeave,
  className,
  size = 28,
  duration = 1200,
  animateOnHover = true,
  iconRef,
  ...props
}: MoonIconProps) {
  const controller = useRef(new AnimatedIconController());
  const svgRef = useRef<SVGSVGElement | null>(null);

  const getTargets = (): SVGElement[] => (svgRef.current ? [svgRef.current] : []);

  const startAnimation = () =>
    controller.current?.start([
      () => {
        if (!svgRef.current) {
          return null;
        }

        return createIconAnimation(
          svgRef.current,
          [
            { transform: "rotate(0deg)" },
            { transform: "rotate(-10deg)" },
            { transform: "rotate(10deg)" },
            { transform: "rotate(-5deg)" },
            { transform: "rotate(5deg)" },
            { transform: "rotate(0deg)" }
          ],
          duration,
          0,
          "ease-in-out"
        );
      }
    ]);

  const stopAnimation = () => {
    controller.current?.destroy(getTargets());
  };

  useAnimatedIconHandle(iconRef, controller, getTargets, startAnimation, stopAnimation);

  return (
    <div
      className={cn(className)}
      onMouseEnter={(event: MouseEvent) => {
        if (animateOnHover) {
          startAnimation();
        }

        onMouseEnter?.(event);
      }}
      onMouseLeave={(event: MouseEvent) => {
        if (animateOnHover) {
          stopAnimation();
        }

        onMouseLeave?.(event);
      }}
      {...props}
    >
      <svg
        ref={svgRef}
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </div>
  );
}
