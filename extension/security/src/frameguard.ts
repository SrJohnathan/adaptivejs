import type { FrameguardOption } from "./types.js";

/**
 * Builds the value for the `X-Frame-Options` header.
 * Returns `null` when frameguard is disabled (`false`).
 */
export function buildFrameguardHeader(option: FrameguardOption): string | null {
  if (option === false) return null;
  return option === "sameorigin" ? "SAMEORIGIN" : "DENY";
}

/**
 * Applies `X-Frame-Options` to a raw setter function.
 */
export function applyFrameguard(
  setHeader: (name: string, value: string) => void,
  option: FrameguardOption,
): void {
  const value = buildFrameguardHeader(option);
  if (value !== null) {
    setHeader("X-Frame-Options", value);
  }
}
