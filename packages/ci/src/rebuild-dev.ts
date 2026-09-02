/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 *
 * Rebuild incremental otimizado para `adaptive dev`:
 * - classifica cada change
 * - server-only → transpile só os arquivos
 * - client/hydrate/dependency → rebundle client
 * - public/index.html → copy
 * - sempre regenera build-meta (live reload)
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { bundleClientEntries } from "./esm-rolldown.js";
import {AdaptiveBuildError, buildServerFile} from "./transpile-jsx.js";
import { loadAdaptiveConfig } from "./load-adaptive-config.js";
import { createClientEnvDefine, getPublicEnv } from "./env-loader.js";
import { getHydratableDirective } from "./utilly.js";
import {notifyLiveReload} from "./live-reload.js";

export type FileChange = {
    eventType: "rename" | "change";
    filePath: string;
};

export type ChangeKind =
    | "ignore"
    | "server"
    | "client"
    | "public"
    | "html"
    | "dependency"
    | "full";

export type ClassifiedChange = {
    change: FileChange;
    kind: ChangeKind;
    absolutePath: string;
};

/**
 * Filtra lixo de editor e classifica cada change.
 */
export async function classifyChanges(
    appDir: string,
    changes: FileChange[],
): Promise<ClassifiedChange[]> {
    const out: ClassifiedChange[] = [];

    for (const change of changes) {
        const normalized = change.filePath.replace(/\\/g, "/");

        if (shouldIgnorePath(normalized)) {
            continue;
        }

        const absolutePath = path.join(appDir, change.filePath);
        const kind = await classifyPath(appDir, normalized, absolutePath);

        if (kind === "ignore") continue;

        out.push({ change, kind, absolutePath });
    }

    return out;
}

function shouldIgnorePath(normalized: string): boolean {
    const base = path.posix.basename(normalized);
    if (
        base.endsWith("~") ||
        base.endsWith(".swp") ||
        base.endsWith(".swo") ||
        base.startsWith("._") ||
        base === ".DS_Store"
    ) {
        return true;
    }
    if (
        normalized.includes("/.git/") ||
        normalized.includes("/node_modules/") ||
        normalized.includes("/.adaptivejs/") ||
        normalized.includes("/.adaptive-temp/") ||
        normalized.includes("/dist/")
    ) {
        return true;
    }
    return false;
}

/*async function classifyPath(
    appDir: string,
    normalized: string,
    absolutePath: string,
): Promise<ChangeKind> {
    if (
        normalized === "index.html" ||
        normalized.endsWith("/index.html")
    ) {
        return "html";
    }

    if (/^dependency\.(ts|tsx|js|jsx)$/.test(normalized)) {
        return "dependency";
    }

    if (normalized.startsWith("public/")) {
        return "public";
    }

    if (!normalized.startsWith("src/")) {
        // adaptive.config / package.json etc → full por segurança
        if (
            normalized.startsWith("adaptive.config.") ||
            normalized === "package.json"
        ) {
            return "full";
        }
        return "ignore";
    }

    // arquivo removido: ainda pode precisar limpar server emit
    if (!existsSync(absolutePath)) {
        return "server";
    }

    if (!/\.(ts|tsx|js|jsx)$/.test(normalized)) {
        // asset em src → trata como public-like copy no server tree
        return "server";
    }

    if (normalized.endsWith(".d.ts")) {
        return "ignore";
    }

    // Client boundary?
    try {
        const source = await fs.readFile(absolutePath, "utf8");
        if (getHydratableDirective(source)) {
            return "client";
        }
        // entry client explícito no root do app já coberto; em src,
        // diretiva "client" / hydrate via getHydratableDirective
    } catch {
        return "server";
    }

    return "server";
}*/

async function classifyPath(
    appDir: string,
    normalized: string,
    absolutePath: string,
): Promise<ChangeKind> {
    // ... html / dependency / public / ignore iguais ...

    if (!normalized.startsWith("src/")) { /* ... */ }

    if (!existsSync(absolutePath)) {
        // removido: server + client por segurança
        return "client";
    }

    if (normalized.endsWith(".d.ts")) return "ignore";

    if (!/\.(ts|tsx|js|jsx)$/.test(normalized)) {
        return "server";
    }

    try {
        const source = await fs.readFile(absolutePath, "utf8");
        if (getHydratableDirective(source)) {
            return "client";
        }
    } catch {
        return "client";
    }

    // IMPORTANTE: secundários (sem diretiva) ainda entram no bundle
    // dos parents hydrate/client → no dev sempre rebundle client
    if (/\.(tsx|jsx)$/.test(normalized)) {
        return "client";
    }

    // .ts puro (actions, utils): server; se utils for importado no client,
    // no dev também vale forçar client:
    return "client"; // ou "server" se quiser otimizar só .ts
}

export type IncrementalDevResult = {
    server: boolean;
    client: boolean;
    public: boolean;
    html: boolean;
    full: boolean;
    buildId: string | null;
};

/**
 * Aplica rebuild mínimo e invalida build-meta para live reload.
 */
export async function rebuildDevIncremental(
    appDir: string,
    changes: FileChange[],
    options: {
        /** full rebuild callback (buildAppDev) */
        fullRebuild: () => Promise<void>;
    },
): Promise<IncrementalDevResult> {
    const classified = await classifyChanges(appDir, changes);

    const result: IncrementalDevResult = {
        server: false,
        client: false,
        public: false,
        html: false,
        full: false,
        buildId: null,
    };

    if (classified.length === 0) {
        return result;
    }

    // Qualquer "full" ou mistura perigosa demais → full
    if (classified.some((c) => c.kind === "full")) {
        await options.fullRebuild();
        result.full = true;
        result.buildId = await readBuildId(appDir);
        return result;
    }

    const srcDir = path.join(appDir, "src");
    const devRuntimeDir = path.join(appDir, ".adaptivejs", "dev-runtime");
    const serverDistDir = path.join(devRuntimeDir, "server");
    const clientDistDir = path.join(devRuntimeDir, "client");
    const tempDir = path.join(appDir, ".adaptive-temp");

    await fs.mkdir(serverDistDir, { recursive: true });
    await fs.mkdir(clientDistDir, { recursive: true });
    await fs.mkdir(tempDir, { recursive: true });

    const needsClient = classified.some(
        (c) => c.kind === "client" || c.kind === "dependency",
    );
    const needsServer = classified.some(
        (c) =>
            c.kind === "server" ||
            c.kind === "client" ||
            c.kind === "dependency",
    );
    const needsPublic = classified.some((c) => c.kind === "public");
    const needsHtml = classified.some((c) => c.kind === "html");

    // --- server files ---
    if (needsServer) {
        for (const item of classified) {
            if (
                item.kind !== "server" &&
                item.kind !== "client" &&
                item.kind !== "dependency"
            ) {
                continue;
            }

            const normalized = item.change.filePath.replace(/\\/g, "/");
            if (!normalized.startsWith("src/")) continue;

            const relativeSrcPath = normalized.slice("src/".length);
            if (
                relativeSrcPath.startsWith("..") ||
                path.isAbsolute(relativeSrcPath)
            ) {
                continue;
            }

            const targetPath = path.join(serverDistDir, relativeSrcPath);

            if (!existsSync(item.absolutePath)) {
                // removido
                await fs.rm(targetPath.replace(/\.(ts|tsx)$/, ".js"), {
                    force: true,
                });
                await fs.rm(
                    targetPath.replace(/\.(ts|tsx)$/, ".__client_ssr.js"),
                    { force: true },
                );
                result.server = true;
                continue;
            }

            if (/\.(ts|tsx)$/.test(item.absolutePath)) {
                try {
                    await buildServerFile(
                        item.absolutePath,
                        targetPath.replace(/\.(ts|tsx)$/, ".js"),
                        { cwd: appDir, srcRoot: srcDir },
                    );

                    result.server = true;
                } catch (error) {
                    if (error instanceof AdaptiveBuildError) {
                        for (const diagnostic of error.errors) {
                            console.error(
                                `\n❌ [AdaptiveJS] ${error.sourcePath}`,
                            );

                            console.error(`   ${diagnostic.message}`);

                            if (diagnostic.codeframe) {
                                console.error(diagnostic.codeframe);
                            }
                        }

                        // O build anterior continua válido.
                        // Não marca server como alterado.
                        continue;
                    }

                    // Erro inesperado: esse sim deve subir.
                    throw error;
                }
            } else {
                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.copyFile(item.absolutePath, targetPath);
                result.server = true;
            }
        }
    }

    // --- public assets ---
    if (needsPublic) {
        for (const item of classified) {
            if (item.kind !== "public") continue;
            const normalized = item.change.filePath.replace(/\\/g, "/");
            const rel = normalized.slice("public/".length);
            const dest = path.join(clientDistDir, rel);

            if (!existsSync(item.absolutePath)) {
                await fs.rm(dest, { force: true });
                result.public = true;
                continue;
            }

            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.copyFile(item.absolutePath, dest);
            result.public = true;
        }
    }

    // --- index.html ---
    if (needsHtml) {
        const from = path.join(appDir, "index.html");
        const to = path.join(clientDistDir, "index.html");
        if (existsSync(from)) {
            await fs.mkdir(path.dirname(to), { recursive: true });
            await fs.copyFile(from, to);
            result.html = true;
        }
    }

    // --- client bundle ---
    if (needsClient) {
        const config = await loadAdaptiveConfig(appDir);
        const stagedTemp = path.join(
            tempDir,
            `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        );
        await fs.mkdir(stagedTemp, { recursive: true });

        try {
            await bundleClientEntries({
                appDir,
                srcDir,
                clientDistDir,
                tempDir: stagedTemp,
                dev: true,
                define: createClientEnvDefine(getPublicEnv()),
                external: config.client?.external,
            });
            result.client = true;
        } finally {
            await fs.rm(stagedTemp, { recursive: true, force: true });
        }
    }

    // --- always bump meta when something changed (live reload) ---
    if (result.server || result.client || result.public || result.html) {
        const buildId = `${Date.now()}`;
        await fs.writeFile(
            path.join(clientDistDir, "build-meta.json"),
            JSON.stringify(
                { buildId, mode: "development" },
                null,
                2,
            ),
            "utf8",
        );
        result.buildId = buildId;

        // cache-bust de imports relativos no server (mesmo esquema do buildAppDev)
        if (result.server) {
            await appendDevImportVersion(serverDistDir, buildId);
        }
        notifyLiveReload(buildId);
    }

    return result;
}

async function readBuildId(appDir: string): Promise<string | null> {
    try {
        const metaPath = path.join(
            appDir,
            ".adaptivejs",
            "dev-runtime",
            "client",
            "build-meta.json",
        );
        const raw = await fs.readFile(metaPath, "utf8");
        const json = JSON.parse(raw) as { buildId?: string };
        return json.buildId ?? null;
    } catch {
        return null;
    }
}

async function appendDevImportVersion(
    dir: string,
    buildId: string,
): Promise<void> {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await appendDevImportVersion(fullPath, buildId);
            continue;
        }

        if (!entry.name.endsWith(".js")) continue;

        const source = await fs.readFile(fullPath, "utf8");
        const next = source
            .replace(
                /(from\s+["'])(\.{1,2}\/[^"']+\.js)(["'])/g,
                (_m, start: string, specifier: string, end: string) => {
                    if (specifier.includes("?")) {
                        return `${start}${specifier.replace(/\?t=[^"']*$/, `?t=${buildId}`)}${end}`;
                    }
                    return `${start}${specifier}?t=${buildId}${end}`;
                },
            )
            .replace(
                /(import\s*\(\s*["'])(\.{1,2}\/[^"']+\.js)(["']\s*\))/g,
                (_m, start: string, specifier: string, end: string) => {
                    if (specifier.includes("?")) {
                        return `${start}${specifier.replace(/\?t=[^"']*$/, `?t=${buildId}`)}${end}`;
                    }
                    return `${start}${specifier}?t=${buildId}${end}`;
                },
            );

        if (next !== source) {
            await fs.writeFile(fullPath, next, "utf8");
        }
    }
}

