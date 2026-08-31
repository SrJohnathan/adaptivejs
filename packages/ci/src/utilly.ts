/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */



import path from "node:path";
import {existsSync} from "node:fs";

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
export function extractExports(sourceText: string): {
    namedExports: string[];
    hasDefaultExport: boolean;
} {
    const exports = new Set<string>();

    const patterns = [
        /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
        /export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
    ];

    for (const pattern of patterns) {
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(sourceText))) {
            exports.add(match[1]);
        }
    }

    return {
        namedExports: Array.from(exports),
        hasDefaultExport: /export\s+default\b/.test(sourceText),
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
