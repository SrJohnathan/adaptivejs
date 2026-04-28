import { App } from "@adaptivejs/common";

function FeatureCard(props: { title: string; body: string }) {
  return (
    <article
      className="card"
      style={{
        padding: 24,
        borderRadius: 24,
        border: "1px solid #d8cdb8",
        backgroundColor: "#fbf7ef",
      }}
    >
      <h3>{props.title}</h3>
      <p className="muted" style={{ color: "#6c5c48" }}>{props.body}</p>
    </article>
  );
}

export default function HomePage() {
  return (
    <main
      className="shell"
      style={{
        maxWidth: 920,
        margin: "48px auto",
        padding: 32,
        borderRadius: 28,
        border: "1px solid #d8cdb8",
        backgroundColor: "#f8f1e6",
      }}
    >
      <section className="hero" style={{ gap: 24 }}>
        <nav className="nav" style={{ gap: 18 }}>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/compose">Compose UI</a>
          <a href="/workspace">Workspace</a>
          <a href="/hooks">Hooks Demo</a>
          <a href="/jsx-hooks">JSX Hooks</a>
          <a href="/reactive-context">Reactive Context</a>
          <a href="/notes/adaptive">Dynamic Route</a>
        </nav>

        <p> app platform: { App.getPlatform() } </p>      
        
              <p className="muted" style={{ color: "#6c5c48", fontSize: 18 }}>Adaptive example app</p>
        <h1 style={{ fontSize: 56, color: "#1f1d1a" }}>
          React-like authoring, direct DOM mindset, SSR-ready structure.
        </h1>
        <p className="muted" style={{ color: "#6c5c48", fontSize: 18 }}>
          This example uses <strong>@adaptivejs/web</strong> as the unified web target for UI and SSR.
        </p>

        <div className="grid" style={{ gap: 20 }}>
          {
              [
                  <FeatureCard title="TSX Components" body="Pages are regular TSX functions." />,
                  <FeatureCard title="SSR Router" body="Routes are resolved from src/pages on the server." />,
                  <FeatureCard title="Page IR" body="Each route can now produce its own IR artifact during build." />,
                  <FeatureCard title="No Vite Core" body="This setup runs without a Vite dependency." />,
              ]
          }
          
        </div>

        <form action="/_action/subscribe" method="post" style={{ gap: 16 }}>
          <label for="email" style={{ fontSize: 18 }}>Subscribe demo action</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            style={{
              width: "100%",
              padding: 16,
              borderRadius: 16,
              border: "1px solid #d8cdb8",
              backgroundColor: "#fffdf8",
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: 16,
              borderRadius: 16,
              backgroundColor: "#1f7b6d",
              color: "#ffffff",
            }}
          >
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
