export declare function createClientComponent(moduleId: string, exportName?: string, serverRender?: ((props?: Record<string, any>) => any) | null): import("./boundary-component.js").ClientComponentFunction;
export { cleanupClientComponentScopes, hydrateClientComponents, getClientComponentMetadata, isClientComponent } from "./boundary-component.js";
