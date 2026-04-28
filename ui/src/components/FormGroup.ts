import { adaptiveCreateElement, Style, type AdaptiveUIChild } from "../primitives.js";
import { Surface } from "./Surface.js";

export function FormGroup(label: string, input: AdaptiveUIChild, id?: string): AdaptiveUIChild {
  return Surface(
    () => [
      adaptiveCreateElement(
        "label",
        {
          htmlFor: id,
          style: {
            [Style.Display]: "block",
            [Style.FontWeight]: "600",
            [Style.MarginBottom]: "0.5rem",
          },
        },
        label,
      ),
      input,
    ],
    {},
    { [Style.MarginBottom]: "1rem" },
  );
}
