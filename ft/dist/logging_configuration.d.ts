export declare const LogLevel: {
    ERROR: number;
    WARN: number;
    INFO: number;
    DEBUG: number;
};
export declare const config: {
    logLevel: number;
    enableConsole: boolean;
};
export declare function setupLogging(options: {
    logLevel?: number;
    enableConsole?: boolean;
}): void;
export declare const logger: {
    error: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    debug: (message: string, ...args: any[]) => void;
};
