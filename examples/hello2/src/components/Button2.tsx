'hydrate'
import {createHandler, createStore} from "@adaptive-js/web";
/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

export const ButtonR = () => {
    const store = createStore({
        notifyCount: 0,
        lastMessage: "Nenhum evento ainda"
    });

    createHandler("notify",cb => {
        store.notifyCount[1]((current) => current + 1)
        store.lastMessage[1](`Notify disparado ${store.notifyCount[0]()} vez(es)`)
        console.log("CALISTOU")
    });

    return (
        <>
            <button>Button</button>
            <p>Total de notify: {() => store.notifyCount[0]()}</p>
            <p>Estado: {() => store.lastMessage[0]()}</p>
        </>

    )
}

