'hydrate'
import {Reveal, signal} from "@adaptive-js/web";
import {Test} from "./Test";
// @thunk
export const CounterBeer = () => {
    const [count, setCount] = signal(0);

    return (
        <article className="padding round surface-container">
            <h6>Contador BeerCSS</h6>
            <Reveal when={() => count() > 0}>
                <Reveal.If>
                    <Test/>
                </Reveal.If>

                <Reveal.Else>
                    <div key="off">TEX</div>
                </Reveal.Else>

            </Reveal>

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
            <p className="large-text top-margin">Valor atual no trunk: {count()}</p>


        </article>
    );
};


