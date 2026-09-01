export default function NotFoundPage() {
  return (
    <main className="welcome-shell">
      <section className="welcome-hero">
        <div className="welcome-copy">
          <span className="welcome-kicker">404</span>
          <h1>Pagina nao encontrada</h1>
          <p>
            Esta rota nao existe, ou voce tentou acessar uma pagina protegida
            sem sessao valida.
          </p>
          <div className="welcome-actions">
            <a className="welcome-button welcome-button-primary" href="/">
              Voltar ao inicio
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
