"client";

import { AdaptiveFormData, createContext, useContext, useEffect, useReactive } from "@adaptivejs/web";
import { subscribe } from "../actions";

const CounterContext = createContext({ label: "Adaptive hooks demo" });

function ContextBadge() {
  const ctx = useContext(CounterContext);
  return <p className="muted">{() => `Context value: ${ctx.current.label}`}</p>;
}

export default function HooksApp() {
  const [count, setCount] = useReactive(0);
  const [status, setStatus] = useReactive("booting");
  const [email, setEmail] = useReactive("hello@adaptive.dev");
  const [serverMessage, setServerMessage] = useReactive("No server action called yet.");
  const [selectedFile, setSelectedFile] = useReactive<File | null>(null);

  useEffect(() => {
    setStatus("mounted");
    return () => {
      setStatus("disposed");
    };
  });

  const callSubscribe = async () => {
    const formData = new AdaptiveFormData();
    formData.append("email", email());
    if (selectedFile()) {
      formData.append("attachment", selectedFile() as File);
    }
    const result = await subscribe(formData);
    setServerMessage(result.message);
  };

  return (
    <CounterContext.Provider value={{ label: "shared through createContext()" }}>
      <section className="hero">
        <p className="muted">Client hooks demo</p>
        <h1>useReactive, useContext and useEffect in the browser</h1>
        <p className="muted">{() => `useEffect status: ${status()}`}</p>
        <p className="muted">{() => `Server action: ${serverMessage()}`}</p>
        <p className="muted">{() => `Selected file: ${selectedFile()?.name ?? "none"}`}</p>
        <ContextBadge />
        <input
          value={() => email()}
          onInput={(event: InputEvent & { target: HTMLInputElement }) => setEmail(event.target.value)}
          placeholder="email@example.com"
        />
        <input
          type="file"
          onChange={(event: Event & { target: HTMLInputElement }) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
        <button type="button" onClick={callSubscribe}>Call server action</button>
        <div className="grid">
          <article className="card">
            <h3>Counter</h3>
            <p className="muted">{() => `Current count: ${count()}`}</p>
            <button type="button" onClick={() => setCount((value) => value + 1)}>Increment</button>
          </article>
          <article className="card">
            <h3>What this checks</h3>
            <p className="muted">State updates</p>
            <p className="muted">Context propagation</p>
            <p className="muted">Effect execution</p>
          </article>
        </div>
      </section>
    </CounterContext.Provider>
  );
}
