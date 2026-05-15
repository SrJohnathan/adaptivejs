/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { PreviewOptions } from "./build.js";
import { getAdaptiveAdapterDir, getAdaptiveOutputDir } from "./utilly.js";

export async function previewAdaptive(options: PreviewOptions = {}) {
    const appDir = path.resolve(options.appDir || process.cwd());
    const requestedPort = options.port || Number(process.env.PORT || 3000);
    const host = options.host || "127.0.0.1";
    const port = await findAvailablePort(host, requestedPort);

    const outputDir = getAdaptiveOutputDir(appDir);
    const staticRoot = outputDir;

    const runtimeClientRoot = path.join(
        getAdaptiveAdapterDir(appDir),
        "runtime",
        "client"
    );

    const handlerModulePath = path.join(outputDir, "server", "main.mjs");

    const previousRuntimeRoot = process.env.ADAPTIVE_RUNTIME_ROOT;
    const previousAppRoot = process.env.ADAPTIVE_APP_ROOT;

    process.env.ADAPTIVE_RUNTIME_ROOT = path.join(
        outputDir,
        "server",
        "adaptive-runtime"
    );
    process.env.ADAPTIVE_APP_ROOT = process.env.ADAPTIVE_RUNTIME_ROOT;

    const handlerModule = await import(
        `${pathToFileURL(handlerModulePath).href}?t=${Date.now()}`
        );

    restoreEnv("ADAPTIVE_RUNTIME_ROOT", previousRuntimeRoot);
    restoreEnv("ADAPTIVE_APP_ROOT", previousAppRoot);

    const server = http.createServer(async (req, res) => {
        try {
            if (await tryServeStaticFile(staticRoot, req, res)) {
                return;
            }

            if (await tryServeStaticFile(runtimeClientRoot, req, res, "/_adaptive")) {
                return;
            }

            const handler = handlerModule.default;

            if (typeof handler !== "function") {
                throw new Error("Adaptive preview handler default export is not a function.");
            }

            if (handler.length >= 2) {
                handler(req, res);
                return;
            }

            const response = await handler(toWebRequest(req, port));
            await writeWebResponse(res, response);
        } catch (error) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(error instanceof Error ? error.stack || error.message : String(error));
        }
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
        });
    });

    console.log(`Adaptive preview listening on http://${host}:${port}`);

    return server;
}

function restoreEnv(key: string, previous: string | undefined) {
    if (previous === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = previous;
    }
}

async function findAvailablePort(host: string, startPort: number) {
    let port = startPort;

    while (true) {
        const available = await new Promise<boolean>((resolve) => {
            const probe = http.createServer();

            probe.once("error", (error: NodeJS.ErrnoException) => {
                if (error.code === "EADDRINUSE" || error.code === "EACCES") {
                    resolve(false);
                    return;
                }

                resolve(false);
            });

            probe.once("listening", () => {
                probe.close(() => resolve(true));
            });

            probe.listen(port, host);
        });

        if (available) {
            return port;
        }

        port += 1;
    }
}

async function tryServeStaticFile(
    staticRoot: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    mountBase = "/"
) {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const normalizedMountBase =
        mountBase === "/" ? "/" : mountBase.replace(/\/+$/, "");

    if (
        normalizedMountBase !== "/" &&
        !pathname.startsWith(normalizedMountBase + "/")
    ) {
        return false;
    }

    const strippedPath =
        normalizedMountBase === "/"
            ? pathname
            : pathname.slice(normalizedMountBase.length);

    const normalized = strippedPath.replace(/^\/+/, "");
    const filePath = path.join(staticRoot, normalized);

    try {
        const stats = await fs.stat(filePath);

        if (!stats.isFile()) {
            return false;
        }

        res.statusCode = 200;
        res.setHeader("content-type", getContentType(filePath));
        createReadStream(filePath).pipe(res);
        return true;
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            return false;
        }

        throw error;
    }
}

function getContentType(filePath: string) {
    const extension = path.extname(filePath).toLowerCase();

    const map: Record<string, string> = {
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".ico": "image/x-icon",
        ".jpeg": "image/jpeg",
        ".jpg": "image/jpeg",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".txt": "text/plain; charset=utf-8",
        ".webp": "image/webp",
    };

    return map[extension] || "application/octet-stream";
}

async function writeWebResponse(res: http.ServerResponse, response: Response) {
    res.statusCode = response.status;

    response.headers.forEach((value, key) => {
        if (
            key.toLowerCase() === "set-cookie" &&
            "getSetCookie" in response.headers
        ) {
            const cookies = response.headers.getSetCookie();

            if (cookies.length > 0) {
                res.setHeader("set-cookie", cookies);
            }

            return;
        }

        res.setHeader(key, value);
    });

    if (!response.body) {
        res.end();
        return;
    }

    const stream = Readable.fromWeb(response.body as any);
    stream.pipe(res);
}

function toWebRequest(req: http.IncomingMessage, port: number) {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(key, item);
            }
        } else if (value != null) {
            headers.set(key, value);
        }
    }

    const init: RequestInit & { duplex?: "half" } = {
        method,
        headers,
    };

    if (method !== "GET" && method !== "HEAD") {
        init.body = Readable.toWeb(req) as any;
        init.duplex = "half";
    }

    return new Request(url, init);
}