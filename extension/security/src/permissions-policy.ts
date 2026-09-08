import type { PermissionsPolicyOptions } from "./types.js";

/**
 * Builds the `Permissions-Policy` header value from a record of
 * feature → allowlist entries.
 *
 * @example
 * buildPermissionsPolicyHeader({ camera: [], microphone: [], geolocation: [] })
 * // → "camera=(), microphone=(), geolocation=()"
 *
 * @example
 * buildPermissionsPolicyHeader({ fullscreen: ["self"] })
 * // → "fullscreen=(self)"
 */
export function buildPermissionsPolicyHeader(options: PermissionsPolicyOptions): string {
  return Object.entries(options)
    .map(([feature, allowlist]) => {
      if (!allowlist.length) {
        return `${feature}=()`;
      }
      const origins = allowlist
        .map((origin) => (origin === "self" || origin === "'self'" ? "self" : `"${origin}"`))
        .join(" ");
      return `${feature}=(${origins})`;
    })
    .join(", ");
}

/**
 * Applies `Permissions-Policy` to the response.
 * No-ops when `options` is `false` or empty.
 */
export function applyPermissionsPolicy(
  setHeader: (name: string, value: string) => void,
  options: PermissionsPolicyOptions | false,
): void {
  if (options === false) return;
  const value = buildPermissionsPolicyHeader(options);
  if (value) {
    setHeader("Permissions-Policy", value);
  }
}
