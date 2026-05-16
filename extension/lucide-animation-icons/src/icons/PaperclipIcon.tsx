/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

'hydrate';

import { useRef } from "@adaptive-js/web";
import {
    AnimatedIconController,
    cn,
    collectElements,
    createIconAnimation,
    createMouseHandlers,
    type AnimatedLucideIconProps,
    useAnimatedIconHandle
} from "../base.js";

export type PaperclipIconProps = AnimatedLucideIconProps;

export function PaperclipIcon({
                                  onMouseEnter,
                                  onMouseLeave,
                                  className,
                                  size = 28,
                                  duration = 600,
                                  animateOnHover = true,
                                  iconRef,
                                  ...props
                              }: PaperclipIconProps) {
    const controller = useRef<AnimatedIconController>(new AnimatedIconController());
    const pathRef = useRef<SVGPathElement>(null);

    const getTargets = () => collectElements(pathRef.current);

    const startAnimation = () => {
        if (!pathRef.current) return;

        const length = pathRef.current.getTotalLength();

        pathRef.current.style.strokeDasharray = `${length}`;
        pathRef.current.style.strokeDashoffset = `${length}`;

        controller.current?.start([
            () =>
                createIconAnimation(
                    pathRef.current!,
                    [
                        { strokeDashoffset: `${length}` },
                        { strokeDashoffset: `${length}` },
                        { strokeDashoffset: `${length * 2}` }
                    ],
                    duration,
                    0,
                    "ease-in"
                )
        ]);
    };

    const stopAnimation = () => {
        controller.current?.reset(getTargets(), Math.max(180, duration - 120));
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
          //  onMouseEnter={mouseHandlers.onMouseLeave }
            onMouseLeave={mouseHandlers.onMouseEnter}
            {...props}
        >
            <svg
                fill="none"
                height={size}
                overflow="visible"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width={size}
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    ref={pathRef}
                    d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
            </svg>
        </div>
    );
}