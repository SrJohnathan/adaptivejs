import type { AdaptiveNode } from "@adaptive-js/web/jsx-runtime";

export type TableColumnAlign = "left" | "center" | "right";

export type TableColumn<T> = {
    key: keyof T | string;
    header: string;
    width?: number;
    align?: TableColumnAlign;
    render?: (row: T, index: number) => AdaptiveNode;
    color?: string;
    headerColor?: string;
};

export function normalizeCssSize(value: number | string | undefined) {
    if (value == null) {
        return "100%";
    }

    return typeof value === "number" ? `${value}px` : value;
}

export function resolveTableCellContent<T>(
    row: T,
    column: TableColumn<T>,
    index: number
) {
    if (column.render) {
        return column.render(row, index);
    }

    const value = (row as Record<string, unknown>)[String(column.key)];
    return value == null ? "" : value;
}

export function resolveColumnWidths<T>(columns: TableColumn<T>[], totalWidth: number) {
    const fixedWidth = columns.reduce((sum, column) => sum + (column.width ?? 0), 0);
    const fluidColumns = columns.filter((column) => !column.width);
    const remainingWidth = Math.max(0, totalWidth - fixedWidth);
    const fluidWidth = fluidColumns.length > 0 ? remainingWidth / fluidColumns.length : 0;

    return columns.map((column) => column.width ?? fluidWidth);
}

export function alignToCanvasText(align: TableColumnAlign | undefined) {
    switch (align) {
        case "center":
            return "center";
        case "right":
            return "right";
        default:
            return "left";
    }
}

export function resolveDomTextAlign(align: TableColumnAlign | undefined) {
    switch (align) {
        case "center":
            return "center";
        case "right":
            return "right";
        default:
            return "left";
    }
}

export function extractPlainText(node: AdaptiveNode): string {
    const parts: string[] = [];

    const visit = (current: AdaptiveNode | AdaptiveNode[]) => {
        if (current == null || current === false || current === true) return;

        if (Array.isArray(current)) {
            current.forEach(visit);
            return;
        }

        if (typeof current === "string" || typeof current === "number") {
            parts.push(String(current));
            return;
        }

        if (typeof current === "object" && current && "tag" in current) {
            if (typeof current.tag === "function") {
                visit(current.tag({ ...(current.props ?? {}), children: current.children ?? [] }));
                return;
            }

            visit(current.children ?? []);
        }
    };

    visit(node);
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function truncateCanvasText(
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
