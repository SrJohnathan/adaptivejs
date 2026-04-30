const SUPPORTED_DYNAMIC_HYDRATION_PROPS = new Set([
  "className",
  "class",
  "value",
  "checked",
  "disabled",
  "hidden",
  "title",
  "id",
  "style",
  "dataset"
]);

export function isSupportedDynamicHydrationPropName(key: string): boolean {
  return SUPPORTED_DYNAMIC_HYDRATION_PROPS.has(key);
}
