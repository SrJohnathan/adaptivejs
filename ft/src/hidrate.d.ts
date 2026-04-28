export type AdaptiveHydrationMismatch = {
    path: string;
    route: string;
    message: string;
    expected?: string;
    found?: string;
    htmlSnippet?: string;
    timestamp: number;
};
export declare function hydrate(root: HTMLElement, renderFn: () => any): void;
export declare function mount(root: HTMLElement, renderFn: () => any): void;
export declare function getHydrationMismatches(): AdaptiveHydrationMismatch[];
export declare function clearHydrationMismatches(): void;
export declare function renderToDOM(vNode: any): Node;
export declare function appendChildren(parent: Node, children: any[]): void;
