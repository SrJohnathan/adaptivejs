/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

'hydrate';

import { useRef } from "@adaptivejs/web";
import {
  AnimatedIconController,
  cn,
  collectElements,
  createIconAnimation,
  createMouseHandlers,
  type AnimatedLucideIconProps,
  useAnimatedIconHandle
} from "../base.js";

export type LayoutGridIconProps = AnimatedLucideIconProps;

export function LayoutGridIcon({
  onMouseEnter,
  onMouseLeave,
  className,
  size = 28,
  duration = 800,
  animateOnHover = true,
  iconRef,
  ...props
}: LayoutGridIconProps) {
  const controller = useRef<AnimatedIconController>(new AnimatedIconController());
  const rect1Ref = useRef<SVGRectElement>(null);
  const rect2Ref = useRef<SVGRectElement>(null);
  const rect3Ref = useRef<SVGRectElement>(null);
  const rect4Ref = useRef<SVGRectElement>(null);

  const getTargets = () =>
    collectElements(rect1Ref.current, rect2Ref.current, rect3Ref.current, rect4Ref.current);

  const startAnimation = () => {
    if (!rect1Ref.current || !rect2Ref.current || !rect3Ref.current || !rect4Ref.current) {
      return;
    }

    controller.current?.start([
      () =>
        createIconAnimation(
          rect1Ref.current!,
          [
            { transform: "translate(0px, 0px)" },
            { transform: "translate(11px, 0px)" },
            { transform: "translate(11px, 0px)" },
            { transform: "translate(0px, 0px)" }
          ],
          duration,
          0,
          "ease-in-out"
        ),
      () =>
        createIconAnimation(
          rect2Ref.current!,
          [
            { transform: "translate(0px, 0px)" },
            { transform: "translate(0px, 11px)" },
            { transform: "translate(0px, 11px)" },
            { transform: "translate(0px, 0px)" }
          ],
          duration,
          0,
          "ease-in-out"
        ),
      () =>
        createIconAnimation(
          rect3Ref.current!,
          [
            { transform: "translate(0px, 0px)" },
            { transform: "translate(-11px, 0px)" },
            { transform: "translate(-11px, 0px)" },
            { transform: "translate(0px, 0px)" }
          ],
          duration,
          0,
          "ease-in-out"
        ),
      () =>
        createIconAnimation(
          rect4Ref.current!,
          [
            { transform: "translate(0px, 0px)" },
            { transform: "translate(0px, -11px)" },
            { transform: "translate(0px, -11px)" },
            { transform: "translate(0px, 0px)" }
          ],
          duration,
          0,
          "ease-in-out"
        )
    ]);
  };

  const stopAnimation = () => {
    controller.current?.reset(getTargets(), Math.max(220, duration - 220));
  };

  useAnimatedIconHandle(iconRef, controller, getTargets, startAnimation, stopAnimation);

  const mouseHandlers = createMouseHandlers(
    animateOnHover,
    startAnimation,
    stopAnimation,
    onMouseEnter,
    onMouseLeave
  );

  return (
    <div
      className={cn("adaptive-lucide-animation-icon", className)}
      onMouseEnter={mouseHandlers.onMouseEnter}
      onMouseLeave={mouseHandlers.onMouseLeave}
      {...props}
    >
      <svg
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
        <rect
          ref={rect1Ref}
          height="7"
          rx="1"
          width="7"
          x="3"
          y="3"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <rect
          ref={rect2Ref}
          height="7"
          rx="1"
          width="7"
          x="14"
          y="3"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <rect
          ref={rect3Ref}
          height="7"
          rx="1"
          width="7"
          x="14"
          y="14"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <rect
          ref={rect4Ref}
          height="7"
          rx="1"
          width="7"
          x="3"
          y="14"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </svg>
    </div>
  );
}
