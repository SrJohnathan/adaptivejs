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

export type SendIcon2Props = AnimatedLucideIconProps;

export function SendIcon2({
                              onMouseEnter,
                              onMouseLeave,
                              className,
                              size = 28,
                              strokeWidth = 2,
                              duration = 1200,
                              animateOnHover = true,
                              iconRef,
                              ...props
                          }: SendIcon2Props) {
    const controller = useRef<AnimatedIconController>(new AnimatedIconController());
    const groupRef = useRef<SVGGElement>(null);

    const getTargets = () => collectElements(groupRef.current);

    const startAnimation = () => {
        if (!groupRef.current) return;

        controller.current?.start([
            () =>
                createIconAnimation(
                    groupRef.current!,
                    [
                        { transform: "scale(1) translate(0px, 0px)" },

                        { transform: "scale(0.8) translate(-2.4px, 2.4px)" }, // -10%, +10%

                        { transform: "scale(1) translate(24px, -24px)" }, // 100%

                        { transform: "scale(1) translate(-30px, 30px)" }, // -125%

                        { transform: "scale(1) translate(0px, 0px)" }
                    ],
                    duration,
                    0,
                    "ease-in-out"
                )
        ]);
    };

    const stopAnimation = () => {
        controller.current?.reset(getTargets(), Math.max(180, duration - 200));
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
                <g
                    ref={groupRef}
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                >
                    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                    <path d="m21.854 2.147-10.94 10.939" />
                </g>
            </svg>
        </div>
    );
}