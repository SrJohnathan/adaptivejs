import JsxHooksApp from "../components/JsxHooksApp";

export default function JsxHooksPage() {
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
      <JsxHooksApp />
    </main>
  );
}
