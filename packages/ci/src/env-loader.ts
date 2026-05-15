/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import fs from "node:fs/promises";
import path from "node:path";

export type AdaptiveEnvMode = "development" | "production" | "test" | string;

export type PublicEnv = Record<string, string>;

export type ClientEnvDefine = Record<string, string>;

export interface LoadedAdaptiveEnv {
    mode: AdaptiveEnvMode;
    loadedFiles: string[];
    publicEnv: PublicEnv;
}

export async function loadAdaptiveEnv(
    appDir: string,
    mode: AdaptiveEnvMode,
): Promise<LoadedAdaptiveEnv> {
    const files = resolveEnvFiles(mode);
    const loadedFiles: string[] = [];

    for (const fileName of files) {
        const absolutePath = path.join(appDir, fileName);
        const parsed = await readEnvFile(absolutePath);

        if (!parsed) continue;

        for (const [key, value] of Object.entries(parsed)) {
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        }

        loadedFiles.push(absolutePath);
    }

    return {
        mode,
        loadedFiles,
        publicEnv: getPublicEnv(),
    };
}

export function getPublicEnv(
    prefix = "ADAPTIVE_PUBLIC_",
): PublicEnv {
    const output: PublicEnv = {};

    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith(prefix)) continue;
        output[key] = value ?? "";
    }

    return output;
}

export function createClientEnvDefine(
    publicEnv: PublicEnv = getPublicEnv(),
): ClientEnvDefine {
    const define: ClientEnvDefine = {
        "process.env.NODE_ENV": JSON.stringify(
            process.env.NODE_ENV ?? "production",
        ),
        "import.meta.env.MODE": JSON.stringify(
            process.env.ADAPTIVE_ENV_MODE ?? process.env.NODE_ENV ?? "production",
        ),
        "import.meta.env.DEV": JSON.stringify(
            process.env.ADAPTIVE_ENV_MODE === "development",
        ),
        "import.meta.env.PROD": JSON.stringify(
            process.env.ADAPTIVE_ENV_MODE !== "development",
        ),
    };

    for (const [key, value] of Object.entries(publicEnv)) {
        define[`process.env.${key}`] = JSON.stringify(value);
        define[`import.meta.env.${key}`] = JSON.stringify(value);
    }

    return define;
}

function resolveEnvFiles(mode: AdaptiveEnvMode): string[] {
    const modeSuffix = mode ? `.${mode}` : "";
    const files = [`.env${modeSuffix}.local`];

    if (mode !== "test") {
        files.push(".env.local");
    }

    files.push(`.env${modeSuffix}`);
    files.push(".env");

    return files;
}

async function readEnvFile(
    filePath: string,
): Promise<Record<string, string> | null> {
    try {
        const source = await fs.readFile(filePath, "utf8");
        return parseEnv(source);
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            return null;
        }

        throw error;
    }
}

function parseEnv(source: string): Record<string, string> {
    const output: Record<string, string> = {};
    const lines = source.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex === -1) continue;

        const key = trimmed.slice(0, separatorIndex).trim();

        if (!key) continue;

        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith("\"") && value.endsWith("\"")) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        value = value.replace(/\\n/g, "\n");

        output[key] = expandValue(value, output);
    }

    return output;
}

function expandValue(
    value: string,
    currentEnv: Record<string, string>,
): string {
    return value.replace(/\$([A-Z0-9_]+)/gi, (_, key: string) => {
        if (process.env[key] !== undefined) return process.env[key];
        if (currentEnv[key] !== undefined) return currentEnv[key];
        return "";
    });
}


export async function prepareEnv(appDir:any, mode:AdaptiveEnvMode) {
    process.env.ADAPTIVE_ENV_MODE = mode;
    await loadAdaptiveEnv(appDir, mode);
}