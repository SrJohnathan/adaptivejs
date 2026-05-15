import type { AdaptiveNode } from "@adaptivejs/web/jsx-runtime";
import { ListCanvas } from "../list/canvas.js";
import {
    alignToCanvasText,
    extractPlainText,
    normalizeCssSize,
    resolveColumnWidths,
    resolveTableCellContent,
    truncateCanvasText,
    type TableColumn
} from "./shared.js";

export type TableCanvasProps<T> = {
    rows: T[];
    columns: TableColumn<T>[];
    height: number;
    rowHeight: number;
    headerHeight?: number;
    width?: number | string;
    className?: string;
    overscan?: number;
    emptyState?: AdaptiveNode;
    background?: string;
    headerBackground?: string;
    rowBackground?: string;
    onRowClick?: (row: T, index: number, event: MouseEvent) => void;
};

const DEFAULT_HEADER_HEIGHT = 44;

export function TableCanvas<T>(props: TableCanvasProps<T>) {
    const headerHeight = props.headerHeight ?? DEFAULT_HEADER_HEIGHT;
    const bodyHeight = Math.max(0, props.height - headerHeight);

    if (props.rows.length === 0) {
        return (
            <div className={props.className} style={{ height: `${props.height}px`, width: normalizeCssSize(props.width), display: "grid", placeItems: "center" }}>
                {props.emptyState ?? "Empty table"}
            </div>
        );
    }

    return (
        <div className={props.className} style={{ width: normalizeCssSize(props.width), height: `${props.height}px`, overflow: "hidden", borderRadius: "16px" }}>
            <div style={{ height: `${headerHeight}px`, display: "flex", alignItems: "center", background: props.headerBackground ?? "#e2e8f0", borderBottom: "1px solid rgba(148, 163, 184, 0.35)" }}>
                {props.columns.map((column, index) => (
                    <div key={index} style={{ flex: column.width ? `0 0 ${column.width}px` : "1 1 0", minWidth: column.width ? `${column.width}px` : "0", padding: "0 14px", fontSize: "12px", fontWeight: "700", color: column.headerColor ?? "#0f172a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {column.header}
                    </div>
                ))}
            </div>

            <ListCanvas
                items={props.rows}
                height={bodyHeight}
                itemHeight={props.rowHeight}
                overscan={props.overscan}
                background={props.background ?? "#ffffff"}
                onItemClick={props.onRowClick}
                drawItem={({ ctx, item, index, y, width, height, isHovered }) => {
                    const columnWidths = resolveColumnWidths(props.columns, width);
                    ctx.fillStyle = isHovered ? "#eff6ff" : props.rowBackground ?? "#ffffff";
                    ctx.fillRect(0, y, width, height);

                    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
                    ctx.beginPath();
                    ctx.moveTo(0, y + height - 0.5);
                    ctx.lineTo(width, y + height - 0.5);
                    ctx.stroke();

                    let cursorX = 0;
                    for (let columnIndex = 0; columnIndex < props.columns.length; columnIndex += 1) {
                        const column = props.columns[columnIndex];
                        const cellWidth = columnWidths[columnIndex];
                        const content = resolveTableCellContent(item, column, index);
                        const text = extractPlainText(content as AdaptiveNode);
                        const align = alignToCanvasText(column.align);

                        ctx.fillStyle = column.color ?? "#0f172a";
                        ctx.font = "13px sans-serif";
                        ctx.textAlign = align;
                        ctx.textBaseline = "middle";

                        const padding = 14;
                        const drawX =
                            align === "center"
                                ? cursorX + cellWidth / 2
                                : align === "right"
                                    ? cursorX + cellWidth - padding
                                    : cursorX + padding;

                        const maxWidth = Math.max(0, cellWidth - padding * 2);
                        ctx.fillText(truncateCanvasText(ctx, text, maxWidth), drawX, y + height / 2);

                        cursorX += cellWidth;
                    }

                    ctx.textAlign = "left";
                }}
            />
        </div>
    );
}
