'hydrate'




/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 *
 * RecyclerView — pool fixo de hosts DOM (client-only).
 * Item = ItemNode; bind programático; effect só nas pontas.
 */

import type { AdaptiveNode } from "@adaptive-js/web/jsx-runtime";
import {
    cleanupEffectScope,
    createEffectScope,
    createReactiveEffect,
    layoutEvents,
    ref,
    runWithEffectScope,
    signal,
} from "@adaptive-js/web";

export type ItemValue =
    | string
    | number
    | boolean
    | (() => string | number | boolean);

export type ItemStyle =
    | Partial<CSSStyleDeclaration>
    | Record<string, string>
    | (() => Partial<CSSStyleDeclaration> | Record<string, string>);

export interface ItemNode {
    type: string;
    value?: ItemValue;
    class?: ItemValue;
    style?: ItemStyle;
    props?: Record<string, ItemValue>;
    onClick?: (event: MouseEvent) => void;
    onContextMenu?: (event: MouseEvent) => void;
    children?: ItemNode[];
}

export type RecyclerViewProps<T> = {
    items: T[] | (() => T[]);
    itemHeight: number;
    overscan?: number;
    height?: number | string;
    width?: number | string;
    className?: string;
    emptyState?: AdaptiveNode;
    item: (item: T, index: number) => ItemNode;
    getItemKey: (item: T, index: number) => string | number;
    onItemClick?: (item: T, index: number, event: MouseEvent) => void;
};

const DEFAULT_OVERSCAN = 4;
const POOL_PAD = 2;

type SlotRuntime = {
    host: HTMLDivElement | null;
    index: number;
    key: string;
    scope: ReturnType<typeof createEffectScope> | null;
};

function isItemValueGetter(
    v: ItemValue,
): v is () => string | number | boolean {
    return typeof v === "function";
}

function isItemStyleGetter(
    v: ItemStyle,
): v is () => Partial<CSSStyleDeclaration> | Record<string, string> {
    return typeof v === "function";
}

function applyItemNode(
    parent: HTMLElement,
    node: ItemNode,
    _scope: ReturnType<typeof createEffectScope>,
): HTMLElement {
    const el = document.createElement(node.type);

    const bindScalar = (write: (v: string) => void, value?: ItemValue) => {
        if (value == null) return;
        if (isItemValueGetter(value)) {
            createReactiveEffect(() => {
                write(String(value()));
            });
        } else {
            write(String(value));
        }
    };

    bindScalar((v) => {
        el.className = v;
    }, node.class);

    if (node.style != null) {
        const styleValue = node.style;
        if (isItemStyleGetter(styleValue)) {
            createReactiveEffect(() => {
                const next = styleValue();
                if (next) Object.assign(el.style, next);
            });
        } else {
            Object.assign(el.style, styleValue);
        }
    }

    if (node.props) {
        for (const [k, v] of Object.entries(node.props)) {
            if (v == null) continue;
            if (isItemValueGetter(v)) {
                createReactiveEffect(() => {
                    const next = v();
                    if (typeof next === "boolean") {
                        if (next) el.setAttribute(k, "");
                        else el.removeAttribute(k);
                    } else {
                        el.setAttribute(k, String(next));
                    }
                });
            } else if (typeof v === "boolean") {
                if (v) el.setAttribute(k, "");
                else el.removeAttribute(k);
            } else {
                el.setAttribute(k, String(v));
            }
        }
    }

    if (node.onClick) {
        el.addEventListener("click", node.onClick as EventListener);
    }
    if (node.onContextMenu) {
        el.addEventListener("contextmenu", node.onContextMenu as EventListener);
    }

    if (node.children?.length) {
        for (const child of node.children) {
            applyItemNode(el, child, _scope);
        }
    } else if (node.value != null) {
        const text = document.createTextNode("");
        el.appendChild(text);
        bindScalar((v) => {
            text.textContent = v;
        }, node.value);
    }

    parent.appendChild(el);
    return el;
}

export function RecyclerView<T>(props: RecyclerViewProps<T>) {

    const viewportRef = ref<HTMLDivElement | null>(null);
    const spacerRef = ref<HTMLDivElement | null>(null);

    const scrollTopRef = ref(0);
    const viewportHeightRef = ref(
        typeof props.height === "number" ? props.height : 0,
    );
    const layoutFrameRef = ref(0);
    const slotsRef = ref<SlotRuntime[]>([]);
    const [poolVersion, bumpPool] = signal(0);
    /** evita reassign em loop no microtask */
    const pendingFlushRef = ref(false);

    const overscan = () => Math.max(0, props.overscan ?? DEFAULT_OVERSCAN);
    const rowHeight = () => Math.max(1, props.itemHeight);

    const getItems = (): T[] =>
        typeof props.items === "function" ? props.items() : props.items;

    const keyOf = (item: T, index: number) =>
        String(props.getItemKey(item, index));

    const getViewportHeight = () => {
        const viewport = viewportRef.current;
        const parent = viewport?.parentElement;

        if (typeof props.height === "number") return props.height;
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

    const poolSize = () => {
        const vh = getViewportHeight() || viewportHeightRef.current || 400;
        const visible = Math.ceil(vh / rowHeight()) + 1;
        return visible + overscan() * 2 + POOL_PAD;
    };

    const totalHeight = (count: number) => count * rowHeight();

    const applySpacer = (count: number) => {
        const el = spacerRef.current;
        if (!el) return;
        el.style.height = `${totalHeight(count)}px`;
    };

    const disposeSlotContent = (slot: SlotRuntime) => {
        if (slot.scope) {
            cleanupEffectScope(slot.scope);
            slot.scope = null;
        }
        const host = slot.host;
        if (host) {
            while (host.firstChild) host.removeChild(host.firstChild);
        }
    };

    /**
     * Sempre grava index/key. Se host ainda não existe, fica pendente —
     * registerHost completa o bind quando o ref chega.
     */
    const bindSlot = (slot: SlotRuntime, index: number, key: string) => {
        slot.index = index;
        slot.key = key;

        const host = slot.host;
        if (!host) return;

        const items = getItems();
        const row = items[index];
        if (row === undefined) {
            disposeSlotContent(slot);
            slot.index = -1;
            slot.key = "";
            host.style.visibility = "hidden";
            host.style.top = "-9999px";
            return;
        }

        disposeSlotContent(slot);

        const scope = createEffectScope("recycler-slot");
        slot.scope = scope;

        const h = rowHeight();
        host.style.visibility = "visible";
        host.style.top = `${index * h}px`;
        host.style.height = `${h}px`;

        runWithEffectScope(scope, () => {
            const tree = props.item(row, index);
            applyItemNode(host, tree, scope);
        });
    };

    const clearSlot = (slot: SlotRuntime) => {
        disposeSlotContent(slot);
        slot.index = -1;
        slot.key = "";
        if (slot.host) {
            slot.host.style.visibility = "hidden";
            slot.host.style.top = "-9999px";
        }
    };

    const ensureSlotCount = (n: number) => {
        const slots = slotsRef.current ?? [];
        let grew = false;
        while (slots.length < n) {
            slots.push({ host: null, index: -1, key: "", scope: null });
            grew = true;
        }
        slotsRef.current = slots;
        if (grew) bumpPool((v) => v + 1);
    };

    const registerHost = (slotId: number) => (el: HTMLDivElement | null) => {
        const slots = slotsRef.current ?? [];
        let slot = slots[slotId];

        // Pool pode ter crescido no mesmo tick: garante entrada
        if (!slot) {
            ensureSlotCount(slotId + 1);
            slot = slotsRef.current![slotId];
        }
        if (!slot) return;

        if (!el) {
            disposeSlotContent(slot);
            slot.host = null;
            return;
        }

        slot.host = el;

        // Atribuição pendente (reassign correu antes dos refs)
        if (slot.index >= 0) {
            bindSlot(slot, slot.index, slot.key || String(slot.index));
        }
    };

    const indexFromScroll = (scrollTop: number, count: number) => {
        if (count <= 0) return 0;
        return Math.max(
            0,
            Math.min(count - 1, Math.floor(scrollTop / rowHeight())),
        );
    };

    const reassignSlots = (force = false) => {
        const items = getItems();
        const count = items.length;
        const vh = getViewportHeight();
        if (vh > 0) viewportHeightRef.current = vh;

        const n = poolSize();
        ensureSlotCount(n);
        const slots = slotsRef.current ?? [];

        applySpacer(count);

        if (count === 0) {
            for (let s = 0; s < slots.length; s += 1) clearSlot(slots[s]!);
            return;
        }

        const scrollTop = scrollTopRef.current ?? 0;
        const firstVisible = indexFromScroll(scrollTop, count);
        const firstIndex = Math.max(0, firstVisible - overscan());

        for (let s = 0; s < n; s += 1) {
            const slot = slots[s]!;
            const index = firstIndex + s < count ? firstIndex + s : -1;

            if (index < 0) {
                if (slot.index !== -1 || force) clearSlot(slot);
                continue;
            }

            const key = keyOf(items[index]!, index);

            // Mesmo índice+key e já tem DOM montado → só posição
            if (
                !force &&
                slot.index === index &&
                slot.key === key &&
                slot.host &&
                slot.scope
            ) {
                const h = rowHeight();
                slot.host.style.top = `${index * h}px`;
                continue;
            }

            bindSlot(slot, index, key);
        }
    };

    const scheduleLayout = () => {
        if (layoutFrameRef.current) return;
        layoutFrameRef.current = requestAnimationFrame(() => {
            layoutFrameRef.current = 0;
            reassignSlots(false);
        });
    };

    /** Após o pool montar refs no DOM */
    const scheduleFlush = () => {
        if (pendingFlushRef.current) return;
        pendingFlushRef.current = true;
        queueMicrotask(() => {
            pendingFlushRef.current = false;
            reassignSlots(true);
        });
    };

    layoutEvents(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        let frame = 0;

        const syncViewportHeight = () => {
            const next = getViewportHeight();
            if (next > 0) viewportHeightRef.current = next;
            reassignSlots(true);
        };

        // client: um frame para o layout resolver height 100%
        requestAnimationFrame(() => {
            syncViewportHeight();
        });

        const resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(syncViewportHeight);
        });

        const onScroll = () => {
            scrollTopRef.current = viewport.scrollTop;
            scheduleLayout();
        };

        resizeObserver.observe(viewport);
        if (viewport.parentElement) {
            resizeObserver.observe(viewport.parentElement);
        }
        viewport.addEventListener("scroll", onScroll, { passive: true });

        return () => {
            cancelAnimationFrame(frame);
            cancelAnimationFrame(layoutFrameRef.current ?? 0);
            layoutFrameRef.current = 0;
            resizeObserver.disconnect();
            viewport.removeEventListener("scroll", onScroll);
            for (const slot of slotsRef.current ?? []) disposeSlotContent(slot);
        };
    }, [props.height, props.width, props.itemHeight]);

    // items mudaram
    layoutEvents(() => {
        getItems();
        scheduleFlush();
    }, []);

    return (
         <div
             className={ () =>   props.className ? props.className : ""}
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
                    poolVersion();
                    const items = getItems();

                    if (items.length === 0) {
                        return props.emptyState ?? null;
                    }

                    const n = Math.max(poolSize(), slotsRef.current?.length ?? 0, 1);
                    ensureSlotCount(n);
                    const h = rowHeight();
                    const total = totalHeight(items.length);

                    // Refs dos hosts ainda não existem neste tick
                    scheduleFlush();

                    return (
                        <div
                            ref={spacerRef}
                            style={{
                                position: "relative",
                                height: `${total}px`,
                                width: "100%",
                            }}
                        >
                            {Array.from({ length: n }, (_, slotId) => (
                                <div
                                    key={`slot-${slotId}`}
                                    ref={registerHost(slotId)}
                                    style={{
                                        position: "absolute",
                                        left: 0,
                                        right: 0,
                                        height: `${h}px`,
                                        boxSizing: "border-box",
                                        top: "-9999px",
                                        visibility: "hidden",
                                        overflow: "hidden",
                                    }}
                                    onClick={(event) => {
                                        const slot = slotsRef.current?.[slotId];
                                        if (!slot || slot.index < 0) return;
                                        const list = getItems();
                                        const row = list[slot.index];
                                        if (row === undefined) return;
                                        props.onItemClick?.(
                                            row,
                                            slot.index,
                                            event as MouseEvent,
                                        );
                                    }}
                                />
                            ))}
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