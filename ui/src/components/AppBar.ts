import { Style, type AdaptiveUIChild, type AdaptiveUIProps, type AdaptiveUIStyle } from "../primitives.js";
import { Column } from "./Column.js";
import { Heading } from "./Heading.js";
import { Row } from "./Row.js";
import { Surface } from "./Surface.js";
import { Text } from "./Text.js";

export type AppBarProps = AdaptiveUIProps & {
  title: string;
  subtitle?: string;
  leading?: () => AdaptiveUIChild[];
  actions?: () => AdaptiveUIChild[];
};

export function AppBar(
  props: AppBarProps,
  style: AdaptiveUIStyle = {},
): AdaptiveUIChild {
  const { title, subtitle, leading, actions, ...rest } = props;

  return Surface(
    () => [
      Row(
        () => [
          ...(leading ? leading() : []),
          Column(
            () => [
              Text("Adaptive UI", { className: "muted" }),
              Heading(title, { level: 2 }),
              ...(subtitle ? [Text(subtitle, { className: "muted" })] : []),
            ],
            { style: { [Style.Flex]: 1 } },
          ),
          ...(actions ? actions() : []),
        ],
        {
          style: {
            [Style.AlignItems]: "center",
            [Style.JustifyContent]: "space-between",
          },
        },
      ),
    ],
    {
      ...rest,
      padding: 20,
    },
    {
      [Style.Border]: "1px solid rgba(28, 26, 23, 0.08)",
      [Style.BorderRadius]: "18px",
      [Style.Background]: "rgba(255,255,255,0.9)",
      [Style.BackdropFilter]: "blur(6px)",
      ...style,
    },
  );
}
