/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */


export { createRouter } from "./ssr/create-route.js";
export { handle_actions_request } from "./actions/handle_actions_request.js";
export { redirect, type AdaptiveRedirect } from "./ssr/response.js";
export {matchRouteServer} from "./ssr/parse.js"
export {AdaptiveMetadataResolver, AdaptiveRouteContext} from  "./ssr/interfaces/index.js";
