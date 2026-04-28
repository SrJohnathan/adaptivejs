import HooksApp from "../components/HooksApp";

export default function HooksPage() {
  return (
    <main className="shell">
      <nav className="nav">
        <a href="/">Home</a>
        <a href="/compose">Compose UI</a>
        <a href="/hooks">Hooks Demo</a>
        <a href="/jsx-hooks">JSX Client Component</a>
      </nav>
      <HooksApp />
    </main>
  );
}
