'hydrate'
import {init, signal} from "@adaptive-js/web";
import {Test} from "./Test";
// @thunk
export const CounterBeer = () => {
    const [count, setCount] = signal(0);

    return (
        <article className="padding round surface-container">
            <h6>Contador BeerCSS</h6>
            {  count() > 0 ? <Test key="on" /> : <div key="off">TEX</div> }
            <p className="small-text">Clique para testar hidratação com BeerCSS vindo por npm.</p>
            <nav className="row gap small-margin top-margin">
                <button className="border" onClick={() => setCount(count() + 1)}>
                    Incrementar
                </button>
                <button className="transparent" onClick={() => setCount(0)}>
                    Resetar
                </button>
            </nav>
            <p className="large-text top-margin">Valor atual: {() => count()}</p>
            <p className="large-text top-margin">Valor atual no trunk: { count()}</p>



        </article>
    );
};


