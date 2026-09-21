
/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import type {AdaptiveNode} from "@adaptive-js/web/jsx-runtime";
import {layoutEvents, ref, signal} from "@adaptive-js/web";

export type ListVirtualProps<T> = {
    items: T[];
    height?: number | string;
    itemHeight: number;
    width?: number | string;
    overscan?: number;
    className?: string;
    emptyState?: AdaptiveNode;
    item: (item: T, index: number) => AdaptiveNode;
    getItemKey?: (item: T, index: number) => string | number;
    onItemClick?: (item: T, index: number, event: MouseEvent) => void;
};

const DEFAULT_OVERSCAN = 6;

/** Altura assumida antes do layout medir o viewport real.
 * Usada para que SSR e o primeiro paint do client produzam a MESMA
 * janela visível (determinístico), evitando mismatch de hidratação. */
const DEFAULT_VIEWPORT_HEIGHT = 600;

export function ListVirtual<T>(props: ListVirtualProps<T>) {
    const viewportRef = ref<HTMLDivElement | null>(null);
    const itemHeightsRef = ref<Map<number, number>>(new Map());
    const itemIdentityRef = ref<Map<number, T>>(new Map());
    const itemKeysRef = ref<Map<number, string | number>>(new Map());
    const rowObserversRef = ref<Map<number, ResizeObserver>>(new Map());

    const scrollTopRef = ref(0);



    const viewportHeightRef = ref(
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

    const [renderVersion, forceRender] = signal(0);
    const [viewportReady, setViewportReady] = signal(false);

    const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;
    const estimatedHeight = () => props.itemHeight;
    const getRenderKey = (item: T, index: number) => {
        return props.getItemKey?.(item, index) ?? index;
    };

    const syncItemMeasurements = () => {
        for (let index = 0; index < props.items.length; index += 1) {
            const item = props.items[index];
            const key = props.getItemKey?.(item, index);
            const previousKey = itemKeysRef.current?.get(index);
            const previousItem = itemIdentityRef.current?.get(index);
            const itemChanged = props.getItemKey
                ? !Object.is(previousKey, key)
                : !Object.is(previousItem, item);

            if (itemChanged) {
                itemHeightsRef.current?.delete(index);
            }

            itemIdentityRef.current?.set(index, item);

            if (key == null) {
                itemKeysRef.current?.delete(index);
            } else {
                itemKeysRef.current?.set(index, key);
            }
        }

        for (const index of itemHeightsRef.current?.keys() ?? []) {
            if (index >= props.items.length) {
                itemHeightsRef.current?.delete(index);
            }
        }

        for (const index of itemIdentityRef.current?.keys() ?? []) {
            if (index >= props.items.length) {
                itemIdentityRef.current?.delete(index);
            }
        }

        for (const index of itemKeysRef.current?.keys() ?? []) {
            if (index >= props.items.length) {
                itemKeysRef.current?.delete(index);
            }
        }
    };

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

    const getItemsHeight = (start: number, end: number) => {
        let height = 0;

        for (let i = start; i < end; i += 1) {
            height += getItemHeight(i);
        }

        return height;
    };

    const resolvePaintViewportHeight = () => {
        if (typeof props.height === "number") {
            return props.height;
        }

        if (typeof props.height === "string" && props.height.endsWith("px")) {
            const value = Number.parseFloat(props.height);
            if (Number.isFinite(value)) return value;
        }

        if (viewportReady()) {
            const measured = getViewportHeight();
            return measured > 0 ? measured : DEFAULT_VIEWPORT_HEIGHT;
        }

        return DEFAULT_VIEWPORT_HEIGHT;
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
        const viewportHeight = resolvePaintViewportHeight();

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

    layoutEvents(() => {

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
            setViewportReady(true);
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
        itemHeightsRef.current?.clear();
        itemIdentityRef.current?.clear();
        itemKeysRef.current?.clear();

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

    syncItemMeasurements();

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
                {() => {
                    renderVersion();
                    const {start, end} = resolveVisibleRange();
                    const paddingTop = getItemTop(start);
                    const visibleHeight = getItemsHeight(start, end);
                    const paddingBottom = Math.max(
                        0,
                        totalHeight() - paddingTop - visibleHeight
                    );

                    return (
                        <div
                            style={{
                                position: "relative",
                                paddingTop: `${paddingTop}px`,
                                paddingBottom: `${paddingBottom}px`
                            }}
                        >
                            {props.items.slice(start, end).map((item, offset) => {
                                const index = start + offset;
                                const key = getRenderKey(item, index);

                                return (
                                    <div
                                        key={key}
                                        ref={registerRow(index)}
                                        onClick={(event) => {
                                            props.onItemClick?.(
                                                item,
                                                index,
                                                event as MouseEvent
                                            );
                                        }}
                                        style={{
                                            minHeight: `${props.itemHeight}px`
                                        }}
                                    >
                                        {props.item(item, index)}
                                    </div>
                                );
                            })}
                        </div>
                    );
                }}
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
