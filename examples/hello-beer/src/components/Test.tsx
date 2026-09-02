/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import {init} from "@adaptive-js/web";

export const Test = () => {

    init(() => {
        console.log("BeerCSS inicializado")

        return () => {
            console.log("unmounting BeerCSS")
        }
    })

    return (<div>BeerCSS</div>)
}