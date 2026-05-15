/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type ActionResult<T = unknown> =
    | {
    status: number;
    body: {
        ok: true;
        data: T;
    };
}
    | {
    status: number;
    body: {
        ok: false;
        error: string;
        message?: string;
    };
};

export interface HandleActionsRequestOptions {
    moduleId: string;
    actionName: string;
    args: any[];
    isProduction: boolean;
    sourceDir: string;
    serverBuildDir: string;
    context?: any;
}

export async function handle_actions_request(
    options: HandleActionsRequestOptions,
): Promise<ActionResult> {
    try {
        const moduleId = normalizeModuleId(options.moduleId);
        const actionName = String(options.actionName ?? "");

        if (!actionName) {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: "ACTION_NAME_REQUIRED",
                },
            };
        }

        const actionModule = await loadActionModuleById({
            ...options,
            moduleId,
        });

        const fn = actionModule[actionName];

        if (typeof fn !== "function") {
            return {
                status: 404,
                body: {
                    ok: false,
                    error: "ACTION_NOT_FOUND",
                    message: `Action '${actionName}' not found.`,
                },
            };
        }

        const data = await fn(...options.args, options.context);

        return {
            status: 200,
            body: {
                ok: true,
                data,
            },
        };
    } catch (error) {
        return {
            status: 500,
            body: {
                ok: false,
                error: "ACTION_ERROR",
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

async function loadActionModuleById(options: {
    isProduction: boolean;
    sourceDir: string;
    serverBuildDir: string;
    moduleId: string;
}) {
    const manifest = await loadServerModuleManifest(options.serverBuildDir);

    if (!manifest.includes(options.moduleId)) {
        throw new Error(`Server module '${options.moduleId}' is not registered.`);
    }

    const modulePath = options.isProduction
        ? path.join(options.serverBuildDir, `${options.moduleId}.js`)
        : path.join(options.sourceDir, `${options.moduleId}.ts`);

    return import(pathToFileURL(modulePath).href);
}

async function loadServerModuleManifest(serverBuildDir: string): Promise<string[]> {
    try {
        const manifest = await fs.readFile(
            path.join(serverBuildDir, "server-modules.json"),
            "utf8",
        );

        return JSON.parse(manifest) as string[];
    } catch {
        return ["actions/index"];
    }
}

function normalizeModuleId(moduleId: string) {
    const normalized = String(moduleId || "actions/index")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\.(tsx|ts|jsx|js)$/, "");

    if (normalized.includes("..")) {
        throw new Error("Invalid server module path.");
    }

    return normalized;
}