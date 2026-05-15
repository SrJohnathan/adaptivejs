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

export type SendIconProps = AnimatedLucideIconProps;

export function SendIcon({
                             onMouseEnter,
                             onMouseLeave,
                             className,
                             size = 28,
                             duration = 500,
                             animateOnHover = true,
                             iconRef,
                             ...props
                         }: SendIconProps) {
    const controller = useRef<AnimatedIconController>(new AnimatedIconController());
    const planeRef = useRef<SVGGElement>(null);
    const trailRef = useRef<SVGPathElement>(null);

    const getTargets = () => collectElements(planeRef.current, trailRef.current);

    const startAnimation = () => {
        if (!planeRef.current || !trailRef.current) return;

        const trailLength = trailRef.current.getTotalLength();

        trailRef.current.style.strokeDasharray = `${trailLength}`;
        trailRef.current.style.strokeDashoffset = `${trailLength}`;

        controller.current?.start([
            () =>
                createIconAnimation(
                    planeRef.current!,
                    [
                        { transform: "translate(0px, 0px) scale(1)" },
                        { transform: "translate(3px, -3px) scale(0.8)" }
                    ],
                    duration,
                    0,
                    "ease-in-out"
                ),
            () =>
                createIconAnimation(
                    trailRef.current!,
                    [
                        {
                            opacity: 0,
                            transform: "translate(-3px, 3px)",
                            strokeDashoffset: `${trailLength}`
                        },
                        {
                            opacity: 1,
                            transform: "translate(0px, 0px)",
                            strokeDashoffset: "0"
                        }
                    ],
                    Math.max(300, duration + 50),
                    100,
                    "ease-in-out"
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
            onMouseEnter={mouseHandlers.onMouseEnter}
            onMouseLeave={mouseHandlers.onMouseLeave}
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
                <g
                    ref={planeRef}
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                >
                    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                    <path d="m21.854 2.147-10.94 10.939" />
                </g>

                <path
                    ref={trailRef}
                    d="M -3 28 C -0.5 26.8 1.6 24.6 3.3 22 C 4.8 19.7 5.2 17.6 4.2 16.1 C 3.2 14.7 1.4 14.5 0.3 15.8 C -0.9 17.2 -0.6 19.4 1.2 20.4 C 3.4 21.5 6.4 19.4 9 15.8"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
            </svg>
        </div>
    );
}