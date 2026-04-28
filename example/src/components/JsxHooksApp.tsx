"client";

import { createContext, useContext, useEffect, useReactive } from "@adaptivejs/web";

const ThemeContext = createContext({
  name: "Adaptive",
  color: "#136f63"
});

function ThemeBadge() {
  const theme = useContext(ThemeContext);

  return (
    <span
      style={() => ({
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: "999px",
        backgroundColor: theme.current.color,
        color: "white",
        fontSize: "0.9rem"
      })}
    >
      {() => `Theme from context: ${theme.current.name}`}
    </span>
  );
}





function CounterPanel(props: { title: string }) {
  const [count, setCount] = useReactive(0);

  return (
    <article className="card">
      <h3>{props.title}</h3>
      <p className="muted">{() => `Count: ${count()}`}</p>
      <button type="button" onClick={() => setCount((current) => current + 1)}>
        Increment
      </button>
    </article>
  );
}

export default function JsxHooksApp() {
  const [name, setName] = useReactive("Adaptive");
  const [effectLog, setEffectLog] = useReactive("waiting");

  useEffect(() => {
    setEffectLog(`effect synced with ${name()}`);
  }, [name]);

  return (
    <ThemeContext.Provider
      value={{
        name: "JSX components",
        color: "#7a3cff"
      }}
    >
      <section className="hero">
        <p className="muted">JSX component hooks demo</p>
        <h1>Hooks working with regular JSX components</h1>
        <p className="muted">{() => `Effect log: ${effectLog()}`}</p>
        <ThemeBadge />

        <div style={{ height: "16px" }} />

        <label htmlFor="jsx-name" className="muted">
          Shared reactive name
        </label>
        <input
          id="jsx-name"
          value={() => name()}
          onInput={(event) => setName((event.target as HTMLInputElement).value)}
        />
        <p className="muted">{() => `Input value: ${name()}`}</p>

        <div className="grid">
          <CounterPanel title="JSX Counter A" />
          <CounterPanel title="JSX Counter B" />
        </div>
      </section>
    </ThemeContext.Provider>
  );
}
