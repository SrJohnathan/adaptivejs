import {
  AppBar,
  Button,
  Card,
  Column,
  Row,
  Spacer,
  Style,
  Text,
  Title,
} from "@adaptivejs/ui";

export default function WorkspacePage() {
  return (
    <main className="shell">
      {Column(
        () => [
          AppBar({
            title: "Adaptive Workspace",
            subtitle: "Second declarative page using the new AppBar primitive.",
            leading: () => [
              <a href="/">Home</a>,
              <a href="/about">About</a>,
              <a href="/compose">Compose UI</a>,
              <a href="/workspace">Workspace</a>,
            ],
            actions: () => [
              Button("New page"),
              Button("Export IR", { type: "button" }),
            ],
            className: "hero",
          }),

          Spacer("1rem"),

          Row(
            () => [
              Card(
                () => [
                  Title("Page IR", 3),
                  Text("Each page now generates its own IR file and manifest entry during build."),
                ],
                { className: "card" },
                { [Style.Width]: "100%" },
              ),
              Card(
                () => [
                  Title("Semantic AppBar", 3),
                  Text("The UI layer now exposes an AppBar primitive shared by web and future native targets."),
                ],
                { className: "card" },
                { [Style.Width]: "100%" },
              ),
            ],
            { className: "grid" },
          ),

          Spacer("1rem"),

          Card(
            () => [
              Title("Why per-page IR?"),
              Text(
                "Because large projects should not emit a single giant JSON. Route-level IR gives us chunking, cache boundaries and a cleaner bridge for desktop and mobile targets.",
                { className: "muted" },
              ),
            ],
            { className: "hero" },
          ),
        ],
      )}
    </main>
  );
}
