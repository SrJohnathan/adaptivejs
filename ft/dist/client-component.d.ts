declare const CLIENT_COMPONENT_SYMBOL: unique symbol;
type ClientMetadata = {
    moduleId: string;
    exportName: string;
};
type ClientComponentFunction = ((props?: Record<string, any>) => any) & {
    [CLIENT_COMPONENT_SYMBOL]?: ClientMetadata;
};
export declare function createClientComponent(moduleId: string, exportName?: string, serverRender?: ((props?: Record<string, any>) => any) | null): ClientComponentFunction;
export declare function isClientComponent(value: unknown): value is ClientComponentFunction;
export declare function getClientComponentMetadata(value: unknown): ClientMetadata | null;
export declare function hydrateClientComponents(moduleId: string, exportsMap: Record<string, any>): void;
export declare function isClientBoundaryTag(tag: unknown): tag is "adaptive-client-boundary";
export declare function cleanupClientComponentScopes(container?: ParentNode): void;
export {};
