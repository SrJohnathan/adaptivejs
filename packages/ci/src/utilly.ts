/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */



import path from "node:path";
import {existsSync} from "node:fs";
import {Plugin} from "rolldown";
import fs from "node:fs/promises";

export type FileChange = {
    eventType: "rename" | "change";
    filePath: string;
};

export function parseCliArgs(args:any) {
    let targetDir = process.cwd();
    let preset = null;
    let staticBuild = false;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--preset") {
            preset = args[index + 1] ?? null;
            index += 1;
            continue;
        }

        if (arg === "--static") {
            staticBuild = true;
            continue;
        }

        if (!arg.startsWith("--")) {
            targetDir = path.resolve(arg);
        }
    }

    return {
        targetDir,
        preset,
        staticBuild,
    };
}

export const presetMap: Record<string, string> = {
    node: "node-server",
    vercel: "vercel",
    netlify: "netlify",

};


/**
 * Detecta se módulo deve ser hidratado no client
 */
export function getHydratableDirective(
    source: string
): "client" | "hydrate" | null {
    if (hasClientDirective(source)) return "client";
    if (hasHydrateDirective(source)) return "hydrate";
    return null;
}

 function hasClientDirective(source: string): boolean {
    return /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:client|use client)["']/.test(
        source
    );
}

 function hasHydrateDirective(source: string): boolean {
    return /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:hydrate|use hydrate)["']/.test(
        source
    );
}


export function stripHydrateDirective(source:string) {
    return source.replace(
        /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:client|use client|hydrate|use hydrate)["']\s*;?\s*/,
        "",
    );
}

export function stripClientDirective(source:string) {
    return source.replace(
        /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:client|use client)["']\s*;?\s*/,
        "",
    );
}


/**
 * Reescreve imports relativos sem extensão.
 * Ex: import "./foo" vira import "./foo.js".
 */
export function rewriteRelativeImportExtensions(
    code: string,
    sourcePath?: string,
): string {
    return code
        .replace(
            /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
            (_match, start: string, specifier: string, end: string) =>
                `${start}${ensureJsExtension(specifier, sourcePath)}${end}`,
        )
        .replace(
            /(import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
            (_match, start: string, specifier: string, end: string) =>
                `${start}${ensureJsExtension(specifier, sourcePath)}${end}`,
        );
}


/**
 * Garante que um import relativo tenha extensão JS válida.
 */
function ensureJsExtension(
    specifier: string,
    sourcePath?: string,
): string {
    if (/\.(js|mjs|cjs|json)$/.test(specifier)) {
        return specifier;
    }

    if (sourcePath) {
        const absoluteBase = path.resolve(path.dirname(sourcePath), specifier);

        if (hasModuleFile(absoluteBase)) {
            return `${specifier}.js`;
        }

        if (hasModuleIndex(absoluteBase)) {
            return `${specifier}/index.js`;
        }
    }

    return `${specifier}.js`;
}


/**
 * Verifica se existe arquivo de módulo para o caminho base informado.
 */
function hasModuleFile(absoluteBase: string): boolean {
    return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].some((extension) =>
        existsSync(`${absoluteBase}${extension}`),
    );
}

/**
 * Verifica se existe index.* dentro de um diretório importado.
 */
function hasModuleIndex(absoluteBase: string): boolean {
    return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].some((extension) =>
        existsSync(path.join(absoluteBase, `index${extension}`)),
    );
}


/* ================= EXPORT PARSER ================= */

/**
 * Extrai exports nomeados e default de um arquivo
 */
export function extractExports(source: string): {
    namedExports: string[];
    hasDefaultExport: boolean;
    defaultLocalName: string | null;
} {
    const named = new Set<string>();
    let hasDefaultExport = false;
    let defaultLocalName: string | null = null;

    // strip comments grosseiro (evita falsos positivos)
    const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

    // export function Name / export async function Name
    for (const m of code.matchAll(
        /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    )) {
        named.add(m[1]!);
    }

    // export class Name
    for (const m of code.matchAll(/\bexport\s+class\s+([A-Za-z_$][\w$]*)/g)) {
        named.add(m[1]!);
    }

    // export const/let/var Name = ...
    for (const m of code.matchAll(
        /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    )) {
        named.add(m[1]!);
    }

    // export { a, b as c }
    for (const m of code.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
        const inner = m[1]!;
        for (const part of inner.split(",")) {
            const bits = part.trim().split(/\s+as\s+/);
            const exported = (bits[1] ?? bits[0])?.trim();
            if (exported && exported !== "default") named.add(exported);
            if (exported === "default" || bits[0]?.trim() === "default") {
                hasDefaultExport = true;
                const local = bits[0]?.trim();
                if (local && local !== "default") defaultLocalName = local;
            }
        }
    }

    // export default function Name
    {
        const m = code.match(
            /\bexport\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
        );
        if (m) {
            hasDefaultExport = true;
            defaultLocalName = m[1]!;
            named.add(m[1]!); // opcional
        }
    }

    // export default function (anónima) — sem nome local
    if (/\bexport\s+default\s+(?:async\s+)?function\s*\(/.test(code)) {
        hasDefaultExport = true;
        // defaultLocalName continua null → plugin tem de reescrever
    }

    // export default class Name
    {
        const m = code.match(/\bexport\s+default\s+class\s+([A-Za-z_$][\w$]*)/);
        if (m) {
            hasDefaultExport = true;
            defaultLocalName = m[1]!;
        }
    }

    // export default Identifier
    {
        const m = code.match(
            /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;/,
        );
        if (m && m[1] !== "function" && m[1] !== "class") {
            hasDefaultExport = true;
            defaultLocalName = m[1]!;
        }
    }

    // export default () => / export default expr
    if (/\bexport\s+default\s+/.test(code)) {
        hasDefaultExport = true;
    }

    return {
        namedExports: Array.from(named),
        hasDefaultExport,
        defaultLocalName,
    };
}

/**
 * Normaliza id de módulo (remove extensão)
 */
export function normalizeEntryId(relativePath: string): string {
    return relativePath
        .replace(/\.(ts|tsx|js|jsx)$/, "")
        .replace(/\\/g, "/");
}


export function markClientExportsPlugin(srcDir: string): Plugin {
    return {
        name: "adaptive-mark-client-exports",
        async transform(code, id) {
            if (!/\.[cm]?[jt]sx?$/.test(id)) return null;
            if (id.includes("node_modules")) return null;

            let original: string;
            try {
                original = await fs.readFile(id, "utf8");
            } catch {
                return null;
            }

            const raw = getHydratableDirective(original); // "client" | "hydrate" | null
            if (!raw) return null;

            // normalizar — crítico
            const mode: "client" | "hydrate" =
                raw === "hydrate"  ? "hydrate" : "client";

            const moduleId = normalizeEntryId(path.relative(srcDir, id));
            const { namedExports, hasDefaultExport, defaultLocalName } =
                extractExports(original);

            const footer: string[] = [
                "",
                `import { markClientExport } from "@adaptive-js/web";`,
            ];

            for (const name of namedExports) {
                if (name === "default") continue;
                footer.push(
                    `typeof ${name} === "function" && markClientExport(${name}, ${JSON.stringify(moduleId)}, ${JSON.stringify(name)}, ${JSON.stringify(mode)});`,
                );
            }

            if (hasDefaultExport) {
                // Precisas que extractExports descubra o nome local:
                // export default function Foo → "Foo"
                // export default Foo → "Foo"
                // export default () => {} → reescreve o AST para __AdaptiveDefault e usa isso
                const local = defaultLocalName ?? "__AdaptiveDefault";
                footer.push(
                    `typeof ${local} === "function" && markClientExport(${local}, ${JSON.stringify(moduleId)}, "default", ${JSON.stringify(mode)});`,
                );
            }

            return { code: code + "\n" + footer.join("\n"), map: null };
        },
    };
}