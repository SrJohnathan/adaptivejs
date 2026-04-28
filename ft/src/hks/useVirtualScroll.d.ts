import { Ref } from "../interface/Ref.js";
type ScrollDirection = 'forward' | 'backward';
type VirtualItem = {
    index: number;
    start: number;
    size: number;
    end: number;
    measureRef: (el: HTMLElement | null) => void;
};
type VirtualOptions = {
    size: number;
    parentRef: Ref<HTMLElement>;
    estimateSize?: (index: number) => number;
    overscan?: number;
    paddingStart?: number;
    paddingEnd?: number;
    horizontal?: boolean;
    scrollToFn?: (offset: number, defaultScrollToFn: (offset: number) => void) => void;
    onScrollStart?: (direction: ScrollDirection) => void;
    onScrollEnd?: () => void;
};
type VirtualReturn = {
    virtualItems: VirtualItem[];
    totalSize: number;
    scrollTo: (index: number) => void;
    scrollToOffset: (offset: number) => void;
    measure: (index?: number) => void;
    getVirtualItemForOffset: (scrollOffset: number) => VirtualItem | undefined;
    getOffsetForAlignment: (index: number, align: 'start' | 'center' | 'end') => number;
};
export declare function useVirtual(options: VirtualOptions): VirtualReturn;
export {};
