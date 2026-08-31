/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import {
    createClientEnvDefine,
    getPublicEnv,
} from "./env-loader.js";

import { bundleClientEntries, writeServerModulesManifest } from "./esm.js";
import { rewriteRelativeImportExtensions } from "./utilly.js";
import { buildServerFile } from "./transpile-jsx.js";

type BuildOptionsAdaptive = {
    dev?: boolean;
    publicEnv?: Record<string, string>;
};

type BuildTreeOptions = {
    cwd: string;
    srcRoot: string;
};

type BuildMetadataOptions = {
    dev?: boolean;
};

type BuildMetadata = {
    buildId: string;
    mode: "development" | "production";
};

export async function buildApp(
    appDir: string,
    options: BuildOptionsAdaptive = {},
): Promise<void> {
    const isDev = options.dev === true;

    const srcDir = path.join(appDir, "src");
    const distDir = path.join(appDir, "dist");
    const serverDistDir = path.join(distDir, "server");
    const clientDistDir = path.join(distDir, "client");
    const tempDir = path.join(appDir, ".adaptive-temp");

    await rmWithRetries(distDir);
    await rmWithRetries(tempDir);

    await Promise.all([
        fs.mkdir(serverDistDir, { recursive: true }),
        fs.mkdir(clientDistDir, { recursive: true }),
        fs.mkdir(tempDir, { recursive: true }),
    ]);

    await buildTree(srcDir, serverDistDir, {
        cwd: appDir,
        srcRoot: srcDir,
    });

    await writeServerModulesManifest(srcDir, serverDistDir);

    await copyFileIfExists(
        path.join(appDir, "index.html"),
        path.join(clientDistDir, "index.html"),
    );

    await copyDir(path.join(appDir, "public"), clientDistDir);
    await processCssAssets(clientDistDir, appDir);

    await bundleClientEntries({
        appDir,
        srcDir,
        clientDistDir,
        tempDir,
        dev: isDev,
        define: createClientEnvDefine(
            options.publicEnv ?? getPublicEnv(),
        ),
    });


    await writeBuildMetadata(clientDistDir, { dev: isDev });

    if (!isDev) {
        await minifyStaticAssets(clientDistDir);
        await compressAssets(clientDistDir);
    }


    await rmWithRetries(tempDir);
}

export async function buildAppDev(appDir: string) {
    const srcDir = path.join(appDir, "src");
    const adaptiveDir = path.join(appDir, ".adaptivejs");
    const devRuntimeDir = path.join(adaptiveDir, "dev-runtime");
    const serverDistDir = path.join(devRuntimeDir, "server");
    const clientDistDir = path.join(devRuntimeDir, "client");
    const tempDir = path.join(appDir, ".adaptive-temp");
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const stagedDistDir = path.join(tempDir, `dev-runtime-${uniqueId}`);
    const stagedServerDistDir = path.join(stagedDistDir, "server");
    const stagedClientDistDir = path.join(stagedDistDir, "client");
    const stagedTempDir = path.join(stagedDistDir, "temp");

    await rmWithRetries(stagedDistDir);
    await Promise.all([
        fs.mkdir(stagedServerDistDir, { recursive: true }),
        fs.mkdir(stagedClientDistDir, { recursive: true }),
        fs.mkdir(stagedTempDir, { recursive: true }),
        fs.mkdir(adaptiveDir, { recursive: true }),
        fs.mkdir(tempDir, { recursive: true }),
    ]);

    try {
        await buildTree(srcDir, stagedServerDistDir, {
            cwd: appDir,
            srcRoot: srcDir,
        });

        await writeServerModulesManifest(srcDir, stagedServerDistDir);

        await copyFileIfExists(
            path.join(appDir, "index.html"),
            path.join(stagedClientDistDir, "index.html"),
        );

        await copyDir(path.join(appDir, "public"), stagedClientDistDir);
        await processCssAssets(stagedClientDistDir, appDir);

        await bundleClientEntries({
            appDir,
            srcDir,
            clientDistDir: stagedClientDistDir,
            tempDir: stagedTempDir,
            dev: true,
        });

        const metadata = await writeBuildMetadata(stagedClientDistDir, { dev: true });
        await appendDevImportVersion(stagedServerDistDir, metadata.buildId);

        await fs.mkdir(devRuntimeDir, { recursive: true });

        // Troca "quase atômica": renomeia o build antigo para um diretório de
        // backup ANTES de mover o novo build para o lugar, e só remove o backup
        // depois. Isso evita a janela em que serverDistDir/clientDistDir não
        // existem (o que fazia o roteador do dev server encontrar 0 páginas e
        // responder 404 para qualquer rota durante um rebuild em andamento).
        const backupServerDistDir = path.join(tempDir, `server-old-${uniqueId}`);
        const backupClientDistDir = path.join(tempDir, `client-old-${uniqueId}`);

        await swapDir(serverDistDir, stagedServerDistDir, backupServerDistDir);
        await swapDir(clientDistDir, stagedClientDistDir, backupClientDistDir);

        await Promise.all([
            rmWithRetries(backupServerDistDir),
            rmWithRetries(backupClientDistDir),
        ]);
    } finally {
        await rmWithRetries(stagedDistDir);
    }
}

/**
 * Substitui `targetDir` pelo conteúdo de `stagedDir` sem nunca deixar
 * `targetDir` inexistente: primeiro move o `targetDir` atual (se existir)
 * para `backupDir`, depois move `stagedDir` para `targetDir`.
 */
async function swapDir(
    targetDir: string,
    stagedDir: string,
    backupDir: string,
): Promise<void> {
    let hadPrevious = true;

    try {
        await fs.rename(targetDir, backupDir);
    } catch (error) {
        if (isErrnoCode(error, "ENOENT")) {
            hadPrevious = false;
        } else {
            throw error;
        }
    }

    try {
        await fs.rename(stagedDir, targetDir);
    } catch (error) {
        // Se a nova build não puder ser movida para o lugar, restaura o backup
        // para não deixar o dev server sem nenhuma versão funcional.
        if (hadPrevious) {
            await fs.rename(backupDir, targetDir).catch(() => {});
        }
        throw error;
    }
}

async function buildTree(
    fromDir: string,
    toDir: string,
    options: BuildTreeOptions,
): Promise<void> {
    const entries = await fs.readdir(fromDir, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        if (entry.name.endsWith('~') || entry.name.endsWith('.swp') || entry.name.startsWith('._')) {
            continue;
        }

        const sourcePath = path.join(fromDir, entry.name);
        const targetPath = path.join(toDir, entry.name);

        if (entry.isDirectory()) {
            await fs.mkdir(targetPath, { recursive: true });
            await buildTree(sourcePath, targetPath, options);
            continue;
        }

        // 2. ADICIONAR UM TRY/CATCH DE TIMING PARA GARANTIR COMPATIBILIDADE COM O WATCHER
        try {
            if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
                await buildServerFile(
                    sourcePath,
                    targetPath.replace(/\.(ts|tsx)$/, ".js"),
                    options,
                );
            } else {
                await fs.copyFile(sourcePath, targetPath);
            }
        } catch (error: any) {
            // Se o arquivo sumiu entre o readdir e a execução (clássico em watchers rápidos), ignora suavemente
            if (error.code === 'ENOENT') {
                continue;
            }
            throw error; // Se for outro erro crítico de permissão ou disco, repassa
        }
    }
}

async function rmWithRetries(
    targetPath: string,
    attempts = 6,
): Promise<void> {
    for (let i = 1; i <= attempts; i++) {
        try {
            await fs.rm(targetPath, {
                recursive: true,
                force: true,
            });
            return;
        } catch (error) {
            if (!isRetryableRmError(error) || i === attempts) {
                throw error;
            }
            await delay(i * 120);
        }
    }
}

function isRetryableRmError(error: unknown): boolean {
    return isErrnoCode(error, "EBUSY") || isErrnoCode(error, "EPERM");
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isErrnoCode(error: unknown, code: string): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === code
    );
}

async function copyFileIfExists(
    from: string,
    to: string,
): Promise<void> {
    try {
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.copyFile(from, to);
    } catch (error) {
        if (isErrnoCode(error, "ENOENT")) return;
        throw error;
    }
}

async function copyDir(from: string, to: string): Promise<void> {
    try {
        const entries = await fs.readdir(from, {
            withFileTypes: true,
        });

        for (const entry of entries) {
            const src = path.join(from, entry.name);
            const dest = path.join(to, entry.name);

            if (entry.isDirectory()) {
                await fs.mkdir(dest, { recursive: true });
                await copyDir(src, dest);
            } else {
                await fs.mkdir(path.dirname(dest), {
                    recursive: true,
                });
                await fs.copyFile(src, dest);
            }
        }
    } catch (error) {
        if (isErrnoCode(error, "ENOENT")) return;
        throw error;
    }
}

async function writeBuildMetadata(
    dir: string,
    options: BuildMetadataOptions,
): Promise<BuildMetadata> {
    const metadata: BuildMetadata = {
        buildId: `${Date.now()}`,
        mode: options.dev ? "development" : "production",
    };

    await fs.writeFile(
        path.join(dir, "build-meta.json"),
        JSON.stringify(metadata, null, 2),
    );

    return metadata;
}

async function appendDevImportVersion(dir: string, buildId: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await appendDevImportVersion(fullPath, buildId);
            continue;
        }

        if (!entry.name.endsWith(".js")) {
            continue;
        }

        const source = await fs.readFile(fullPath, "utf8");
        const next = source
            .replace(
                /(from\s+["'])(\.{1,2}\/[^"']+\.js)(["'])/g,
                (_match, start: string, specifier: string, end: string) =>
                    `${start}${appendQueryToImport(specifier, buildId)}${end}`,
            )
            .replace(
                /(import\s*\(\s*["'])(\.{1,2}\/[^"']+\.js)(["']\s*\))/g,
                (_match, start: string, specifier: string, end: string) =>
                    `${start}${appendQueryToImport(specifier, buildId)}${end}`,
            );

        if (next !== source) {
            await fs.writeFile(fullPath, next, "utf8");
        }
    }
}

function appendQueryToImport(specifier: string, buildId: string) {
    if (specifier.includes("?")) {
        return specifier;
    }

    return `${specifier}?t=${buildId}`;
}

async function minifyStaticAssets(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await minifyStaticAssets(full);
            continue;
        }

        if (!entry.name.endsWith(".css")) continue;

        const css = await fs.readFile(full, "utf8");

        const minified = css
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\s+/g, " ")
            .replace(/\s*([{}:;,])\s*/g, "$1")
            .replace(/;}/g, "}")
            .trim();

        await fs.writeFile(full, minified);
    }
}

async function compressAssets(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await compressAssets(full);
            continue;
        }

        if (!/\.(js|css|html|svg|json)$/.test(entry.name)) continue;

        let content: Buffer;

        try {
            content = await fs.readFile(full);
        } catch (error) {
            if (isErrnoCode(error, "ENOENT")) continue;
            throw error;
        }

        await fs.writeFile(`${full}.gz`, gzipSync(content));
        await fs.writeFile(
            `${full}.br`,
            brotliCompressSync(content, {
                params: {
                    [constants.BROTLI_PARAM_QUALITY]: 11,
                },
            }),
        );
    }
}

async function processCssAssets(dir: string, appDir: string): Promise<void> {
    let entries;
    try {
        entries = await fs.readdir(dir, {
            withFileTypes: true,
        });
    } catch (error) {
        if (isErrnoCode(error, "ENOENT")) return;
        throw error;
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await processCssAssets(full, appDir);
            continue;
        }

        if (!entry.name.endsWith(".css")) {
            continue;
        }

        let source: string;
        try {
            source = await fs.readFile(full, "utf8");
        } catch (error) {
            if (isErrnoCode(error, "ENOENT")) continue;
            throw error;
        }

        if (!shouldProcessWithTailwind(source)) {
            continue;
        }

        const processor = await loadTailwindCssProcessor(appDir);
        if (!processor) {
            console.warn(
                `[adaptive] Tailwind directives found in ${path.relative(appDir, full)}, but Tailwind/PostCSS are not installed in this app. CSS was copied without processing.`,
            );
            continue;
        }

        const result = await processor.process(source, {
            from: full,
            to: full,
        });

        try {
            await fs.mkdir(path.dirname(full), { recursive: true });
            await fs.writeFile(full, result.css, "utf8");
        } catch (error) {
            if (isErrnoCode(error, "ENOENT")) continue;
            throw error;
        }
    }
}

function shouldProcessWithTailwind(source: string): boolean {
    return (
        source.includes('@import "tailwindcss"') ||
        source.includes("@import 'tailwindcss'") ||
        source.includes("@tailwind") ||
        source.includes("@theme") ||
        source.includes("@utility") ||
        source.includes("@variant") ||
        source.includes("@source")
    );
}

async function loadTailwindCssProcessor(appDir: string): Promise<{
    process: (source: string, options: { from: string; to: string }) => Promise<{ css: string }>;
} | null> {
    try {
        const requireFromApp = createRequire(path.join(appDir, "package.json"));
        const postcssModulePath = requireFromApp.resolve("postcss");
        const tailwindModulePath = requireFromApp.resolve("@tailwindcss/postcss");

        const postcssModule = await import(pathToFileURL(postcssModulePath).href);
        const tailwindModule = await import(pathToFileURL(tailwindModulePath).href);

        const postcss = postcssModule.default ?? postcssModule;
        const tailwindcss = tailwindModule.default ?? tailwindModule;

        return {
            process(source, options) {
                return postcss([tailwindcss()]).process(source, options);
            },
        };
    } catch {
        return null;
    }
}
