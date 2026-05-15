import { CounterBeer } from "../components/CounterBeer";

export default async function HomePage() {
    return (
        <>
            <main className="responsive max padding">
                <header className="padding">
                    <nav>
                        <h3>Adaptive + BeerCSS</h3>
                        <button className="circle transparent">
                            <i>local_cafe</i>
                        </button>
                    </nav>
                    <p className="medium-text top-margin">
                        Exemplo com BeerCSS via npm, carregado por uma entry de client do Adaptive.
                    </p>
                </header>

                <section className="grid">
                    <article className="padding round primary-container">
                        <h5>Suporte por npm</h5>
                        <p className="small-text">
                            O framework continua neutro. O app instala <code>beercss</code> e <code>material-dynamic-colors</code> localmente.
                        </p>
                    </article>

                    <CounterBeer />
                </section>
            </main>
        </>
    );
}
