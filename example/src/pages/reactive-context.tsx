import ReactiveContextApp from "../components/ReactiveContextApp";

export default function ReactiveContextPage() {
  return (
    <main className="shell">
      <nav className="nav">
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/compose">Compose UI</a>
        <a href="/hooks">Hooks Demo</a>
        <a href="/jsx-hooks">JSX Hooks</a>
        <a href="/reactive-context">Reactive Context</a>
      </nav>
      <ReactiveContextApp />
    </main>
  );
}
