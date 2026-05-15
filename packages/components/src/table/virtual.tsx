import type { AdaptiveNode } from "@adaptivejs/web/jsx-runtime";
import { ListVirtual } from "../list/virtual.js";
import {
    normalizeCssSize,
    resolveColumnWidths,
    resolveDomTextAlign,
    resolveTableCellContent,
    type TableColumn
} from "./shared.js";

export type TableVirtualProps<T> = {
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

export function TableVirtual<T>(props: TableVirtualProps<T>) {
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
        <div className={props.className} style={{ width: normalizeCssSize(props.width), height: `${props.height}px`, overflow: "hidden", borderRadius: "16px", background: props.background ?? "#ffffff" }}>
            <div style={{ height: `${headerHeight}px`, display: "flex", alignItems: "center", background: props.headerBackground ?? "#e2e8f0", borderBottom: "1px solid rgba(148, 163, 184, 0.35)" }}>
                {props.columns.map((column, index) => (
                    <div key={index} style={{ flex: column.width ? `0 0 ${column.width}px` : "1 1 0", minWidth: column.width ? `${column.width}px` : "0", padding: "0 14px", fontSize: "12px", fontWeight: "700", color: column.headerColor ?? "#0f172a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {column.header}
                    </div>
                ))}
            </div>

            <ListVirtual
                items={props.rows}
                height={bodyHeight}
                itemHeight={props.rowHeight}
                overscan={props.overscan}
                onItemClick={props.onRowClick}
                item={(row, index) => {
                    const widths = resolveColumnWidths(props.columns, 1200);

                    return (
                        <div style={{ display: "flex", alignItems: "center", height: "100%", background: props.rowBackground ?? "#ffffff", borderBottom: "1px solid rgba(148, 163, 184, 0.2)" }}>
                            {props.columns.map((column, columnIndex) => (
                                <div key={columnIndex} style={{ flex: column.width ? `0 0 ${column.width}px` : "1 1 0", minWidth: column.width ? `${column.width}px` : `${widths[columnIndex]}px`, padding: "0 14px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", textAlign: resolveDomTextAlign(column.align), color: column.color ?? "#0f172a", fontSize: "13px" }}>
                                    {resolveTableCellContent(row, column, index)}
                                </div>
                            ))}
                        </div>
                    );
                }}
            />
        </div>
    );
}
