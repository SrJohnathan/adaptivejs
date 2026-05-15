'hydrate'
import {useHandler, useReactive} from "@adaptivejs/web";

/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

export const ButtonV = () => {

    const  [state , setState] = useReactive(0)

    const  h =  useHandler("notify")
    return (
        <>
            <button onClick={() => {
                h()
                setState(state() + 1)

            }} >CHAMAR CALL  { () => state() }</button>
        </>

    )
}

