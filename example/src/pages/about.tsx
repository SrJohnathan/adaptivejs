export default function AboutPage() {
  return (
    <main className="shell">
      <section className="hero">
        <nav className="nav">
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/compose">Compose UI</a>
          <a href="/workspace">Workspace</a>
          <a href="/hooks">Hooks Demo</a>
          <a href="/jsx-hooks">JSX Hooks</a>
          <a href="/reactive-context">Reactive Context</a>
        </nav>

        <p className="muted">About Adaptive</p>
        <h1>A small framework direction with server rendering built in.</h1>
        <p className="muted">
          The goal is to keep the component ergonomics familiar while staying
          closer to fine-grained reactivity than virtual DOM diffing.
        </p>
      </section>
    </main>
  );
}
