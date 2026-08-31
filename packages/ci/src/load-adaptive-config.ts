/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 *
 * Carrega adaptive.config.{ts,mts,js,mjs,cjs} da raiz do app.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export type AdaptiveClientConfig = {
    /** Módulos que o Rolldown não deve bundlar no client. */
    external?: (string | RegExp)[];
};

export type AdaptiveConfig = {
    client?: AdaptiveClientConfig;
};

const CONFIG_FILES = [
    "adaptive.config.ts",
    "adaptive.config.mts",
    "adaptive.config.js",
    "adaptive.config.mjs",
    "adaptive.config.cjs",
] as const;

/**
 * Resolve e importa o config do app.
 * Retorna `{}` se não existir arquivo.
 */
export async function loadAdaptiveConfig(
    appDir: string,
): Promise<AdaptiveConfig> {
    const configPath = await findConfigPath(appDir);
    if (!configPath) {
        return {};
    }

    try {
        const mod = await importConfigModule(configPath);
        const raw = (mod as { default?: AdaptiveConfig }).default ?? mod;
        return normalizeConfig(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `[adaptive] Failed to load config at ${configPath}: ${message}`,
            { cause: error },
        );
    }
}

async function findConfigPath(appDir: string): Promise<string | null> {
    for (const name of CONFIG_FILES) {
        const full = path.join(appDir, name);
        try {
            await fs.access(full);
            return full;
        } catch {
            // try next
        }
    }
    return null;
}

/**
 * Import ESM/CJS/TS config.
 * - .js/.mjs/.cjs → import direto
 * - .ts/.mts → tenta jiti / tsx se existir no app ou no ci
 */
async function importConfigModule(
    configPath: string,
): Promise<Record<string, unknown>> {
    const ext = path.extname(configPath).toLowerCase();
    const href = pathToFileURL(configPath).href;

    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
        return (await import(href)) as Record<string, unknown>;
    }

    const loader = await tryCreateTsLoader(configPath);
    if (loader) {
        return (await loader(configPath)) as Record<string, unknown>;
    }

    throw new Error(
        `Cannot load TypeScript config without a TS loader. ` +
        `Install "jiti" or "tsx" in the app, or use adaptive.config.mjs instead.`,
    );
}

type TsLoader = (file: string) => Promise<unknown> | unknown;

async function tryCreateTsLoader(configPath: string): Promise<TsLoader | null> {
    const appDir = path.dirname(configPath);
    const requireFromApp = createRequire(path.join(appDir, "package.json"));
    const requireFromCi = createRequire(import.meta.url);

    // 1) jiti
    for (const req of [requireFromApp, requireFromCi]) {
        try {
            const jitiPath = req.resolve("jiti");
            const jitiMod = await import(pathToFileURL(jitiPath).href);
            const createJiti = jitiMod.createJiti ?? jitiMod.default ?? jitiMod;
            const jiti = typeof createJiti === "function"
                ? createJiti(import.meta.url)
                : createJiti;
            if (jiti) {
                return async (file: string) => {
                    const loaded =
                        typeof jiti === "function"
                            ? jiti(file)
                            : jiti.import
                                ? await jiti.import(file)
                                : null;
                    return loaded;
                };
            }
        } catch {
            // continue
        }
    }

    // 2) tsx
    try {
        const tsxPath = requireFromApp.resolve("tsx/esm/api");
        const tsx = await import(pathToFileURL(tsxPath).href);
        if (typeof tsx.register === "function") {
            tsx.register();
        }
        return async (file: string) =>
            import(pathToFileURL(file).href + `?t=${Date.now()}`);
    } catch {
        // continue
    }

    try {
        const tsxPath = requireFromCi.resolve("tsx/esm/api");
        const tsx = await import(pathToFileURL(tsxPath).href);
        if (typeof tsx.register === "function") {
            tsx.register();
        }
        return async (file: string) =>
            import(pathToFileURL(file).href + `?t=${Date.now()}`);
    } catch {
        // continue
    }

    return null;
}

function normalizeConfig(raw: unknown): AdaptiveConfig {
    if (!raw || typeof raw !== "object") {
        return {};
    }

    const input = raw as AdaptiveConfig;
    const external = input.client?.external;

    return {
        client: {
            external: normalizeExternal(external),
        },
    };
}

function normalizeExternal(
    value: unknown,
): (string | RegExp)[] | undefined {
    if (value == null) return undefined;
    if (!Array.isArray(value)) {
        throw new Error(
            `[adaptive] client.external must be an array of string | RegExp`,
        );
    }

    return value.map((item, index) => {
        if (typeof item === "string") return item;
        if (item instanceof RegExp) return item;
        if (
            item &&
            typeof item === "object" &&
            "source" in item &&
            typeof (item as { source: unknown }).source === "string"
        ) {
            const { source, flags } = item as { source: string; flags?: string };
            return new RegExp(source, flags);
        }
        throw new Error(
            `[adaptive] client.external[${index}] must be string | RegExp`,
        );
    });
}