import type { AdaptiveNode } from "@adaptivejs/web/jsx-runtime";
import { useDOMEffect, useReactive, useRef } from "@adaptivejs/web";
import {
    isCustomListItemDescriptor,
    isListItemDescriptor,
    type CustomListItemDescriptor,
    type ListItemDescriptor,
    type ListItemRenderContext
} from "./item.js";

export type ListDrawItemContext<T> = ListItemRenderContext<T>;

export type ListCanvasProps<T> = {
    items: T[];
    height: number | string;
    itemHeight: number;
    width?: number | string;
    overscan?: number;
    className?: string;
    emptyState?: AdaptiveNode;
    background?: string;
    onItemClick?: (item: T, index: number, event: MouseEvent) => void;
    drawItem?: (context: ListDrawItemContext<T>) => void;
    item?: (item: T, index: number) => ListItemDescriptor | CustomListItemDescriptor<T>;
};

export type ListProps<T> = ListCanvasProps<T>;

const DEFAULT_OVERSCAN = 6;
const MAX_SCROLL_HEIGHT = 33_000_000;

function calculateHeight(height: number | string): number {
    if (typeof height === "number") return height;

    if (height.endsWith("px")) {
        const value = Number.parseFloat(height);
        return Number.isFinite(value) ? value : 0;
    }

    return 0;
}

export function ListCanvas<T>(props: ListCanvasProps<T>) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const tickingRef = useRef(false);

    const scrollTopRef = useRef(0);
    const hoverIndexRef = useRef(-1);
    const viewportWidthRef = useRef(0);
    const viewportHeightRef = useRef(calculateHeight(props.height));
    const devicePixelRatioRef = useRef(1);

    const [, forceUpdate] = useReactive(0);

    const totalHeight = () => props.items.length * props.itemHeight;
    const physicalTotalHeight = () => Math.min(totalHeight(), MAX_SCROLL_HEIGHT);
    const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;
    const hasRenderableItem = () => Boolean(props.drawItem || props.item);

    const scheduleUpdate = () => {
        if (tickingRef.current) return;

        tickingRef.current = true;

        rafRef.current = requestAnimationFrame(() => {
            tickingRef.current = false;
            forceUpdate((value) => value + 1);
            paint();
        });
    };

    const measureViewportMetrics = () => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const parent = viewport.parentElement;

        viewportWidthRef.current =
            parent?.clientWidth ||
            viewport.clientWidth ||
            0;

        viewportHeightRef.current =
            typeof props.height === "number"
                ? props.height
                : parent?.clientHeight ||
                viewport.clientHeight ||
                viewportHeightRef.current ||
                (typeof window !== "undefined" ? window.innerHeight : 800);

        devicePixelRatioRef.current =
            typeof window !== "undefined"
                ? window.devicePixelRatio || 1
                : 1;
    };

    const resolveLogicalScrollTop = (physicalScrollTop: number) => {
        const viewportHeight = viewportHeightRef.current ?? 0;

        const logicalScrollableHeight = Math.max(
            0,
            totalHeight() - viewportHeight
        );

        const physicalScrollableHeight = Math.max(
            0,
            physicalTotalHeight() - viewportHeight
        );

        if (logicalScrollableHeight <= 0 || physicalScrollableHeight <= 0) {
            return Math.max(0, physicalScrollTop);
        }

        const ratio = physicalScrollTop / physicalScrollableHeight;

        return Math.max(
            0,
            Math.min(logicalScrollableHeight, ratio * logicalScrollableHeight)
        );
    };

    const resolveVisibleRange = () => {
        const currentScrollTop = scrollTopRef.current ?? 0;
        const viewportHeight = viewportHeightRef.current ?? 0;

        if (viewportHeight <= 0 || props.itemHeight <= 0) {
            return { start: 0, end: 0 };
        }

        const start = Math.max(
            0,
            Math.floor(currentScrollTop / props.itemHeight) - overscan()
        );

        const end = Math.min(
            props.items.length,
            Math.ceil((currentScrollTop + viewportHeight) / props.itemHeight) +
            overscan()
        );

        return { start, end };
    };

    const paint = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        measureViewportMetrics();

        const width = viewportWidthRef.current ?? 0;
        const height = viewportHeightRef.current ?? 0;
        const dpr = devicePixelRatioRef.current ?? 0;

        if (width <= 0 || height <= 0) return;

        const pixelWidth = Math.max(1, Math.floor(width * dpr));
        const pixelHeight = Math.max(1, Math.floor(height * dpr));

        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, pixelWidth, pixelHeight);
        ctx.scale(dpr, dpr);

        if (props.background) {
            ctx.fillStyle = props.background;
            ctx.fillRect(0, 0, width, height);
        }

        const currentScrollTop = scrollTopRef.current ?? 0;
        const hoverIndex = hoverIndexRef.current ?? 0;
        const { start, end } = resolveVisibleRange();

        for (let index = start; index < end; index += 1) {
            const item = props.items[index];
            const y = index * props.itemHeight - currentScrollTop;

            const drawContext = {
                ctx,
                item,
                index,
                x: 0,
                y,
                width,
                height: props.itemHeight,
                scrollTop: currentScrollTop,
                devicePixelRatio: dpr,
                isHovered: hoverIndex === index
            };

            if (props.drawItem) {
                props.drawItem(drawContext);
                continue;
            }

            if (props.item) {
                const descriptor = props.item(item, index);

                if (isListItemDescriptor(descriptor)) {
                    drawListItemDescriptor(drawContext, descriptor);
                    continue;
                }

                if (isCustomListItemDescriptor<T>(descriptor)) {
                    descriptor.draw(drawContext);
                }
            }
        }
    };

    const resolveIndexFromPointer = (event: MouseEvent | PointerEvent) => {
        const viewport = viewportRef.current;
        if (!viewport) return -1;

        const bounds = viewport.getBoundingClientRect();
        const y = event.clientY - bounds.top + (scrollTopRef.current ?? 0);
        const index = Math.floor(y / props.itemHeight);

        if (index < 0 || index >= props.items.length) return -1;

        return index;
    };

    useDOMEffect(() => {
        const viewport = viewportRef.current;
        const parent = viewport?.parentElement;

        if (!viewport || !parent) return;

        measureViewportMetrics();
        paint();

        const resizeObserver = new ResizeObserver(() => {
            measureViewportMetrics();
            scheduleUpdate();
        });

        resizeObserver.observe(parent);

        const onViewportScroll = () => {
            scrollTopRef.current = resolveLogicalScrollTop(viewport.scrollTop);
            paint();
        };

        const onWindowResize = () => {
            measureViewportMetrics();
            scheduleUpdate();
        };

        viewport.addEventListener("scroll", onViewportScroll, { passive: true });
        window.addEventListener("resize", onWindowResize);

        return () => {
            resizeObserver.disconnect();
            viewport.removeEventListener("scroll", onViewportScroll);
            window.removeEventListener("resize", onWindowResize);

            tickingRef.current = false;

            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    });

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

    if (!hasRenderableItem()) {
        return (
            <div
                className={props.className}
                style={resolveContainerStyle(props.height, props.width, {
                    display: "grid",
                    placeItems: "center"
                })}
            >
                List requires `drawItem` or `item`
            </div>
        );
    }

    return (
        <div
            className={props.className}
            style={resolveContainerStyle(props.height, props.width, {
                contain: "strict",
                overflow: "hidden"
            })}
        >
            <div
                ref={viewportRef}
                onMouseMove={(event: MouseEvent) => {
                    hoverIndexRef.current = resolveIndexFromPointer(event);
                    paint();
                }}
                onMouseLeave={() => {
                    hoverIndexRef.current = -1;
                    paint();
                }}
                onClick={(event) => {
                    if (!props.onItemClick) return;

                    const index = resolveIndexFromPointer(event as MouseEvent);
                    if (index < 0) return;

                    props.onItemClick(props.items[index], index, event as MouseEvent);
                }}
                style={{
                    position: "absolute",
                    inset: "0",
                    overflowY: "auto",
                    overflowX: "hidden"
                }}
            >
                <div style={{ height: `${physicalTotalHeight()}px`, pointerEvents: "none" }} />
            </div>

            <div style={{ position: "absolute", inset: "0", pointerEvents: "none" }}>
                <canvas ref={canvasRef} style={{ display: "block", pointerEvents: "none" }} />
            </div>
        </div>
    );
}

export const List = ListCanvas;

function normalizeCssSize(value: number | string | undefined) {
    if (value == null) return "100%";
    return typeof value === "number" ? `${value}px` : value;
}

function resolveContainerStyle(
    height: number | string,
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

function drawListItemDescriptor<T>(
    context: ListDrawItemContext<T>,
    item: ListItemDescriptor
) {
    const {
        ctx,
        y,
        width,
        height,
        isHovered
    } = context;

    const paddingX = item.paddingX ?? 16;

    const radius = item.radius ?? 10;

    const background = isHovered
        ? item.hoverBackground ?? "#e2e8f0"
        : item.background ??
        resolveToneBackground(item.tone);

    const titleColor =
        item.color ?? "#0f172a";

    const subtitleColor =
        item.subtitleColor ?? "#475569";

    roundRect(
        ctx,
        8,
        y + 4,
        Math.max(0, width - 16),
        Math.max(0, height - 8),
        radius
    );

    ctx.fillStyle = background;
    ctx.fill();

    let cursorX = paddingX + 8;

    if (item.leading) {
        ctx.fillStyle = "#334155";
        ctx.font = "600 12px sans-serif";

        ctx.fillText(
            item.leading,
            cursorX,
            y + 17
        );

        cursorX += Math.max(
            32,
            ctx.measureText(item.leading)
                .width + 12
        );
    }

    ctx.fillStyle = titleColor;
    ctx.font = "600 14px sans-serif";

    ctx.fillText(
        item.title,
        cursorX,
        y + 19
    );

    if (item.subtitle) {
        ctx.fillStyle = subtitleColor;
        ctx.font = "12px sans-serif";

        ctx.fillText(
            item.subtitle,
            cursorX,
            y + 35
        );
    }

    if (item.trailing) {
        ctx.fillStyle = "#475569";
        ctx.font = "12px sans-serif";

        const metrics = ctx.measureText(
            item.trailing
        );

        ctx.fillText(
            item.trailing,
            width -
            metrics.width -
            paddingX -
            8,
            y + 19
        );
    }
}

function resolveToneBackground(
    tone: ListItemDescriptor["tone"]
) {
    switch (tone) {
        case "primary":
            return "#dbeafe";

        case "success":
            return "#dcfce7";

        case "warning":
            return "#fef3c7";

        case "danger":
            return "#fee2e2";

        case "muted":
            return "#f1f5f9";

        default:
            return "#f8fafc";
    }
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
) {
    const safeRadius = Math.max(
        0,
        Math.min(
            radius,
            width / 2,
            height / 2
        )
    );

    ctx.beginPath();

    ctx.moveTo(x + safeRadius, y);

    ctx.lineTo(
        x + width - safeRadius,
        y
    );

    ctx.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + safeRadius
    );

    ctx.lineTo(
        x + width,
        y + height - safeRadius
    );

    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - safeRadius,
        y + height
    );

    ctx.lineTo(
        x + safeRadius,
        y + height
    );

    ctx.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - safeRadius
    );

    ctx.lineTo(
        x,
        y + safeRadius
    );

    ctx.quadraticCurveTo(
        x,
        y,
        x + safeRadius,
        y
    );

    ctx.closePath();
}