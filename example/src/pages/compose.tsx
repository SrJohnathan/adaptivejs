import {
  Button,
  Card,
  Column,
  Form,
  FormGroup,
  Input,
  Row,
  Spacer,
  Style,
  Text,
  Title
} from "@adaptivejs/ui";

export default function ComposePage() {
  return (
    <main className="shell">
      {Column(
        () => [
          Card(
            () => [
              Row(
                () => [
                  <a href="/">Home</a>,
                  <a href="/about">About</a>,
                  <a href="/compose">Compose UI</a>,
                  <a href="/workspace">Workspace</a>,
                  <a href="/hooks">Hooks Demo</a>,
                  <a href="/jsx-hooks">JSX Hooks</a>,
                  <a href="/reactive-context">Reactive Context</a>
                ],
                { className: "nav" },
                { [Style.MarginBottom]: "1.5rem" }
              ),

              Text("Declarative compose style", { className: "muted" }),
              Title("This page is built with the compose API instead of regular TSX."),
              Text(
                "The goal here is to show the second authoring style: more structured, more DSL-like, and closer to Compose or Flutter ergonomics.",
                { className: "muted" }
              ),

              Spacer("1.25rem"),

              Row(
                () => [
                  Card(
                    () => [
                      Title("Column / Row", 3),
                      Text("Layout is composed with functions instead of nested JSX blocks.")
                    ],
                    { className: "card" },
                    { [Style.Width]: "100%" }
                  ),
                  Card(
                    () => [
                      Title("Form primitives", 3),
                      Text("Inputs, labels and groups can be assembled as declarative building blocks.")
                    ],
                    { className: "card" },
                    { [Style.Width]: "100%" }
                  )
                ],
                { className: "grid" }
              ),

              Spacer("1.25rem"),

              Form(
                () => [
                  FormGroup(
                    "Name",
                    Input({
                      id: "name",
                      name: "name",
                      placeholder: "Adaptive builder"
                    })
                  ),
                  FormGroup(
                    "Favorite style",
                    Input({
                      id: "style",
                      name: "style",
                      placeholder: "TSX or Compose"
                    })
                  ),
                  Button("Compose Submit", { type: "submit" })
                ]
              )
            ],
            { className: "hero" },
            {
              [Style.Border]: "none",
              [Style.Padding]: "32px",
              [Style.BoxShadow]: "0 24px 60px rgba(28, 26, 23, 0.08)"
            }
          )
        ]
      )}
    </main>
  );
}
