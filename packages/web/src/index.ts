/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */



export  {hydrateClientComponents } from "./hydration/boundary-component.js"


export {
    createClientComponent,
} from "./hydration/client-component.js";

export {createHydrateComponent } from "./hydration/hydrate-component.js"



export * from "./front/handler-scope.js";
export * from "./front/context-runtime.js";
export * from "./front/router.js";
export * from "./reactive/index.js";
export * from  "./hydration/templates.js";
export { callServerAction } from "@adaptive-js/shared";
import { AdaptiveRouteContext  } from "@adaptive-js/shared";
export type PageContext = AdaptiveRouteContext ;
