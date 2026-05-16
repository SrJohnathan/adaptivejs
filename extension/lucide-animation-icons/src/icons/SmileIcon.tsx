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

export type SmileIconProps = AnimatedLucideIconProps;

export function SmileIcon({
                              onMouseEnter,
                              onMouseLeave,
                              className,
                              size = 28,
                              strokeWidth = 2,
                              duration = 800,
                              animateOnHover = true,
                              iconRef,
                              ...props
                          }: SmileIconProps) {
    const controller = useRef<AnimatedIconController>(new AnimatedIconController());

    const faceRef = useRef<SVGCircleElement>(null);
    const mouthRef = useRef<SVGPathElement>(null);
    const leftEyeRef = useRef<SVGLineElement>(null);
    const rightEyeRef = useRef<SVGLineElement>(null);

    const getTargets = () =>
        collectElements(faceRef.current, mouthRef.current, leftEyeRef.current, rightEyeRef.current);

    const startAnimation = () => {
        if (!faceRef.current || !mouthRef.current || !leftEyeRef.current || !rightEyeRef.current) {
            return;
        }

        const mouthLength = mouthRef.current.getTotalLength();

        mouthRef.current.style.strokeDasharray = `${mouthLength}`;
        mouthRef.current.style.strokeDashoffset = `${mouthLength * 0.7}`;

        controller.current?.start([
            () =>
                createIconAnimation(
                    faceRef.current!,
                    [
                        { transform: "scale(1) rotate(0deg)", strokeWidth: `${strokeWidth}` },
                        { transform: "scale(1.15) rotate(-3deg)", strokeWidth: `${strokeWidth + 0.5}` },
                        { transform: "scale(1.05) rotate(3deg)", strokeWidth: `${strokeWidth + 0.5}` },
                        { transform: "scale(1.1) rotate(0deg)", strokeWidth: `${strokeWidth + 0.5}` }
                    ],
                    duration,
                    0,
                    "ease-in-out"
                ),
            () =>
                createIconAnimation(
                    mouthRef.current!,
                    [
                        {
                            d: "M8 14s1.5 2 4 2 4-2 4-2",
                            strokeDashoffset: `${mouthLength * 0.7}`,
                            strokeWidth: `${strokeWidth}`
                        },
                        {
                            d: "M7 13.5s2.5 3.5 5 3.5 5-3.5 5-3.5",
                            strokeDashoffset: "0",
                            strokeWidth: `${strokeWidth + 0.5}`
                        },
                        {
                            d: "M7 13.5s2.5 3.5 5 3.5 5-3.5 5-3.5",
                            strokeDashoffset: "0",
                            strokeWidth: `${strokeWidth + 0.5}`
                        }
                    ],
                    Math.max(500, duration - 300),
                    100,
                    "ease-in-out"
                ),
            () =>
                createIconAnimation(
                    leftEyeRef.current!,
                    [
                        { transform: "scale(1)", opacity: 1 },
                        { transform: "scale(1.5)", opacity: 1 },
                        { transform: "scale(0.8)", opacity: 1 },
                        { transform: "scale(1.2)", opacity: 1 }
                    ],
                    Math.max(500, duration - 300),
                    0,
                    "ease-in-out"
                ),
            () =>
                createIconAnimation(
                    rightEyeRef.current!,
                    [
                        { transform: "scale(1)", opacity: 1 },
                        { transform: "scale(1.5)", opacity: 1 },
                        { transform: "scale(0.8)", opacity: 1 },
                        { transform: "scale(1.2)", opacity: 1 }
                    ],
                    Math.max(500, duration - 300),
                    0,
                    "ease-in-out"
                )
        ]);
    };

    const stopAnimation = () => {
        controller.current?.reset(getTargets(), Math.max(180, duration - 200));

        if (mouthRef.current) {
            mouthRef.current.style.strokeDasharray = "";
            mouthRef.current.style.strokeDashoffset = "";
            mouthRef.current.setAttribute("d", "M8 14s1.5 2 4 2 4-2 4-2");
        }
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
                strokeWidth={strokeWidth}
                viewBox="0 0 24 24"
                width={size}
                xmlns="http://www.w3.org/2000/svg"
            >
                <circle
                    ref={faceRef}
                    cx="12"
                    cy="12"
                    r="10"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />

                <path
                    ref={mouthRef}
                    d="M8 14s1.5 2 4 2 4-2 4-2"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />

                <line
                    ref={leftEyeRef}
                    x1="9"
                    x2="9.01"
                    y1="9"
                    y2="9"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />

                <line
                    ref={rightEyeRef}
                    x1="15"
                    x2="15.01"
                    y1="9"
                    y2="9"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
            </svg>
        </div>
    );
}