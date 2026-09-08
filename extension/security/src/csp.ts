import type { CspDirectives } from "./types.js";

const DIRECTIVE_NAMES: Record<keyof CspDirectives, string> = {
  defaultSrc: "default-src",
  scriptSrc: "script-src",
  styleSrc: "style-src",
  imgSrc: "img-src",
  fontSrc: "font-src",
  connectSrc: "connect-src",
  frameAncestors: "frame-ancestors",
  baseUri: "base-uri",
  formAction: "form-action",
  objectSrc: "object-src",
  reportUri: "report-uri",
};

export function buildCspHeader(directives: CspDirectives, nonce?: string): string {
  const parts: string[] = [];

  for (const [key, headerName] of Object.entries(DIRECTIVE_NAMES) as [keyof CspDirectives, string][]) {
    const values = directives[key];
    if (!values?.length) continue;

    let resolved = [...values];
    if (nonce && key === "scriptSrc" && !resolved.includes("'nonce-")) {
      resolved = [`'nonce-${nonce}'`, ...resolved];
    }

    parts.push(`${headerName} ${resolved.join(" ")}`);
  }

  return parts.join("; ");
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
}
