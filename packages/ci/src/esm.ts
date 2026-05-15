/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 */

import path from "node:path";
import fs from "node:fs/promises";
import esbuild, { Plugin } from "esbuild";
import {extractExports, getHydratableDirective, normalizeEntryId} from "./utilly.js";

/* ================= TYPES ================= */

type BundleClientParams = {
    appDir: string;
    srcDir: string;
    clientDistDir: string;
    tempDir: string;
    dev?: boolean;
    define?: Record<string, string>;
};

type ClientEntry = {
    file: string;
    id: string;
};

type AssetManifestRecord = {
    script: string;
    styles: string[];
    global: boolean;
};

/* ================= MAIN ================= */

/**
 * Faz o bundle do client usando esbuild.
 * - Coleta entradas explícitas (client components)
 * - Cria wrappers de hidratação
 * - Gera chunks e manifest.json
 */
export async function bundleClientEntries({
                                              appDir,
                                              srcDir,
                                              clientDistDir,
                                              tempDir,
                                              dev = false,
                                              define = {},
                                          }: BundleClientParams): Promise<void>
{
    const entryPoints: string[] = [];
    const entryPointIds = new Map<string, string>();
    const explicitEntryIds = new Set<string>();

    // Entradas definidas manualmente
    for (const { file, id } of await collectExplicitClientEntries(appDir, tempDir)) {
        entryPoints.push(file);
        entryPointIds.set(path.resolve(file), id);
        explicitEntryIds.add(id);
    }

    // Wrappers automáticos para componentes hidratáveis
    for (const { wrapperPath, id } of await createClientComponentWrappers({
        srcDir,
        tempDir,
    })) {
        entryPoints.push(wrapperPath);
        entryPointIds.set(path.resolve(wrapperPath), id);
    }

   // if (entryPoints.length === 0) return;
    const result = await esbuild.build({
        absWorkingDir: appDir,
        entryPoints,
        outdir: clientDistDir,
        bundle: true,
        splitting: true,
        format: "esm",
        platform: "browser",
        target: ["es2020"],
        minify: !dev,
        sourcemap: dev ? "inline" : false,
        jsx: "automatic",
        jsxImportSource: "@adaptivejs/web",
        treeShaking: true,
        legalComments: "none",
        define,
        metafile: true,
        entryNames: "assets/entry-[hash]",
        chunkNames: "assets/chunk-[hash]",
        assetNames: "assets/asset-[hash]",
        loader: {
            ".ts": "ts",
            ".tsx": "tsx",
            ".css": "css",
            ".svg": "file",
            ".woff": "file",
            ".woff2": "file",
            ".ttf": "file",
            ".eot": "file",
            ".otf": "file",
            ".png": "file",
            ".jpg": "file",
            ".jpeg": "file",
            ".gif": "file",
            ".webp": "file",
            ".avif": "file",
        },
        plugins: [serverOnlyProxyPlugin(srcDir)],
    });

    // Gera manifest de assets
    const manifest: Record<string, string> = {};
    const assetManifest: Record<string, AssetManifestRecord> = {};

    for (const [outputFile, meta] of Object.entries(result.metafile.outputs)) {
        if (!meta.entryPoint) continue;

        const assetBase = process.env.ADAPTIVE_ASSET_BASE || "";
        const relativeName = path
            .relative(clientDistDir, outputFile)
            .replace(/\\/g, "/");

        const publicName = joinPublicPath(assetBase, relativeName);

        const resolvedEntryPoint = path.resolve(meta.entryPoint);
        const entryId =
            entryPointIds.get(resolvedEntryPoint) ??
            normalizeEntryId(
                path.relative(appDir, resolvedEntryPoint)
            );

        manifest[entryId] = publicName;

        const cssBundle = (meta as typeof meta & { cssBundle?: string }).cssBundle;
        const styles = cssBundle
            ? [
                joinPublicPath(
                    assetBase,
                    path.relative(clientDistDir, cssBundle).replace(/\\/g, "/"),
                ),
            ]
            : [];

        assetManifest[entryId] = {
            script: publicName,
            styles,
            global: explicitEntryIds.has(entryId),
        };
    }

    await fs.writeFile(
        path.join(clientDistDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf8"
    );

    await fs.writeFile(
        path.join(clientDistDir, "asset-manifest.json"),
        JSON.stringify(assetManifest, null, 2),
        "utf8",
    );
}

/* ================= DIRECTIVES ================= */

/**
 * Detecta se um módulo é "use server"
 * (usado para transformar em RPC no client)
 */
function hasServerDirective(source: string): boolean {
    return /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:server|use server)["']\s*;?/.test(
        source
    );
}



/* ================= PATH UTILS ================= */

/**
 * Junta base pública com path gerado
 * Ex: "/_adaptive" + "assets/file.js"
 */
function joinPublicPath(basePath: string, relativePath: string): string {
    const normalizedBase = basePath
        ? `/${basePath.replace(/^\/+|\/+$/g, "")}`
        : "";

    const normalizedRelative = relativePath.replace(/^\/+/, "");

    return `${normalizedBase}/${normalizedRelative}`.replace(/\/{2,}/g, "/");
}


/**
 * Garante caminho válido para import
 */
function toImportPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

/* ================= SERVER ACTION PROXY ================= */

/**
 * Plugin do esbuild que transforma módulos "use server"
 * em proxies client → server (RPC)
 */
function serverOnlyProxyPlugin(srcDir: string): Plugin {
    return {
        name: "adaptive-server-only-proxy",
        setup(build) {
            build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
                const source = await fs.readFile(args.path, "utf8");

                if (!hasServerDirective(source)) return null;

                return {
                    contents: createClientServerProxyModule(
                        source,
                        normalizeEntryId(path.relative(srcDir, args.path))
                    ),
                    loader: "ts",
                };
            });
        },
    };
}

/**
 * Gera módulo proxy para server actions
 */
function createClientServerProxyModule(
    sourceText: string,
    moduleId: string
): string {
    const { namedExports, hasDefaultExport } = extractExports(sourceText);

    const lines: string[] = [
        `import { callServerAction } from "@adaptivejs/web";`,
    ];

    if (hasDefaultExport) {
        lines.push(
            `export default (...args) => callServerAction(${JSON.stringify(
                moduleId
            )}, "default", args);`
        );
    }

    for (const exportName of namedExports) {
        if (exportName === "default") continue;

        lines.push(
            `export const ${exportName} = (...args) => callServerAction(${JSON.stringify(
                moduleId
            )}, ${JSON.stringify(exportName)}, args);`
        );
    }

    return lines.join("\n");
}



/* ================= FILE COLLECTION ================= */

/**
 * Coleta arquivos do client que possuem diretivas de hidratação
 */
async function collectExplicitClientEntries(
    appDir: string,
    tempDir: string
): Promise<ClientEntry[]> {
    try {
        const files = await collectTopLevelSourceFiles(appDir);
        const entries: ClientEntry[] = [];
        const explicitWrapperDir = path.join(tempDir, "explicit-client-entries");
        await fs.mkdir(explicitWrapperDir, { recursive: true });

        for (const file of files) {
            if (isGlobalDependencyEntryPath(appDir, file)) {
                const wrapperPath = await createExplicitClientEntryWrapper({
                    appDir,
                    explicitWrapperDir,
                    file,
                    entryId: "dependency",
                });

                entries.push({
                    file: wrapperPath,
                    id: "dependency",
                });
                continue;
            }

            const source = await fs.readFile(file, "utf8");

            if (!getHydratableDirective(source)) continue;
            if (!isExplicitClientEntryPath(appDir, file)) continue;

            entries.push({
                file,
                id: normalizeEntryId(path.relative(appDir, file)),
            });
        }

        return entries;
    } catch (error: any) {
        if (error?.code === "ENOENT") return [];
        throw error;
    }
}

async function collectTopLevelSourceFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }

        if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            files.push(path.join(dir, entry.name));
        }
    }

    return files;
}

/**
 * Recursivamente coleta arquivos de código
 */
async function collectSourceFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...(await collectSourceFiles(fullPath)));
            continue;
        }

        if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            files.push(fullPath);
        }
    }

    return files;
}

/* ================= WRAPPERS ================= */

/**
 * Cria wrappers para hidratação de componentes client
 */
async function createClientComponentWrappers({
                                                 srcDir,
                                                 tempDir,
                                             }: {
    srcDir: string;
    tempDir: string;
}): Promise<{ wrapperPath: string; id: string }[]> {
    const files = await collectSourceFiles(srcDir);
    const wrappers: { wrapperPath: string; id: string }[] = [];

    const wrapperDir = path.join(tempDir, "client-components");
    await fs.mkdir(wrapperDir, { recursive: true });

    for (const file of files) {
        const relativePath = path.relative(srcDir, file);

       /* if (
            relativePath.startsWith(`pages${path.sep}`) ||
            relativePath === "layout.ts" ||
            relativePath === "layout.tsx"
        ) {
            continue;
        }
*/
        const source = await fs.readFile(file, "utf8");
        if (!getHydratableDirective(source)) continue;

        const moduleId = normalizeEntryId(relativePath);

        const wrapperPath = path.join(
            wrapperDir,
            `${moduleId.replace(/[\\/]/g, "__")}.tsx`
        );

        const importPath = toImportPath(
            path.relative(path.dirname(wrapperPath), file)
        );

        const wrapperSource = `
import * as clientModule from ${JSON.stringify(importPath)};
import { hydrateClientComponents } from "@adaptivejs/web";

hydrateClientComponents(${JSON.stringify(moduleId)}, clientModule);
export {};
`;

        await fs.writeFile(wrapperPath, wrapperSource, "utf8");

        wrappers.push({ wrapperPath, id: moduleId });
    }

    return wrappers;
}

function isExplicitClientEntryPath(appDir: string, file: string): boolean {
    const relativePath = path.relative(appDir, file).replace(/\\/g, "/");

    if (
        relativePath.startsWith("src/") ||
        relativePath.startsWith("public/") ||
        relativePath.startsWith("dist/") ||
        relativePath.startsWith(".adaptivejs/") ||
        relativePath.startsWith("node_modules/")
    ) {
        return false;
    }

    return true;
}

function isGlobalDependencyEntryPath(appDir: string, file: string): boolean {
    const relativePath = path.relative(appDir, file).replace(/\\/g, "/");
    return /^dependency\.(ts|tsx|js|jsx)$/.test(relativePath);
}

async function createExplicitClientEntryWrapper({
    appDir,
    explicitWrapperDir,
    file,
    entryId,
}: {
    appDir: string;
    explicitWrapperDir: string;
    file: string;
    entryId: string;
}): Promise<string> {
    const wrapperPath = path.join(
        explicitWrapperDir,
        `${entryId.replace(/[\\/]/g, "__")}.ts`,
    );

    const importPath = toImportPath(
        path.relative(path.dirname(wrapperPath), file),
    );

    const wrapperSource = `
"client";
import ${JSON.stringify(importPath)};
export {};
`;

    await fs.writeFile(wrapperPath, wrapperSource, "utf8");
    return wrapperPath;
}
