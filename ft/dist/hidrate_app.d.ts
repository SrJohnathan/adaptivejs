export declare const hydrateApp: () => {
    forceHydration: () => void;
    getConfig: () => Record<string, unknown>;
};
declare function navigateAndHydrate(path: string): Promise<void>;
export declare const hydrateNavigation: typeof navigateAndHydrate;
export declare const popStateNavigation: () => Promise<void>;
export declare const backHydration: () => void;
export {};
