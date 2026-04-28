export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <nav className="nav">
          <a href="/">Home</a>
          <a href="/compose">Compose UI</a>
          <a href="/hooks">Hooks Demo</a>
          <a href="/jsx-hooks">JSX Client Component</a>
        </nav>
        <p className="muted">Welcome to __APP_NAME__</p>
        <h1>Adaptive project ready to run.</h1>
        <p className="muted">This starter ships with SSR, TSX pages, declarative compose UI, hook demos and client components.</p>
      </section>
    </main>
  );
}
