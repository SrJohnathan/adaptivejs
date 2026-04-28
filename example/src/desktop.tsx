import { useReactive } from "@adaptivejs/web";
import {
  AppBar,
  Button,
  Column,
  Link,
  Style,
  Text,
  render
} from "@adaptivejs/ui";

export default function DesktopEntry() {
  const [count, setCount] = useReactive(0);

  return render(() =>
    Column(
      () => [
        AppBar({
          title: "Adaptive Desktop semantic entry",
          subtitle: "Desktop target using declarative Adaptive UI primitives and page-friendly IR.",
          style: {
            [Style.Background]: "rgba(18, 18, 30, 1)",
          },
          leading: () => [
            Link("Home", { href: "/" }),
            Link("About", { href: "/about" }),
            Link("Compose UI", { href: "/compose" }),
            Link("Workspace", { href: "/workspace" }),
          ],
          actions: () => [
            Button("Open IR"),
          ],
        }),
        Column(
          () => [
            Text(`Cliques no desktop: ${count()}`),
            Button("Clique aqui", {
              onPress: () => setCount(count() + 1),
            }),
          ],
          {
            spacing: 12,
            style: {
              [Style.Padding]: "24px",
            },
          }
        ),
      ],
      { spacing: 16 }
    )
  );
}
