
/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import type {AdaptiveNode} from "@adaptive-js/web/jsx-runtime";
import { useLayoutEffect, useReactive, useRef} from "@adaptive-js/web";

export type ListVirtualProps<T> = {
    items: T[];
    height?: number | string;
    itemHeight: number;
    width?: number | string;
    overscan?: number;
    className?: string;
    emptyState?: AdaptiveNode;
    item: (item: T, index: number) => AdaptiveNode;
    onItemClick?: (item: T, index: number, event: MouseEvent) => void;
};

const DEFAULT_OVERSCAN = 6;

export function ListVirtual<T>(props: ListVirtualProps<T>) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const itemHeightsRef = useRef<Map<number, number>>(new Map());
    const rowObserversRef = useRef<Map<number, ResizeObserver>>(new Map());

    const scrollTopRef = useRef(0);



    const viewportHeightRef = useRef(
        typeof props.height === "number" ? props.height : 0
    );

    const getViewportHeight = () => {
        const viewport = viewportRef.current;
        const parent = viewport?.parentElement;

        if (typeof props.height === "number") {
            return props.height;
        }

        if (typeof props.height === "string" && props.height.endsWith("px")) {
            const value = Number.parseFloat(props.height);
            if (Number.isFinite(value)) return value;
        }

        return (
            parent?.clientHeight ||
            viewport?.clientHeight ||
            viewportHeightRef.current ||
            0
        );
    };

    const [renderVersion, forceRender] = useReactive(0);

    const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;
    const estimatedHeight = () => props.itemHeight;

    const getItemHeight = (index: number) => {
        return itemHeightsRef.current?.get(index) ?? estimatedHeight();
    };

    const getItemTop = (index: number) => {
        let top = 0;

        for (let i = 0; i < index; i += 1) {
            top += getItemHeight(i);
        }

        return top;
    };

    const totalHeight = () => {
        let height = 0;

        for (let i = 0; i < props.items.length; i += 1) {
            height += getItemHeight(i);
        }

        return height;
    };

    const resolveVisibleRange = () => {
        const scrollTop = scrollTopRef.current ?? 0;
        const viewportHeight = getViewportHeight();

        if (viewportHeight <= 0 || estimatedHeight() <= 0) {
            return {start: 0, end: 0};
        }

        const minY = Math.max(0, scrollTop - overscan() * estimatedHeight());
        const maxY = scrollTop + viewportHeight + overscan() * estimatedHeight();

        let start = 0;
        let end = props.items.length;

        let y = 0;

        for (let i = 0; i < props.items.length; i += 1) {
            const h = getItemHeight(i);
            const nextY = y + h;

            if (nextY >= minY) {
                start = i;
                break;
            }

            y = nextY;
        }

        y = getItemTop(start);

        for (let i = start; i < props.items.length; i += 1) {
            y += getItemHeight(i);

            if (y >= maxY) {
                end = Math.min(props.items.length, i + 1);
                break;
            }
        }

        return {start, end};
    };

    const registerRow = (index: number) => {
        return (element: HTMLDivElement | null) => {
            const previousObserver = rowObserversRef.current?.get(index);

            if (previousObserver) {
                previousObserver.disconnect();
                rowObserversRef.current?.delete(index);
            }

            if (!element) {
                return;
            }

            const syncHeight = () => {
                const nextHeight = element.offsetHeight;

                if (nextHeight <= 0) {
                    return;
                }

                const currentHeight = itemHeightsRef.current?.get(index);

                if (Object.is(currentHeight, nextHeight)) {
                    return;
                }

                itemHeightsRef.current?.set(index, nextHeight);
                forceRender((value) => value + 1);
            };

            syncHeight();

            const observer = new ResizeObserver(syncHeight);
            observer.observe(element);

            rowObserversRef.current?.set(index, observer);
        };
    };

    useLayoutEffect(() => {

        const viewport = viewportRef.current;

        if (!viewport) {
            return;
        }

        let frame = 0;

        const syncViewportHeight = () => {
            const nextHeight = getViewportHeight();

            if (nextHeight <= 0) {
                return;
            }

            if (Object.is(viewportHeightRef.current, nextHeight)) {
                return;
            }

            viewportHeightRef.current = nextHeight;
            forceRender((value) => value + 1);
        };

        syncViewportHeight();

        const resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(syncViewportHeight);
        });

        const onViewportScroll = () => {
            scrollTopRef.current = viewport.scrollTop;
            forceRender((value) => value + 1);
        };

        resizeObserver.observe(viewport);

        viewport.addEventListener("scroll", onViewportScroll, {
            passive: true
        });

        return () => {
            cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            viewport.removeEventListener("scroll", onViewportScroll);

            for (const observer of (rowObserversRef.current?.values() ?? [])) {
                observer.disconnect();
            }

            rowObserversRef.current?.clear();
        };
    }, [props.height, props.width]);

    if (props.items.length === 0) {
        return (
            <div
                className={props.className}
                style={resolveContainerStyle(props.height, props.width, {
                    display: "grid",
                    placeItems: "center"
                })}
            >
                {props.emptyState ?? "Empty list"}
            </div>
        );
    }



    return (<div
            className={props.className}
            style={resolveContainerStyle(props.height, props.width, {
                overflow: "hidden"
            })}
        >
            <div
                ref={viewportRef}
                style={{
                    position: "absolute",
                    inset: "0",
                    overflowY: "auto",
                    overflowX: "hidden"
                }}
            >
                <div
                    style={{
                        position: "relative",
                        height: `${totalHeight()}px`
                    }}
                >
                    { () => {

                        renderVersion()
                        const {start, end} = resolveVisibleRange();

                        return (
                            <>
                                {props.items.slice(start, end).map((item, offset) => {
                                    const index = start + offset;

                                    return () => (
                                        <div
                                            key={index}
                                            ref={registerRow(index)}
                                            onClick={(event) => {
                                                props.onItemClick?.(
                                                    item,
                                                    index,
                                                    event as MouseEvent
                                                );
                                            }}
                                            style={{
                                                position: "absolute",
                                                top: `${getItemTop(index)}px`,
                                                left: "0",
                                                right: "0",
                                                minHeight: `${props.itemHeight}px`
                                            }}
                                        >
                                            {props.item(item, index)}
                                        </div>
                                    );
                                })}
                            </>
                        );

                    } }
                </div>
            </div>
        </div>
    );
}

function normalizeCssSize(value: number | string | undefined) {
    if (value == null) return "100%";
    return typeof value === "number" ? `${value}px` : value;
}

function resolveContainerStyle(
    height: number | string | undefined,
    width: number | string | undefined,
    extra: Record<string, string>
) {
    return {
        position: "relative",
        height: normalizeCssSize(height),
        width: normalizeCssSize(width),
        ...extra
    };
}