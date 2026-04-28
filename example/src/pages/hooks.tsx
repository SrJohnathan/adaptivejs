import HooksApp from "../components/HooksApp";

export default function HooksPage() {
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
      <HooksApp />
    </main>
  );
}
