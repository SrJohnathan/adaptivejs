import type { AdaptiveUIChild } from "../primitives.js";

export function ForEach<T>(
  items: T[],
  renderItem: (item: T, index: number) => AdaptiveUIChild
): AdaptiveUIChild[] {
  return items.map((item, index) => renderItem(item, index));
}
