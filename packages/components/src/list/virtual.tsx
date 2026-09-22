/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import type { AdaptiveNode } from "@adaptive-js/web/jsx-runtime";
import { layoutEvents, ref, signal } from "@adaptive-js/web";

export type ListVirtualProps<T> = {
    /**
     * Fonte dos itens. Prefira um getter para listas reativas; o array direto
     * continua aceito para dados estáticos e compatibilidade.
     */
    items: T[] | (() => T[]);
    /** Altura do viewport (px ou CSS). String "100%" resolve via parent. */
    height?: number | string;
    /**
     * Estimate inicial de cada item (px).
     * Usado até o ResizeObserver medir a altura real.
     * Para listas heterogéneas (chat), usa um valor próximo da mediana/pior caso razoável.
     */
    itemHeight: number;
    width?: number | string;
    overscan?: number;
    className?: string;
    emptyState?: AdaptiveNode;
    /** Render de cada item */
    item: (item: T, index: number) => AdaptiveNode;
    /**
     * Key estável do item (obrigatório para alturas corretas quando a lista
     * filtra, reordena ou troca de dataset — ex.: mudar de conversa).
     */
    getItemKey: (item: T, index: number) => string | number;
    onItemClick?: (item: T, index: number, event: MouseEvent) => void;
};

const DEFAULT_OVERSCAN = 6;

export function ListVirtual<T>(props: ListVirtualProps<T>) {
    const viewportRef = ref<HTMLDivElement | null>(null);

    /** key → altura medida (px) */
    const heightByKeyRef = ref<Map<string, number>>(new Map());
    /** index visível → ResizeObserver */
    const rowObserversRef = ref<Map<number, ResizeObserver>>(new Map());
    /** index → key atual (para invalidar observers) */
    const indexToKeyRef = ref<Map<number, string>>(new Map());

    const scrollTopRef = ref(0);
    const viewportHeightRef = ref(
        typeof props.height === "number" ? props.height : 0,
    );

    /** Bump de layout: scroll, resize, measure, troca de items */
    const [layoutVersion, bumpLayout] = signal(0);

    const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;
    const estimatedHeight = () => Math.max(1, props.itemHeight);
    const getItems = (): T[] =>
        typeof props.items === "function" ? props.items() : props.items;

    const keyOf = (item: T, index: number) =>
        String(props.getItemKey(item, index));

    const getItemHeightByKey = (key: string) =>
        heightByKeyRef.current?.get(key) ?? estimatedHeight();

    const getItemHeightAt = (items: T[], index: number) => {
        const item = items[index];
        if (item === undefined) return estimatedHeight();
        return getItemHeightByKey(keyOf(item, index));
    };

    const getItemTop = (items: T[], index: number) => {
        let top = 0;
        for (let i = 0; i < index; i += 1) {
            top += getItemHeightAt(items, i);
        }
        return top;
    };

    const totalHeight = (items: T[]) => {
        let height = 0;
        for (let i = 0; i < items.length; i += 1) {
            height += getItemHeightAt(items, i);
        }
        return height;
    };

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

    /**
     * Quando a lista muda de identidade (filtro, outra conversa, etc.),
     * remove do cache keys que já não existem — mantém as que ainda servem
     * (ex.: scroll na mesma conversa com append).
     */
    const pruneHeightCache = (items: T[]) => {
        const map = heightByKeyRef.current;
        if (!map) return;

        const live = new Set<string>();
        for (let i = 0; i < items.length; i += 1) {
            live.add(keyOf(items[i], i));
        }

        for (const key of map.keys()) {
            if (!live.has(key)) {
                map.delete(key);
            }
        }
    };

    const resolveVisibleRange = (items: T[]) => {
        const scrollTop = scrollTopRef.current ?? 0;
        const viewportHeight = getViewportHeight();
        const estimate = estimatedHeight();
        const count = items.length;

        if (count === 0 || estimate <= 0) {
            return { start: 0, end: 0 };
        }

        // Antes do primeiro layout não há clientHeight. Renderiza uma janela
        // inicial para a lista nunca aparecer vazia; o ResizeObserver substitui
        // este intervalo pela faixa precisa assim que o viewport for medido.
        if (viewportHeight <= 0) {
            return {
                start: 0,
                end: Math.min(count, Math.max(1, overscan() * 2 + 1)),
            };
        }

        const minY = Math.max(0, scrollTop - overscan() * estimate);
        const maxY = scrollTop + viewportHeight + overscan() * estimate;

        let start = 0;
        let y = 0;

        for (let i = 0; i < count; i += 1) {
            const h = getItemHeightAt(items, i);
            const nextY = y + h;
            if (nextY >= minY) {
                start = i;
                break;
            }
            y = nextY;
            if (i === count - 1) {
                start = i;
            }
        }

        y = getItemTop(items, start);
        let end = count;

        for (let i = start; i < count; i += 1) {
            y += getItemHeightAt(items, i);
            if (y >= maxY) {
                end = Math.min(count, i + 1);
                break;
            }
        }

        return { start, end };
    };

    const disconnectRow = (index: number) => {
        const previous = rowObserversRef.current?.get(index);
        if (previous) {
            previous.disconnect();
            rowObserversRef.current?.delete(index);
        }
        indexToKeyRef.current?.delete(index);
    };

    const registerRow = (index: number, key: string) => {
        return (element: HTMLDivElement | null) => {
            disconnectRow(index);

            if (!element) {
                return;
            }

            indexToKeyRef.current?.set(index, key);

            const syncHeight = () => {
                // Só confia na medida se a key deste index ainda for a mesma
                if (indexToKeyRef.current?.get(index) !== key) {
                    return;
                }

                const nextHeight = Math.ceil(element.getBoundingClientRect().height);

                if (nextHeight <= 0) {
                    return;
                }

                const map = heightByKeyRef.current;
                if (!map) return;

                const current = map.get(key);
                if (Object.is(current, nextHeight)) {
                    return;
                }

                map.set(key, nextHeight);
                bumpLayout((v) => v + 1);
            };

            // measure após layout (imagens/fontes podem mudar na frame seguinte)
            syncHeight();
            requestAnimationFrame(syncHeight);

            const observer = new ResizeObserver(() => {
                syncHeight();
            });
            observer.observe(element);
            rowObserversRef.current?.set(index, observer);
        };
    };

    layoutEvents(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        let frame = 0;

        const syncViewportHeight = () => {
            const nextHeight = getViewportHeight();
            if (nextHeight <= 0) return;
            if (Object.is(viewportHeightRef.current, nextHeight)) return;
            viewportHeightRef.current = nextHeight;
            bumpLayout((v) => v + 1);
        };

        syncViewportHeight();

        const resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(syncViewportHeight);
        });

        const onViewportScroll = () => {
            scrollTopRef.current = viewport.scrollTop;
            bumpLayout((v) => v + 1);
        };

        resizeObserver.observe(viewport);
        if (viewport.parentElement) {
            resizeObserver.observe(viewport.parentElement);
        }

        viewport.addEventListener("scroll", onViewportScroll, { passive: true });

        return () => {
            cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            viewport.removeEventListener("scroll", onViewportScroll);

            for (const observer of rowObserversRef.current?.values() ?? []) {
                observer.disconnect();
            }
            rowObserversRef.current?.clear();
            indexToKeyRef.current?.clear();
        };
    }, [props.height, props.width]);

    // Assina o getter para invalidar o cache até quando o tamanho não muda.
    layoutEvents(() => {
        pruneHeightCache(getItems());
        bumpLayout((v) => v + 1);
    }, []);

    return (
        <div
            className={props.className}
            style={resolveContainerStyle(props.height, props.width, {
                overflow: "hidden",
            })}
        >
            <div
                ref={viewportRef}
                style={{
                    position: "absolute",
                    inset: "0",
                    overflowY: "auto",
                    overflowX: "hidden",
                }}
            >
                {() => {
                    const items = getItems();
                    layoutVersion();

                    if (items.length === 0) {
                        return (
                            <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
                                {props.emptyState ?? "Empty list"}
                            </div>
                        );
                    }

                    const { start, end } = resolveVisibleRange(items);
                    const slice = items.slice(start, end);

                    return (
                        <div
                            style={{
                                position: "relative",
                                width: "100%",
                                height: `${totalHeight(items)}px`,
                            }}
                        >
                            {slice.map((item, offset) => {
                                const index = start + offset;
                                const key = keyOf(item, index);
                                const top = getItemTop(items, index);

                                return (
                                    <div
                                        key={key}
                                        ref={registerRow(index, key)}
                                        onClick={(event) => {
                                            props.onItemClick?.(
                                                item,
                                                index,
                                                event as MouseEvent,
                                            );
                                        }}
                                        style={{
                                            position: "absolute",
                                            top: `${top}px`,
                                            left: "0",
                                            right: "0",
                                            minHeight: `${estimatedHeight()}px`,
                                            boxSizing: "border-box",
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
    extra: Record<string, string>,
) {
    return {
        position: "relative" as const,
        height: normalizeCssSize(height),
        width: normalizeCssSize(width),
        ...extra,
    };
}
