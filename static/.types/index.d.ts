export interface StaticOptions {
    appDir?: string;
    outputDir?: string;
    preset?: "node" | "vercel" | "netlify" | "static";
}
export declare function createVinxiApp(options?: StaticOptions): Promise<unknown>;
export declare function buildAdaptive(options?: StaticOptions): Promise<void>;
/** @deprecated Use buildAdaptive instead */
export declare function buildStatic(options?: StaticOptions): Promise<void>;
