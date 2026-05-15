/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

const UNSUPPORTED_DYNAMIC_HYDRATION_PROPS = new Set([
  "children",
  "ref",
  "client",
  "key",
  "dangerouslySetInnerHTML",
  "innerHTML",
  "outerHTML",
  "textContent"
]);

export function isSupportedDynamicHydrationPropName(key: string): boolean {
  return !UNSUPPORTED_DYNAMIC_HYDRATION_PROPS.has(key);
}
