export type AdaptiveHydrationMismatch = {
    path: string;
    route: string;
    message: string;
    expected?: string;
    found?: string;
    htmlSnippet?: string;
    timestamp: number;
};
export type HydrateOptions = {
    recover?: boolean;
    removeMarkers?: boolean;
};
export type HydrationInstruction = {
    kind: "event";
    id: string;
    event: string;
    handler: EventListener;
} | {
    kind: "ref";
    id: string;
    ref: any;
} | {
    kind: "reactive-range";
    id: string;
    getter: () => any;
} | {
    kind: "reactive-struct";
    id: string;
    render: () => any;
} | {
    kind: "reactive-list";
    id: string;
    getter: () => any[];
} | {
    kind: "reactive-async";
    id: string;
    getter: () => Promise<any> | any;
} | {
    kind: "dynamic-prop";
    id: string;
    prop: string;
    getter: () => any;
} | {
    kind: "layout-effect";
    effect: () => void | (() => void);
    deps?: any[];
} | {
    kind: "effect";
    effect: () => void | (() => void);
    deps?: any[];
};
export declare function hydrateLegacyVDOM(root: HTMLElement, renderFn: () => any, options?: HydrateOptions): void;
export declare function hydrateLegacyVDOMBetweenMarkers(start: Comment, end: Comment, renderFn: () => any, options?: HydrateOptions): Node[];
export declare function hydrate(root: HTMLElement, renderFn: () => any, options?: HydrateOptions): void;
export declare function hydrateBetweenMarkers(start: Comment, end: Comment, renderFn: () => any, options?: HydrateOptions): Node[];
export declare function mount(root: HTMLElement, renderFn: () => any): void;
export declare function getHydrationMismatches(): AdaptiveHydrationMismatch[];
export declare function clearHydrationMismatches(): void;
export declare function renderToDOM(vNode: any): Node;
export declare function appendChildren(parent: Node, children: any[]): void;
