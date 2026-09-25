/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */



import {ApiExternalAdapter, AuthUser, ExternalAuthInput, ExternalAuthResult} from "./types";

export function createApiExternalAdapter<TUser extends AuthUser = AuthUser>(
    options: {
        id: string;
        /** token inicial (opcional) */
        token?: string;
        request: (input: ExternalAuthInput) => Promise<ExternalAuthResult<TUser>>;
        refresh?: (input: ExternalAuthInput) => Promise<ExternalAuthResult<TUser>>;
        /** monta TUser a partir do result (default: id/email/name + data) */
        mapUser?: (result: ExternalAuthResult<TUser>) => TUser;
    }
): ApiExternalAdapter<TUser> {
    let token = options.token ?? "";

    const mapUser =
        options.mapUser ??
        ((r: ExternalAuthResult<TUser>) =>
            ({
                id: r.id,
                email: r.email,
                name: r.name,
                ...(r.data ?? {}),
            }) as TUser);

    function apply(result: ExternalAuthResult<TUser>): TUser {
        if (result.token) token = result.token;
        return mapUser(result);
    }

    return {
        id: options.id,
        get token() {
            return token;
        },
        async request(input = {}) {
            return apply(await options.request(input as any));
        },
        refresh: options.refresh
            ? async (input = {}) => apply(await options.refresh!(input as any))
            : undefined,
    };
}