import http from "node:http";
export interface StaticOptions {
    appDir?: string;
    outputDir?: string;
    preset?: "node" | "vercel" | "netlify" | "static";
}
export interface PreviewOptions {
    appDir?: string;
    preset?: "vercel" | "netlify";
    port?: number;
    host?: string;
}
export declare function createVinxiApp(options?: StaticOptions): Promise<unknown>;
export declare function buildAdaptive(options?: StaticOptions): Promise<void>;
/** @deprecated Use buildAdaptive instead */
export declare function buildStatic(options?: StaticOptions): Promise<void>;
export declare function previewAdaptive(options?: PreviewOptions): Promise<http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>>;
