export default async function HomePage() {
  return (
    <main className="welcome-shell">
      <section className="welcome-hero">
        <div className="welcome-copy">
          <span className="welcome-kicker">AdaptiveJS</span>
          <h1>Seu novo projeto ja nasceu com SSR, hydrate e runtime DOM-first.</h1>
          <p>
            Esta base foi criada para te colocar em movimento rapido: pagina em
            servidor, entry global do app e um pipeline pronto para crescer sem
            esconder o HTML que vai para o browser.
          </p>

          <div className="welcome-actions">
            <a className="welcome-button welcome-button-primary" href="https://github.com/antonioweb/adaptivejs" target="_blank" rel="noreferrer">
              Ver projeto
            </a>
            <a className="welcome-button" href="/#next-steps">
              Proximos passos
            </a>
          </div>
        </div>

        <aside className="welcome-panel">
          <div className="welcome-panel-header">
            <span>adaptive/runtime</span>
            <span>online</span>
          </div>

          <div className="welcome-terminal">
            <p>
              <strong>$</strong> npm install
            </p>
            <p>
              <strong>$</strong> npm run dev
            </p>
            <p>
              <strong>$</strong> abrir localhost:3000
            </p>
          </div>

          <ul className="welcome-points">
            <li>`src/pages` define as rotas do app</li>
            <li>`dependency.ts` carrega dependencias globais</li>
            <li>`public/styles.css` e o CSS oficial do projeto</li>
          </ul>
        </aside>
      </section>

      <section id="next-steps" className="welcome-grid">
        <article className="welcome-card">
          <span className="welcome-card-label">1. Estrutura</span>
          <h2>Entenda o que veio no scaffold.</h2>
          <p>
            O template ja separa pagina, estilos globais e dependencias de app
            para te dar um ponto de partida limpo.
          </p>
        </article>

        <article className="welcome-card">
          <span className="welcome-card-label">2. Hydrate</span>
          <h2>Adicione ilhas interativas quando precisar.</h2>
          <p>
            Use componentes hidratados para eventos, estado local e interacao,
            mantendo o HTML inicial vindo do servidor.
          </p>
        </article>

        <article className="welcome-card">
          <span className="welcome-card-label">3. Escala</span>
          <h2>Cresca sem trocar de direcao tecnica.</h2>
          <p>
            A proposta do AdaptiveJS e continuar explicito em SSR, manifest,
            handlers e estado, mesmo quando o app fica maior.
          </p>
        </article>
      </section>
    </main>
  );
}
