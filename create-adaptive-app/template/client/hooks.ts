"client";

import { createContext, createElement, mount, useContext, useEffect, useReactive } from "@adaptivejs/web";

const CounterContext = createContext({ label: "Adaptive hooks demo" });

function ContextBadge() {
  const ctx = useContext(CounterContext);
  return createElement("p", { className: "muted" }, () => `Context value: ${ctx.current.label}`);
}

function HookCard() {
  const [count, setCount] = useReactive(0);
  const [status, setStatus] = useReactive("booting");

  useEffect(() => {
    setStatus("mounted");
    return () => {
      setStatus("disposed");
    };
  });

  return createElement(
    CounterContext.Provider,
    { value: { label: "shared through createContext()" } },
    createElement(
      "section",
      { className: "hero" },
      createElement("p", { className: "muted" }, "Client hooks demo"),
      createElement("h1", {}, "useReactive, useContext and useEffect in the browser"),
      createElement("p", { className: "muted" }, () => `useEffect status: ${status()}`),
      createElement(ContextBadge, {}),
      createElement(
        "div",
        { className: "grid" },
        createElement(
          "article",
          { className: "card" },
          createElement("h3", {}, "Counter"),
          createElement("p", { className: "muted" }, () => `Current count: ${count()}`),
          createElement("button", { type: "button", onClick: () => setCount((value) => value + 1) }, "Increment")
        ),
        createElement(
          "article",
          { className: "card" },
          createElement("h3", {}, "What this checks"),
          createElement("p", { className: "muted" }, "State updates"),
          createElement("p", { className: "muted" }, "Context propagation"),
          createElement("p", { className: "muted" }, "Effect execution")
        )
      )
    )
  );
}

const root = document.getElementById("hooks-root");
if (root) {
  mount(root, () => createElement(HookCard, {}));
}
