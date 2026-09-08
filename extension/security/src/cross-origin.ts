import type { CoepOption, CoopOption, CorpOption } from "./types.js";

/**
 * Applies `Cross-Origin-Opener-Policy`.
 * Isolates the browsing context group, preventing Spectre-style
 * cross-origin reads via shared `window` references.
 */
export function applyCoop(
  setHeader: (name: string, value: string) => void,
  option: CoopOption,
): void {
  if (option === false) return;
  setHeader("Cross-Origin-Opener-Policy", option);
}

/**
 * Applies `Cross-Origin-Resource-Policy`.
 * Restricts which origins may load this resource in a `<script>`,
 * `<img>`, etc., guarding against cross-origin reads.
 */
export function applyCorp(
  setHeader: (name: string, value: string) => void,
  option: CorpOption,
): void {
  if (option === false) return;
  setHeader("Cross-Origin-Resource-Policy", option);
}

/**
 * Applies `Cross-Origin-Embedder-Policy`.
 * Opt-in — enables `SharedArrayBuffer` / high-resolution timers but
 * blocks third-party embeds that don't send CORP. Default is `false`.
 */
export function applyCoep(
  setHeader: (name: string, value: string) => void,
  option: CoepOption,
): void {
  if (option === false) return;
  setHeader("Cross-Origin-Embedder-Policy", option);
}
