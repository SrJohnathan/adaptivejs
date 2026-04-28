import { Button, Card, Column, Form, FormGroup, Input, Row, Spacer, Style, Text, Title } from "@adaptivejs/ui";

export default function ComposePage() {
  return (
    <main className="shell">
      {Column(() => [
        Card(() => [
          Row(() => [
            <a href="/">Home</a>,
            <a href="/compose">Compose UI</a>,
            <a href="/hooks">Hooks Demo</a>,
            <a href="/jsx-hooks">JSX Client Component</a>
          ], { className: "nav" }, { [Style.MarginBottom]: "1.5rem" }),
          Text("Declarative compose style", { className: "muted" }),
          Title("This page is built with the compose API."),
          Text("It shows the second authoring style of Adaptive.", { className: "muted" }),
          Spacer("1rem"),
          Form(() => [
            FormGroup("Name", Input({ id: "name", name: "name", placeholder: "Adaptive builder" })),
            Button("Compose Submit", { type: "submit" })
          ])
        ], { className: "hero" }, { [Style.Border]: "none", [Style.Padding]: "32px" })
      ])}
    </main>
  );
}
