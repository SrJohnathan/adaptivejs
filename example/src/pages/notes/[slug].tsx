export default function NotePage(props?: { params?: Record<string, string> }) {
  const slug = props?.params?.slug ?? "unknown";

  return (
    <main className="shell">
      <section className="hero">
        <nav className="nav">
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/compose">Compose UI</a>
          <a href="/hooks">Hooks Demo</a>
          <a href="/jsx-hooks">JSX Hooks</a>
          <a href="/reactive-context">Reactive Context</a>
        </nav>

        <p className="muted">Dynamic route</p>
        <h1>{slug}</h1>
        <p className="muted">
          This page was resolved from <code>src/pages/notes/[slug].tsx</code>.
        </p>
      </section>
    </main>
  );
}
