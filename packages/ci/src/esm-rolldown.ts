/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { build, type Plugin } from "rolldown";
import { extractExports, getHydratableDirective, normalizeEntryId } from "./utilly.js";

/* ================= TYPES ================= */

type BundleClientParams = {
    appDir: string;
    srcDir: string;
    clientDistDir: string;
    tempDir: string;
    dev?: boolean;
    define?: Record<string, string>;
    external?: (string | RegExp)[];
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
 * Faz o bundle do client usando Rolldown.
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
                                                external
                                          }: BundleClientParams): Promise<void> {
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

    // Named inputs: name = entryId (facilita mapear saída ↔ id)
    const input: Record<string, string> = {};
    for (const file of entryPoints) {
        const resolved = path.resolve(file);
        const id =
            entryPointIds.get(resolved) ??
            normalizeEntryId(path.relative(appDir, resolved));
        // Evita colisão de nomes: se o mesmo id aparecer mais de uma vez, usa path-based key
        const key = input[id] ? `${id}__${path.basename(file, path.extname(file))}` : id;
        input[key] = file;
        if (!entryPointIds.has(resolved)) {
            entryPointIds.set(resolved, id);
        }
    }

    const result = await build({
        cwd: appDir,
        input,
        platform: "browser",
        treeshake: true,
        external ,
        checks: {
            configurationFieldConflict: false
        },
        transform: {
            define,
            target: "es2020",
            jsx: {
                runtime: "automatic",
                importSource: "@adaptive-js/web",
            },
        },
        // CSS tratado pelo adaptiveCssPlugin (sem dependência externa quebrada)
        moduleTypes: {
            ".svg": "asset",
            ".woff": "asset",
            ".woff2": "asset",
            ".ttf": "asset",
            ".eot": "asset",
            ".otf": "asset",
            ".png": "asset",
            ".jpg": "asset",
            ".jpeg": "asset",
            ".gif": "asset",
            ".webp": "asset",
            ".avif": "asset",
        },
        plugins: [
            adaptiveCssPlugin({ minify: !dev }),
            serverOnlyProxyPlugin(srcDir),
        ],
        output: {
            dir: clientDistDir,
            format: "esm",
            minify: !dev,
            sourcemap: dev ? "inline" : false,
            entryFileNames: "assets/entry-[hash].js",
            chunkFileNames: "assets/chunk-[hash].js",
            assetFileNames: "assets/asset-[hash][extname]",
        },
    });

    // Gera manifest de assets a partir do output do Rolldown
    const manifest: Record<string, string> = {};
    const assetManifest: Record<string, AssetManifestRecord> = {};

    const assetBase = process.env.ADAPTIVE_ASSET_BASE || "";

    // CSS assets emitidos (type === "asset" e .css)
    const cssAssets = result.output.filter(
        (item): item is Extract<(typeof result.output)[number], { type: "asset" }> =>
            item.type === "asset" &&
            typeof item.fileName === "string" &&
            item.fileName.replace(/\\/g, "/").endsWith(".css"),
    );

    // Mapa moduleId → fileName público do CSS (preenchido no plugin via meta implícita nos assets)
    const cssByModuleId = new Map<string, string>();
    for (const asset of cssAssets) {
        const name = asset.fileName.replace(/\\/g, "/");
        // nome do source original pode vir em asset.name
        if (asset.name) {
            cssByModuleId.set(path.resolve(String(asset.name)), name);
        }
    }

    for (const item of result.output) {
        if (item.type !== "chunk" || !item.isEntry) continue;

        const publicName = joinPublicPath(assetBase, item.fileName.replace(/\\/g, "/"));

        const facade = item.facadeModuleId
            ? path.resolve(item.facadeModuleId)
            : null;

        let entryId: string | undefined;
        if (facade) {
            entryId = entryPointIds.get(facade);
            if (!entryId) {
                entryId = normalizeEntryId(path.relative(appDir, facade));
            }
        }

        if (!entryId && item.name) {
            entryId = item.name;
        }

        if (!entryId) continue;

        manifest[entryId] = publicName;

        const styles = collectStylesForChunk({
            chunk: item,
            cssAssets,
            entryId,
            assetBase,
        });

        assetManifest[entryId] = {
            script: publicName,
            styles,
            global: explicitEntryIds.has(entryId),
        };
    }

    await fs.writeFile(
        path.join(clientDistDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf8",
    );

    await fs.writeFile(
        path.join(clientDistDir, "asset-manifest.json"),
        JSON.stringify(assetManifest, null, 2),
        "utf8",
    );
}

/* ================= DIRECTIVES ================= */

/**
 * Detecta se um módulo possui a diretiva "server" ou "use server"
 */
function hasServerDirective(source: string): boolean {
    return /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:server|use server)["']\s*;?/.test(
        source,
    );
}

/**
 * Detecta se um módulo é uma server action:
 * - Possui a diretiva "server" ou "use server"
 * - OU está localizado dentro de um diretório "actions" (ex: src/actions/..., src/modules/user/actions/...)
 */
export function isServerActionModule(
    filePath: string,
    source: string,
    srcDir?: string,
): boolean {
    if (hasServerDirective(source)) {
        return true;
    }

    const normalizedPath = filePath.replace(/\\/g, "/");

    if (srcDir) {
        const rel = path.relative(srcDir, filePath).replace(/\\/g, "/");
        if (rel.startsWith("actions/") || rel.includes("/actions/")) {
            return true;
        }
    }

    return normalizedPath.includes("/actions/");
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
 * Coleta URLs públicas de CSS associados a um entry chunk.
 */
function collectStylesForChunk({
                                   chunk,
                                   cssAssets,
                                   entryId,
                                   assetBase,
                               }: {
    chunk: {
        fileName: string;
        name?: string;
        code?: string;
        moduleIds?: string[];
        modules?: Record<string, unknown>;
    };
    cssAssets: { fileName: string; name?: string }[];
    entryId: string;
    assetBase: string;
}): string[] {
    const styles = new Set<string>();
    const chunkDir = path.posix.dirname(chunk.fileName.replace(/\\/g, "/"));

    // 1) CSS referenciado no código do chunk
    const code = chunk.code ?? "";
    const importRe =
        /(?:import\s+|require\s*\(\s*)["']([^"']+\.css)["']\s*\)?/g;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(code)) !== null) {
        const spec = match[1].replace(/\\/g, "/");
        const resolved = path.posix.normalize(path.posix.join(chunkDir, spec));
        styles.add(joinPublicPath(assetBase, resolved.replace(/^\.\//, "")));
    }

    // 2) Módulos CSS incluídos neste chunk (moduleIds / modules)
    const moduleIds = new Set<string>([
        ...(chunk.moduleIds ?? []),
        ...Object.keys(chunk.modules ?? {}),
    ]);
    for (const asset of cssAssets) {
        const fileName = asset.fileName.replace(/\\/g, "/");
        const sourceName = asset.name ? path.resolve(String(asset.name)) : null;
        if (sourceName && moduleIds.has(sourceName)) {
            styles.add(joinPublicPath(assetBase, fileName));
            continue;
        }
        // fallback por nome do entry
        const base = path.posix.basename(fileName, ".css");
        if (
            base === entryId ||
            base.startsWith(`${entryId}.`) ||
            base.startsWith(`${entryId}-`) ||
            (chunk.name &&
                (base === chunk.name ||
                    base.startsWith(`${chunk.name}.`) ||
                    base.startsWith(`${chunk.name}-`)))
        ) {
            styles.add(joinPublicPath(assetBase, fileName));
        }
    }

    return Array.from(styles);
}

/**
 * Plugin mínimo de CSS para Rolldown (substitui rolldown-plugin-css quebrado).
 * - Carrega .css / .module.css
 * - Emite asset em assets/css-[hash].css
 * - CSS modules: export default { className: "..." }
 * - CSS normal: módulo vazio com side-effects (para o asset ser emitido)
 */
function adaptiveCssPlugin(options: { minify?: boolean } = {}): Plugin {
    const minify = options.minify === true;
    // id absoluto → reference id do emitFile
    const emitted = new Map<string, string>();

    return {
        name: "adaptive-css",
        load: {
            filter: {
                id: /\.css$/i,
            },
            async handler(id) {
                // ignora virtual / query strings especializadas
                const cleanId = id.split("?")[0];
                if (!/\.css$/i.test(cleanId)) return null;

                let source: string;
                try {
                    source = await fs.readFile(cleanId, "utf8");
                } catch {
                    return null;
                }

                let css = source;
                if (minify) {
                    css = minifyCss(css);
                }

                const isModule = /\.module\.css$/i.test(cleanId);
                let classMap: Record<string, string> | null = null;

                if (isModule) {
                    const scoped = scopeCssModules(css, cleanId);
                    css = scoped.css;
                    classMap = scoped.exports;
                }

                const hash = createHash("sha256")
                    .update(css)
                    .digest("hex")
                    .slice(0, 8);
                const fileName = `assets/css-${hash}.css`;

                const refId = this.emitFile({
                    type: "asset",
                    fileName,
                    source: css,
                    // name guarda o path original para associar no manifest
                    name: cleanId,
                });
                emitted.set(path.resolve(cleanId), refId);

                if (classMap) {
                    return {
                        code: `export default ${JSON.stringify(classMap)};`,
                        moduleType: "js",
                        moduleSideEffects: true,
                    };
                }

                // CSS global: placeholder com side-effect para não ser tree-shaken
                return {
                    code: `/* adaptive-css: ${fileName} */\nexport {};`,
                    moduleType: "js",
                    moduleSideEffects: true,
                };
            },
        },
    };
}

/** Minify CSS bem simples (espaço/comentários). Suficiente para produção básica. */
function minifyCss(css: string): string {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .replace(/\s*([{}:;,])\s*/g, "$1")
        .replace(/;}/g, "}")
        .trim();
}

/**
 * CSS Modules mínimo: .foo → .foo_xxxxxx e export { foo: "foo_xxxxxx" }
 */
function scopeCssModules(
    css: string,
    filePath: string,
): { css: string; exports: Record<string, string> } {
    const hash = createHash("sha256")
        .update(filePath)
        .digest("hex")
        .slice(0, 6);
    const exports: Record<string, string> = {};

    const scoped = css.replace(
        /\.([A-Za-z_][\w-]*)\b/g,
        (_m, local: string) => {
            if (!exports[local]) {
                exports[local] = `${local}_${hash}`;
            }
            return `.${exports[local]}`;
        },
    );

    return { css: scoped, exports };
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
 * Plugin do Rolldown (estilo Rollup) que transforma módulos "use server"
 * em proxies client → server (RPC)
 */
function serverOnlyProxyPlugin(srcDir: string): Plugin {
    return {
        name: "adaptive-server-only-proxy",
        load: {
            filter: {
                id: /\.[cm]?[jt]sx?$/,
            },
            async handler(id) {
                // Só processa arquivos reais do filesystem
                if (id.includes("\0") || id.startsWith("virtual:")) return null;

                let source: string;
                try {
                    source = await fs.readFile(id, "utf8");
                } catch {
                    return null;
                }

                if (!isServerActionModule(id, source, srcDir)) return null;

                return {
                    code: createClientServerProxyModule(
                        source,
                        normalizeEntryId(path.relative(srcDir, id)),
                    ),
                    moduleType: "js",
                };
            },
        },
    };
}

/**
 * Gera módulo proxy para server actions
 */
function createClientServerProxyModule(
    sourceText: string,
    moduleId: string,
): string {
    const { namedExports, hasDefaultExport } = extractExports(sourceText);

    const lines: string[] = [
        `import { callServerAction } from "@adaptive-js/web";`,
    ];

    if (hasDefaultExport) {
        lines.push(
            `export default (...args) => callServerAction(${JSON.stringify(
                moduleId,
            )}, "default", args);`,
        );
    }

    for (const exportName of namedExports) {
        if (exportName === "default") continue;

        lines.push(
            `export const ${exportName} = (...args) => callServerAction(${JSON.stringify(
                moduleId,
            )}, ${JSON.stringify(exportName)}, args);`,
        );
    }

    return lines.join("\n");
}

/**
 * Coleta módulos que possuem a diretiva "server" / "use server"
 * ou estão localizados dentro de pastas "actions" e gera o manifesto server-modules.json
 */
export async function writeServerModulesManifest(
    srcDir: string,
    serverDistDir: string,
): Promise<string[]> {
    const files = await collectSourceFiles(srcDir);
    const serverModules = new Set<string>();

    for (const file of files) {
        try {
            const source = await fs.readFile(file, "utf8");
            if (isServerActionModule(file, source, srcDir)) {
                const relativePath = path.relative(srcDir, file);
                serverModules.add(normalizeEntryId(relativePath));
            }
        } catch {
            // ignore read errors
        }
    }

    const manifestList = Array.from(serverModules);

    if (!manifestList.includes("actions/index")) {
        const hasActionsIndex = files.some((f) => {
            const rel = path.relative(srcDir, f).replace(/\\/g, "/");
            return /^actions\/index\.(ts|tsx|js|jsx)$/.test(rel);
        });
        if (hasActionsIndex) {
            manifestList.push("actions/index");
        }
    }

    await fs.writeFile(
        path.join(serverDistDir, "server-modules.json"),
        JSON.stringify(manifestList, null, 2),
        "utf8",
    );

    return manifestList;
}

/* ================= FILE COLLECTION ================= */

/**
 * Coleta arquivos do client que possuem diretivas de hidratação
 */
async function collectExplicitClientEntries(
    appDir: string,
    tempDir: string,
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
        const source = await fs.readFile(file, "utf8");
        if (isServerActionModule(file, source, srcDir)) continue;
        if (!getHydratableDirective(source)) continue;

        const moduleId = normalizeEntryId(relativePath);

        const wrapperPath = path.join(
            wrapperDir,
            `${moduleId.replace(/[\\/]/g, "__")}.tsx`,
        );

        const importPath = toImportPath(
            path.relative(path.dirname(wrapperPath), file),
        );

        const wrapperSource = `
import * as clientModule from ${JSON.stringify(importPath)};
import { hydrateClientComponents } from "@adaptive-js/web";

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