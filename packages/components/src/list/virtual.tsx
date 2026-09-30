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

type Range = { start: number; end: number };

export function ListVirtual<T>(props: ListVirtualProps<T>) {
    const viewportRef = ref<HTMLDivElement | null>(null);
    const innerRef = ref<HTMLDivElement | null>(null);

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

    /** Janela atualmente renderizada (fonte da verdade, não reativa) */
    const rangeRef = ref<Range>({ start: 0, end: 0 });
    /** Só muda quando a JANELA muda -> único gatilho de re-render por scroll */
    const [rangeVersion, bumpRange] = signal(0);
    const layoutFrameRef = ref(0);
    /** Quantidade de itens da última render (detecta append/filtro sem bump) */
    const lastCountRef = ref(0);

    const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;
    const estimatedHeight = () => Math.max(1, props.itemHeight);
    const getItems = (): T[] =>
        typeof props.items === "function" ? props.items() : props.items;

    const currentRange = (): Range => rangeRef.current ?? { start: 0, end: 0 };

    const keyOf = (item: T, index: number) =>
        String(props.getItemKey(item, index));

    /**
     * Keys na ordem do índice da última render. Detecta REORDENAÇÃO: mesma
     * quantidade, mesmo conjunto de keys, mas em posição diferente.
     *
     * Sem isso, uma lista que reordena com a mesma quantidade (uma conversa
     * que sobe para o topo ao receber mensagem) não recalcula a janela: o
     * `slice` continua nos índices antigos e a tela mostra os itens que
     * ocupavam aquelas posições, não os que passaram a ocupá-las.
     */
    const lastKeysRef = ref<string[]>([]);

    const itemsChangedShape = (items: T[]): boolean => {
        if (lastCountRef.current !== items.length) return true;
        const previous = lastKeysRef.current ?? [];
        if (previous.length !== items.length) return true;
        for (let i = 0; i < items.length; i += 1) {
            if (previous[i] !== keyOf(items[i], i)) return true;
        }
        return false;
    };

    const getItemHeightByKey = (key: string) =>
        heightByKeyRef.current?.get(key) ?? estimatedHeight();

    const getItemHeightAt = (items: T[], index: number) => {
        const item = items[index];
        if (item === undefined) return estimatedHeight();
        return getItemHeightByKey(keyOf(item, index));
    };

    const getItemTop = (items: T[], index: number) => {
        let top = 0;
        for (let i = 0; i < index; i += 1) top += getItemHeightAt(items, i);
        return top;
    };

    const totalHeight = (items: T[]) => getItemTop(items, items.length);

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

    /**
     * Remove do cache keys que já não existem — mantém as que ainda servem
     * (ex.: scroll na mesma conversa com append).
     */
    const pruneHeightCache = (items: T[]) => {
        const map = heightByKeyRef.current;
        if (!map) return;
        const live = new Set<string>();
        for (let i = 0; i < items.length; i += 1) live.add(keyOf(items[i], i));
        for (const key of map.keys()) if (!live.has(key)) map.delete(key);
    };

    /** Calcula a janela ideal (com overscan) para o scroll atual */
    const resolveVisibleRange = (items: T[]): Range => {
        const scrollTop = scrollTopRef.current ?? 0;
        const viewportHeight = getViewportHeight();
        const estimate = estimatedHeight();
        const count = items.length;

        if (count === 0) return { start: 0, end: 0 };

        // Antes do primeiro layout não há clientHeight: janela inicial para a
        // lista nunca aparecer vazia; o ResizeObserver refina depois.
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
            const nextY = y + getItemHeightAt(items, i);
            if (nextY >= minY) {
                start = i;
                break;
            }
            y = nextY;
            if (i === count - 1) start = i;
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

    /**
     * O viewport chegou perto do limite do overscan?
     * Só então vale recalcular a janela. Dentro da zona segura: zero re-render.
     */
    const reachedOverscanLimit = (items: T[]) => {
        const { start, end } = currentRange();
        const count = items.length;

        if (count === 0) return start !== 0 || end !== 0;
        if (end === 0 || start >= count) return true;

        const viewportHeight = getViewportHeight();
        if (viewportHeight <= 0) return false;

        const scrollTop = scrollTopRef.current ?? 0;
        const guard = Math.max(1, Math.floor(overscan() / 2)) * estimatedHeight();

        const windowTop = getItemTop(items, start);
        const windowBottom = getItemTop(items, Math.min(end, count));

        const nearTop = start > 0 && scrollTop - windowTop < guard;
        const nearBottom =
            end < count && windowBottom - (scrollTop + viewportHeight) < guard;

        return nearTop || nearBottom;
    };

    /** Só bump se a janela realmente mudou */
    const syncRange = (force = false) => {
        const items = getItems();
        if (!force && !reachedOverscanLimit(items)) return;

        const next = resolveVisibleRange(items);
        const cur = currentRange();
        if (next.start === cur.start && next.end === cur.end) return;

        rangeRef.current = next;
        bumpRange((v) => v + 1);
    };

    const spacerMetrics = (items: T[]) => {
        const { start, end } = currentRange();
        const safeEnd = Math.min(end, items.length);
        const total = totalHeight(items);
        const top = getItemTop(items, start);
        const bottom = Math.max(0, total - getItemTop(items, safeEnd));
        return { total, top, bottom };
    };

    /** Atualiza espaçadores direto no DOM: sem re-render */
    const applySpacers = () => {
        const el = innerRef.current;
        if (!el) return;
        const { total, top, bottom } = spacerMetrics(getItems());
        el.style.height = `${total}px`;
        el.style.paddingTop = `${top}px`;
        el.style.paddingBottom = `${bottom}px`;
    };

    /** Coalesce scroll/medição/resize em 1 trabalho por frame */
    const scheduleLayout = () => {
        if (layoutFrameRef.current) return;
        layoutFrameRef.current = requestAnimationFrame(() => {
            layoutFrameRef.current = 0;
            syncRange(false);
            applySpacers();
        });
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
            if (!element) return;

            indexToKeyRef.current?.set(index, key);

            const syncHeight = () => {
                // Só confia na medida se a key deste index ainda for a mesma
                if (indexToKeyRef.current?.get(index) !== key) return;

                const nextHeight = Math.ceil(element.getBoundingClientRect().height);
                if (nextHeight <= 0) return;

                const map = heightByKeyRef.current;
                if (!map) return;
                if (Object.is(map.get(key), nextHeight)) return;

                map.set(key, nextHeight);
                scheduleLayout(); // sem re-render: só espaçadores + checagem de borda
            };

            // measure após layout (imagens/fontes podem mudar na frame seguinte)
            syncHeight();
            requestAnimationFrame(syncHeight);

            const observer = new ResizeObserver(syncHeight);
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
            syncRange(true); // viewport mudou: janela pode precisar crescer
            applySpacers();
        };

        syncViewportHeight();

        const resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(syncViewportHeight);
        });

        const onViewportScroll = () => {
            scrollTopRef.current = viewport.scrollTop;
            scheduleLayout(); // NÃO re-renderiza; só checa o limite do overscan
        };

        resizeObserver.observe(viewport);
        if (viewport.parentElement) resizeObserver.observe(viewport.parentElement);
        viewport.addEventListener("scroll", onViewportScroll, { passive: true });

        return () => {
            cancelAnimationFrame(frame);
            cancelAnimationFrame(layoutFrameRef.current ?? 0);
            layoutFrameRef.current = 0;
            resizeObserver.disconnect();
            viewport.removeEventListener("scroll", onViewportScroll);

            for (const observer of rowObserversRef.current?.values() ?? []) {
                observer.disconnect();
            }
            rowObserversRef.current?.clear();
            indexToKeyRef.current?.clear();
        };
    }, [props.height, props.width]);

    // Items mudaram (append, filtro, troca de conversa)
    layoutEvents(() => {
        const items = getItems();
        pruneHeightCache(items);
        // Só reposiciona a janela se ela ficou inválida ou encostou no limite.
        // Append fora da janela: nada de bump, só espaçadores.
        syncRange(false);
        applySpacers();
    }, []);

    return (
        <div
            className={props.className ? props.className : undefined}
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
                    rangeVersion(); // única assinatura de layout: muda só quando a janela muda
                    const items = getItems(); // assinatura dos dados: atualiza valores

                    if (items.length === 0) {
                        rangeRef.current = { start: 0, end: 0 };
                        lastCountRef.current = 0;
                        lastKeysRef.current = [];
                        return props.emptyState ?? null;
                    }

                    const cur = currentRange();
                    // Mudou a FORMA: quantidade ou ordem. É o que invalida a
                    // janela. Streaming (mesma forma, valores diferentes) não
                    // entra aqui: só os valores dos itens visíveis são
                    // atualizados, sem recalcular o recorte.
                    const shapeChanged = itemsChangedShape(items);
                    lastCountRef.current = items.length;
                    lastKeysRef.current = items.map((item, i) => keyOf(item, i));

                    if (cur.end === 0 || cur.start >= items.length || shapeChanged) {
                        rangeRef.current = resolveVisibleRange(items);
                    }

                    const { start, end: rawEnd } = currentRange();
                    const end = Math.min(rawEnd, items.length);
                    const slice = items.slice(start, end);
                    const { total, top, bottom } = spacerMetrics(items);

                    return (
                        <div
                            ref={innerRef}
                            style={{
                                height: `${total}px`,
                                boxSizing: "border-box",
                                paddingTop: `${top}px`,
                                paddingBottom: `${bottom}px`,
                            }}
                        >
                            {slice.map((item, offset) => {
                                const index = start + offset;
                                const key = keyOf(item, index);

                                return (
                                    <div
                                        key={key}
                                        ref={registerRow(index, key)}
                                        onClick={(event) => {
                                            props.onItemClick?.(item, index, event as MouseEvent);
                                        }}
                                        style={{
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