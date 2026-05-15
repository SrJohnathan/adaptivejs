/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

/**
 * Representa um redirect no runtime do Adaptive
 */
export type AdaptiveRedirect = {
    __type: "redirect";
    location: string;
    status: number;
};

/**
 * Cria uma resposta de redirect (SSR-safe e agnóstico de adapter)
 */
export function redirect(
    location: string,
    status = 302
): AdaptiveRedirect {
    return {
        __type: "redirect",
        location,
        status,
    };
}