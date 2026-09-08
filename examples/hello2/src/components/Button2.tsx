'hydrate'
import {createHandler, store,} from "@adaptive-js/web";
/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

export const ButtonR = () => {
    const stor = store({
        notifyCount: 0,
        lastMessage: "Nenhum evento ainda"
    });

    createHandler("notify",cb => {
        stor.notifyCount[1]((current) => current + 1)
        stor.lastMessage[1](`Notify disparado ${stor.notifyCount[0]()} vez(es)`)
        console.log("CALISTOU")
    });

    return (
        <>
            <button>Button</button>
            <p>Total de notify: {() => stor.notifyCount[0]()}</p>
            <p>Estado: {() => stor.lastMessage[0]()}</p>
        </>

    )
}

