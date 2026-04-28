import JsxHooksApp from "../components/JsxHooksApp";

export default function JsxHooksPage() {
  return (
    <main className="shell">
      <nav className="nav">
        <a href="/">Home</a>
        <a href="/compose">Compose UI</a>
        <a href="/hooks">Hooks Demo</a>
        <a href="/jsx-hooks">JSX Client Component</a>
      </nav>
      <JsxHooksApp />
    </main>
  );
}
