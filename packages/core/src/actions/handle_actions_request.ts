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

export interface ActionRequestMeta {
    headers?: Headers | Record<string, string | string[] | undefined>;
    method?: string;
    url?: string;
}

export interface HandleActionsRequestOptions {
    moduleId: string;
    actionName: string;
    args: any[];
    isProduction: boolean;
    sourceDir: string;
    serverBuildDir: string;
    context?: any;
    request?: ActionRequestMeta;
    allowedOrigins?: string[];
}

/** Resolve origens adicionais permitidas para /_action a partir de env. */
export function resolveActionAllowedOriginsFromEnv(): string[] | undefined {
    const fromEnv = (process.env.ADAPTIVE_ACTION_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    return fromEnv.length > 0 ? fromEnv : undefined;
}

const FORBIDDEN_ACTION_NAMES = new Set([
    "constructor",
    "prototype",
    "__proto__",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString"
]);

function isValidActionName(name: string): boolean {
    if (!name || typeof name !== "string") return false;
    if (name.startsWith("_")) return false;
    if (FORBIDDEN_ACTION_NAMES.has(name)) return false;
    return true;
}

function getRequestHeader(
    headers: Headers | Record<string, string | string[] | undefined> | undefined,
    name: string
): string | null {
    if (!headers) return null;
    if (headers instanceof Headers) {
        return headers.get(name);
    }
    const val = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
    return Array.isArray(val) ? val[0] ?? null : val ?? null;
}

function normalizeOriginUrl(val: string): string | null {
    try {
        return new URL(val).origin;
    } catch {
        return null;
    }
}

function extractClientIp(
    headers?: Headers | Record<string, string | string[] | undefined>
): string {
    if (!headers) return "unknown";
    const xff = getRequestHeader(headers, "x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) return first;
    }
    const realIp = getRequestHeader(headers, "x-real-ip") ?? getRequestHeader(headers, "cf-connecting-ip");
    if (realIp) return realIp.trim();
    return "unknown";
}

interface RateLimitBucket {
    count: number;
    resetAt: number;
}
const baselineActionRateLimits = new Map<string, RateLimitBucket>();

function checkBaselineRateLimit(ip: string, max = 120, windowMs = 60_000): boolean {
    const now = Date.now();
    if (baselineActionRateLimits.size > 1000) {
        for (const [k, v] of baselineActionRateLimits) {
            if (v.resetAt <= now) baselineActionRateLimits.delete(k);
        }
    }

    const current = baselineActionRateLimits.get(ip);
    if (!current || current.resetAt <= now) {
        baselineActionRateLimits.set(ip, { count: 1, resetAt: now + windowMs });
        return true;
    }

    current.count += 1;
    return current.count <= max;
}

export async function handle_actions_request(
    options: HandleActionsRequestOptions,
): Promise<ActionResult> {
    try {
        const method = options.request?.method?.toUpperCase() ?? "POST";
        if (method !== "POST") {
            return {
                status: 405,
                body: {
                    ok: false,
                    error: "METHOD_NOT_ALLOWED",
                    message: `Method ${method} is not allowed. Only POST is accepted.`
                }
            };
        }

        const contentType = getRequestHeader(options.request?.headers, "content-type");
        if (!contentType) {
            return {
                status: 415,
                body: {
                    ok: false,
                    error: "UNSUPPORTED_MEDIA_TYPE",
                    message: "Content-Type header is required. Use application/json or multipart/form-data."
                }
            };
        }

        const lowerCt = contentType.toLowerCase();
        const isJson = lowerCt.startsWith("application/json");
        const isMultipart = lowerCt.startsWith("multipart/form-data");
        if (!isJson && !isMultipart) {
            return {
                status: 415,
                body: {
                    ok: false,
                    error: "UNSUPPORTED_MEDIA_TYPE",
                    message: "Only application/json and multipart/form-data are accepted."
                }
            };
        }

        const secFetchSite = getRequestHeader(options.request?.headers, "sec-fetch-site");
        if (secFetchSite && secFetchSite.toLowerCase() === "cross-site") {
            return {
                status: 403,
                body: {
                    ok: false,
                    error: "CROSS_SITE_ACTION_FORBIDDEN",
                    message: "Cross-site actions are prohibited."
                }
            };
        }

        const origin = getRequestHeader(options.request?.headers, "origin");
        if (origin) {
            const normOrigin = normalizeOriginUrl(origin);
            const host = getRequestHeader(options.request?.headers, "x-forwarded-host") ??
                         getRequestHeader(options.request?.headers, "host");

            let isOriginAllowed = false;
            if (normOrigin) {
                if (host) {
                    const hostClean = host.split(",")[0].trim();
                    if (normOrigin === `http://${hostClean}` || normOrigin === `https://${hostClean}`) {
                        isOriginAllowed = true;
                    }
                }
                if (!isOriginAllowed && options.allowedOrigins?.length) {
                    for (const allowed of options.allowedOrigins) {
                        if (normalizeOriginUrl(allowed) === normOrigin) {
                            isOriginAllowed = true;
                            break;
                        }
                    }
                }
            }

            if (!isOriginAllowed) {
                return {
                    status: 403,
                    body: {
                        ok: false,
                        error: "ORIGIN_NOT_ALLOWED",
                        message: "The request origin is not allowed."
                    }
                };
            }
        }

        const clientIp = extractClientIp(options.request?.headers);
        if (!checkBaselineRateLimit(clientIp)) {
            return {
                status: 429,
                body: {
                    ok: false,
                    error: "RATE_LIMIT_EXCEEDED",
                    message: "Too many requests. Please try again later."
                }
            };
        }

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

        if (!isValidActionName(actionName)) {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: "INVALID_ACTION_NAME",
                    message: `Invalid action name '${actionName}'.`
                }
            };
        }

        const moduleId = normalizeModuleId(options.moduleId);

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

        // Pass options.request inside context if not already present
        const actionContext = {
            ...options.context,
            request: options.context?.request ?? options.request
        };

        const data = await fn(...options.args, actionContext);

        return {
            status: 200,
            body: {
                ok: true,
                data,
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isNotAllowed =
            message.startsWith("Access denied") ||
            message.includes("is not registered") ||
            (message.includes("manifest") && message.includes("required"));
        const status = isNotAllowed ? 403 : 500;
        const errorType = isNotAllowed ? "MODULE_NOT_ALLOWED" : "ACTION_ERROR";

        return {
            status,
            body: {
                ok: false,
                error: errorType,
                message: options.isProduction
                    ? (isNotAllowed ? "Access denied." : "An unexpected error occurred.")
                    : message,
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
    let modulePath: string | null = null;
    const manifest = await loadServerModuleManifest(
        options.serverBuildDir,
        options.isProduction,
    );

    if (manifest && !manifest.includes(options.moduleId)) {
        throw new Error(`Server module '${options.moduleId}' is not registered.`);
    }

    if (options.isProduction) {
        const candidate = path.join(options.serverBuildDir, `${options.moduleId}.js`);
        if (await fileExists(candidate)) {
            modulePath = candidate;
        } else {
            throw new Error(`Server module '${options.moduleId}' not found in build.`);
        }
    } else {
        const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
        for (const ext of extensions) {
            const candidate = path.join(options.sourceDir, `${options.moduleId}${ext}`);
            if (await fileExists(candidate)) {
                const resolvedPath = path.resolve(candidate);
                const resolvedSrc = path.resolve(options.sourceDir);
                if (!resolvedPath.startsWith(resolvedSrc)) {
                    throw new Error("Access denied: module path traversal detected.");
                }

                if (!manifest) {
                    const rel = path.relative(resolvedSrc, resolvedPath).replace(/\\/g, "/");
                    const isActionsFolder = rel.startsWith("actions/");
                    const source = await fs.readFile(resolvedPath, "utf8");
                    const hasServerDirective = /['"](?:use )?server['"]/.test(source.slice(0, 300));

                    if (!isActionsFolder && !hasServerDirective) {
                        throw new Error(
                            `Access denied: server module '${options.moduleId}' must be under actions/ or contain a "use server" directive.`
                        );
                    }
                }

                modulePath = candidate;
                break;
            }
        }

        if (!modulePath) {
            const candidate = path.join(options.serverBuildDir, `${options.moduleId}.js`);
            if (await fileExists(candidate)) {
                modulePath = candidate;
            }
        }
    }

    if (!modulePath) {
        throw new Error(`Server module '${options.moduleId}' is not registered.`);
    }

    const moduleUrl = pathToFileURL(modulePath);

    if (!options.isProduction) {
        try {
            const stats = await fs.stat(modulePath);
            moduleUrl.searchParams.set("t", `${stats.mtimeMs}`);
        } catch {
            moduleUrl.searchParams.set("t", `${Date.now()}`);
        }
    }

    return import(moduleUrl.href);
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function loadServerModuleManifest(
    serverBuildDir: string,
    requireManifest: boolean,
): Promise<string[] | null> {
    try {
        const manifest = await fs.readFile(
            path.join(serverBuildDir, "server-modules.json"),
            "utf8",
        );

        return JSON.parse(manifest) as string[];
    } catch {
        if (requireManifest) {
            throw new Error(
                "Server modules manifest (server-modules.json) is required in production.",
            );
        }
        return null;
    }
}

function normalizeModuleId(moduleId: string) {
    const normalized = String(moduleId || "actions/index")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\.(tsx|ts|jsx|js)$/, "");

    if (normalized.includes("..")) {
        throw new Error("Access denied: invalid server module path.");
    }

    return normalized;
}