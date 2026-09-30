/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */


import {HydrationManifest} from "./hydration-manifest.js";

export function formatHydrationMismatchReport(input: {
    debugName: string;
    boundaryId?: string;
    unsupportedFeatures: string[];
    manifest?: HydrationManifest;
    collected?: {
        events: Map<string, unknown>;
        refs: Map<string, unknown>;
        reactive: Map<string, unknown>;
        dynamicProps: Map<string, unknown>;
    };
}): string {
    const lines: string[] = [
        `[Adaptive hydrate] boundary "${input.debugName}"${
            input.boundaryId ? ` (${input.boundaryId})` : ""
        }`,
        `Hydration stopped: manifest ↔ client collection mismatch.`,
    ];

    const missing: string[] = [];
    const extra: string[] = [];
    const other: string[] = [];

    for (const f of input.unsupportedFeatures) {
        if (f.includes(":extra:")) extra.push(f);
        else if (f.startsWith("manifest:")) missing.push(f);
        else other.push(f);
    }

    if (missing.length) {
        lines.push("");
        lines.push("In SSR manifest, missing on client re-collect:");
        for (const f of missing) {
            lines.push(`  • ${explainFeature(f)}`);
        }
    }

    if (extra.length) {
        lines.push("");
        lines.push("On client re-collect, not present in SSR manifest:");
        for (const f of extra) {
            lines.push(`  • ${explainFeature(f)}`);
        }
    }

    if (other.length) {
        lines.push("");
        lines.push("Other:");
        for (const f of other) lines.push(`  • ${f}`);
    }

    if (input.manifest && input.collected) {
        lines.push("");
        lines.push("Counts:");
        lines.push(
            `  manifest: ${summarizeManifest(input.manifest)}`,
        );
        lines.push(
            `  collected: events=${input.collected.events.size} refs=${input.collected.refs.size} reactive=${input.collected.reactive.size} dynamicProps=${input.collected.dynamicProps.size}`,
        );
    }

    lines.push("");
    lines.push("Hints:");
    lines.push(
        "  • manifest:ref / reactive-* missing on client → often a child \"client\" island expanded on SSR into this hydrate parent, or Reveal/thunk order changed.",
    );
    lines.push(
        "  • :extra on client → parent collected bindings the SSR never serialized (nested hydrate/client, or conditional tree).",
    );
    lines.push(
        "  • Set window.__ADAPTIVE_DEBUG_HYDRATION__ = true for full key lists.",
    );

    return lines.join("\n");
}

function explainFeature(feature: string): string {
    // manifest:ref:f0:b4:0
    // manifest:reactive-range:rx2:b4:2
    // manifest:event:extra:e0,e1
    const parts = feature.split(":");
    if (parts[0] !== "manifest") return feature;

    const kind = parts[1]; // ref | event | reactive-range | reactive | extra...
    if (kind === "event" && parts[2] === "extra") {
        return `extra events on client: ${parts.slice(3).join(":") || "(none)"}`;
    }
    if (kind === "ref" && parts[2] === "extra") {
        return `extra refs on client: ${parts.slice(3).join(":")}`;
    }
    if (kind === "reactive" && parts[2] === "extra") {
        return `extra reactive on client: ${parts.slice(3).join(":")}`;
    }
    if (kind === "dynamic-prop" && parts[2] === "extra") {
        return `extra dynamic props on client: ${parts.slice(3).join(":")}`;
    }

    // missing on client: manifest:ref:f0:b4:0
    const key = parts[2];
    const id = parts[3];
    const rest = parts.slice(4).join(":");
    const where = id ? ` (data-aid / id: ${id}${rest ? ` ${rest}` : ""})` : "";

    switch (kind) {
        case "ref":
            return `ref key "${key}"${where} — SSR had ref, client re-collect did not`;
        case "event":
            return `event key "${key}"${where} — SSR had handler, client re-collect did not`;
        case "reactive-range":
            return `reactive-range "${key}"${where} — SSR thunk/text range, client missing (Reveal / {() => ...}?)`;
        case "reactive-struct":
            return `reactive-struct "${key}"${where} — SSR struct thunk, client missing`;
        case "reactive-list":
            return `reactive-list "${key}"${where} — SSR list thunk, client missing`;
        case "reactive-async":
            return `reactive-async "${key}"${where}`;
        case "dynamic-prop":
            return `dynamic-prop "${key}"${where}${parts[4] ? ` prop=${parts[4]}` : ""}`;
        case "missing":
            return "manifest script missing for this boundary";
        default:
            return feature;
    }
}

function summarizeManifest(manifest: HydrationManifest): string {
    const counts: Record<string, number> = {};
    for (const i of manifest.instructions) {
        counts[i.kind] = (counts[i.kind] ?? 0) + 1;
    }
    return Object.entries(counts)
        .map(([k, n]) => `${k}=${n}`)
        .join(" ") || "(empty)";
}
