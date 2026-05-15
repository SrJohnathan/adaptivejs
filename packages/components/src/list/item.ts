import type { AdaptiveNode } from "@adaptivejs/web/jsx-runtime";

export type ListItemTone = "default" | "primary" | "success" | "warning" | "danger" | "muted";

export type ListItemRenderContext<T = unknown> = {
    ctx: CanvasRenderingContext2D;
    item: T;
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    scrollTop: number;
    devicePixelRatio: number;
    isHovered: boolean;
};

export type ListItemProps = {
    title: string;
    subtitle?: string;
    leading?: string;
    trailing?: string;
    tone?: ListItemTone;
    background?: string;
    color?: string;
    subtitleColor?: string;
    hoverBackground?: string;
    paddingX?: number;
    radius?: number;
};

export type ListItemDescriptor = ListItemProps & {
    __adaptiveComponentType: "list-item";
};

export type CustomListItemProps<T = unknown> = {
    draw: (context: ListItemRenderContext<T>) => void;
};

export type CustomListItemDescriptor<T = unknown> = CustomListItemProps<T> & {
    __adaptiveComponentType: "list-item-custom";
};

export interface ItemList<TProps = {}> {
    (props: TProps): AdaptiveNode;
}

export function ListItem(props: ListItemProps): ListItemDescriptor {
    return {
        __adaptiveComponentType: "list-item",
        ...props
    };
}

export function ItemList<T = unknown>(props: CustomListItemProps<T>): CustomListItemDescriptor<T> {
    return {
        __adaptiveComponentType: "list-item-custom",
        ...props
    };
}

export function convertItemNode<T = unknown, TProps = {}>(
    componentOrNode: ItemList<TProps> | AdaptiveNode,
    props?: TProps
): CustomListItemDescriptor<T> {
    return ItemList<T>({
        draw: (context) => {
            const node = resolveItemNode(componentOrNode, props);
            drawAdaptiveNode(context, node);
        }
    });
}

export function isListItemDescriptor(value: unknown): value is ListItemDescriptor {
    return Boolean(
        value &&
        typeof value === "object" &&
        (value as ListItemDescriptor).__adaptiveComponentType === "list-item"
    );
}

export function isCustomListItemDescriptor<T = unknown>(
    value: unknown
): value is CustomListItemDescriptor<T> {
    return Boolean(
        value &&
        typeof value === "object" &&
        (value as CustomListItemDescriptor<T>).__adaptiveComponentType === "list-item-custom"
    );
}

function resolveItemNode<TProps>(
    componentOrNode: ItemList<TProps> | AdaptiveNode,
    props?: TProps
): AdaptiveNode {
    if (typeof componentOrNode === "function") {
        return (componentOrNode as ItemList<TProps>)(props ?? ({} as TProps));
    }

    return componentOrNode;
}

type ItemTextBlock = {
    text: string;
    font: string;
    color: string;
};

function drawAdaptiveNode<T>(
    context: ListItemRenderContext<T>,
    node: AdaptiveNode
) {
    const blocks = collectTextBlocks(node);
    const { ctx, x, y, width, height } = context;

    const startX = x + 16;
    let cursorY = y + 18;
    const maxY = y + height - 8;

    for (const block of blocks) {
        if (!block.text) continue;
        if (cursorY > maxY) break;

        ctx.fillStyle = block.color;
        ctx.font = block.font;
        ctx.fillText(truncateText(ctx, block.text, Math.max(0, width - 32)), startX, cursorY);
        cursorY += getLineStep(block.font);
    }
}

function collectTextBlocks(node: AdaptiveNode): ItemTextBlock[] {
    const blocks: ItemTextBlock[] = [];
    appendBlocks(node, blocks);
    return blocks;
}

function appendBlocks(node: AdaptiveNode, blocks: ItemTextBlock[]) {
    if (node == null || node === false || node === true) return;

    if (Array.isArray(node)) {
        node.forEach((child) => appendBlocks(child, blocks));
        return;
    }

    if (typeof node === "string" || typeof node === "number") {
        blocks.push({
            text: String(node),
            font: "12px sans-serif",
            color: "#475569"
        });
        return;
    }

    if (typeof node === "object" && "then" in node && typeof node.then === "function") {
        blocks.push({
            text: "[async item]",
            font: "12px sans-serif",
            color: "#94a3b8"
        });
        return;
    }

    if (typeof node === "object" && node && "tag" in node) {
        if (typeof node.tag === "function") {
            appendBlocks(node.tag({ ...(node.props ?? {}), children: node.children ?? [] }), blocks);
            return;
        }

        if (node.tag === "Fragment") {
            (node.children ?? []).forEach((child) => appendBlocks(child, blocks));
            return;
        }

        const text = collectInlineText(node.children ?? []);
        if (!text) return;

        const tag = node.tag;
        if (typeof tag !== "string") return;

        blocks.push({
            text,
            font: resolveFontForTag(tag),
            color: resolveColorForNode({
                tag,
                props: node.props
            })
        });
        return;
    }
}

function collectInlineText(children: AdaptiveNode[] | AdaptiveNode): string {
    const parts: string[] = [];

    const visit = (node: AdaptiveNode | AdaptiveNode[]) => {
        if (node == null || node === false || node === true) return;

        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }

        if (typeof node === "string" || typeof node === "number") {
            parts.push(String(node));
            return;
        }

        if (typeof node === "object" && node && "tag" in node) {
            if (typeof node.tag === "function") {
                visit(node.tag({ ...(node.props ?? {}), children: node.children ?? [] }));
                return;
            }

            visit(node.children ?? []);
        }
    };

    visit(children);
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

function resolveFontForTag(tag: string) {
    switch (tag) {
        case "h1":
        case "h2":
            return "700 18px sans-serif";
        case "h3":
        case "h4":
            return "700 16px sans-serif";
        case "h5":
        case "h6":
            return "700 14px sans-serif";
        case "strong":
            return "700 13px sans-serif";
        default:
            return "12px sans-serif";
    }
}

function resolveColorForNode(node: { props?: Record<string, any>; tag: string }) {
    const styleColor = node.props?.style?.color;
    if (typeof styleColor === "string" && styleColor.trim()) {
        return styleColor;
    }

    switch (node.tag) {
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
        case "strong":
            return "#0f172a";
        default:
            return "#475569";
    }
}

function getLineStep(font: string) {
    if (font.includes("18px")) return 24;
    if (font.includes("16px")) return 22;
    if (font.includes("14px")) return 20;
    return 18;
}

function truncateText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
) {
    if (ctx.measureText(text).width <= maxWidth) {
        return text;
    }

    const ellipsis = "...";
    let output = text;

    while (output.length > 0 && ctx.measureText(output + ellipsis).width > maxWidth) {
        output = output.slice(0, -1);
    }

    return output ? `${output}${ellipsis}` : ellipsis;
}
