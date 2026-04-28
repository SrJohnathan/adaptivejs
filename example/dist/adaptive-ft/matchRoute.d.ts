export declare function parseRoutePath(filePath: string): string;
/**
 * Compara uma rota definida (com parâmetros, ex.: "/home/:id")
 * com o pathname atual (ex.: "/home/123").
 * Retorna um objeto informando se houve match e os parâmetros extraídos.
 */
export declare function matchRoute(routePath: string, pathname: string): {
    matched: boolean;
    params?: Record<string, string>;
};
