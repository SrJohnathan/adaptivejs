"client";

import { createContext, useContext, useEffect, useReactive } from "@adaptivejs/web";

const ProfileContext = createContext({
  role: "Guest",
  accent: "#136f63"
});

function StatusPill() {
  const profile = useContext(ProfileContext);
  return (
    <span
      style={() => ({
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: "999px",
        backgroundColor: profile.current.accent,
        color: "white",
        fontSize: "0.9rem"
      })}
    >
      {() => `Context role: ${profile.current.role}`}
    </span>
  );
}

function CounterCard(props: { title: string }) {
  const [value, setValue] = useReactive(0);

  return (
    <article className="card">
      <h3>{props.title}</h3>
      <p className="muted">{() => `Local count: ${value()}`}</p>
      <button type="button" onClick={() => setValue((current) => current + 1)}>
        Increment local state
      </button>
    </article>
  );
}

export default function ReactiveContextApp() {
  const [name, setName] = useReactive("Adaptive Builder");
  const [effectLog, setEffectLog] = useReactive("waiting for effect");

  useEffect(() => {
    setEffectLog(`effect ran for ${name()}`);
  }, [name]);

  return (
    <ProfileContext.Provider
      value={{
        role: "Maintainer",
        accent: "#b85c38"
      }}
    >
      <section className="hero">
        <p className="muted">Context + component local reactive state</p>
        <h1>Regular components using shared context and local reactivity</h1>
        <p className="muted">{() => `useEffect log: ${effectLog()}`}</p>
        <StatusPill />
        <div style={{ height: "16px" }} />
        <label for="profile-name" className="muted">Shared name</label>
        <input
          id="profile-name"
          value={() => name()}
          onInput={(event: InputEvent & { target: HTMLInputElement }) => setName(event.target.value)}
        />
        <p className="muted">{() => `Current input value: ${name()}`}</p>
        <div className="grid">
          <CounterCard title="Counter A" />
          <CounterCard title="Counter B" />
        </div>
      </section>
    </ProfileContext.Provider>
  );
}
