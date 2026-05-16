/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */


import path from "node:path";
import {pathToFileURL} from "node:url";
import {renderToString, renderToStringWithMetadata} from "./render-to-string.js";
import fs from "node:fs/promises";
import fg from "fast-glob";
import {AdaptiveMetadata, AdaptiveMetadataContext, AdaptiveMetadataResolver, RouteDefinition} from "./interfaces/index.js";
import {matchRouteServer, parseRoutePathServer} from "./parse.js";

export async function createRouter(
    url: string,
    routes: RouteDefinition[] = [],
    options?: {
        isProduction?: boolean;
        sourceDir?: string;
        serverBuildDir?: string;
        clientBuildDir?: string;
        freshServerModules?: boolean;
    }
) {
    const isProduction = options?.isProduction ?? process.env.NODE_ENV === "production";
    const sourceDir = options?.sourceDir || path.join(process.cwd(), "src");
    const serverBuildDir = options?.serverBuildDir || path.join(process.cwd(), "dist", "server");
    const clientBuildDir = options?.clientBuildDir || path.join(process.cwd(), "dist", "client");
    const pagesDir = isProduction ? path.join(serverBuildDir, "pages") : path.join(sourceDir, "pages");
    const pagePattern = isProduction ? "**/*.js" : "**/*.tsx";
    const clientManifest = await loadClientManifest(clientBuildDir);
    const clientAssetManifest = await loadClientAssetManifest(clientBuildDir);
    const globalClientAssets = Object.values(clientAssetManifest).filter((record) => record.global);






    if (routes.length === 0) {
        const modules = await fg(pagePattern, {
            cwd: pagesDir,
            onlyFiles: true,
            ignore: ["**/components/**", "**/forms/**", "**/_*.tsx", "**/_*.js",]
        });

        for (const relativePath of modules) {
            const absolutePath = path.join(pagesDir, relativePath);
            const mod = await importServerRouteModule(
                absolutePath,
                Boolean(options?.freshServerModules),
            );
            if (typeof mod.default !== "function") continue;
            routes.push({
                path: parseRoutePathServer(relativePath),
                component: mod.default,
                clientEntry: normalizeRouteEntryId(relativePath),
                metadata: typeof mod.generateMetadata === "function"
                    ? mod.generateMetadata
                    : mod.metadata
            });
        }
    }

    const uri = parseUrl(url);

    function normalizeRoutePath(pathname: string) {
        return pathname === "/" ? "/index" : pathname;
    }

    const pathname = normalizeRoutePath(uri.pathname);

    const routeMatch =
        resolveRoute(routes, pathname, uri.query) ??
        (pathname !== uri.pathname ? resolveRoute(routes, uri.pathname, uri.query) : null);




    if (!routeMatch) {
        return {
            html: renderToString({ tag: "div", props: {}, children: ["404 - Page not found"] }),
            params: {},
            query: {},
            clientEntries: Array.from(new Set(globalClientAssets.map((record) => record.script))),
            clientStyles: Array.from(new Set(globalClientAssets.flatMap((record) => record.styles))),
        };
    }

    const element = await routeMatch.component({
        params: routeMatch.params,
        query: uri.query
    });

// 🔥 intercepta redirect
    if (element?.__type === "redirect") {
        return element;
    }

    const rendered = renderToStringWithMetadata(element);


    const metadata = await resolveMetadata(
        routeMatch.metadata,
        {
            url,
            pathname: uri.pathname,
            params: routeMatch.params ?? {},
            query: uri.query
        }
    );




    const resolvedEntryIds = Array.from(
        new Set(
            [
                routeMatch.clientEntry,
                ...rendered.clientModuleIds,
            ].filter((entry): entry is string => Boolean(entry)),
        ),
    );

    return {
        html: rendered.html,
        params: routeMatch.params ?? {},
        query: uri.query,
        metadata,
        clientEntries: Array.from(
            new Set(
                [
                    ...globalClientAssets.map((record) => record.script),
                    ...resolvedEntryIds
                    .map((entryId) => clientManifest[entryId] ?? clientAssetManifest[entryId]?.script ?? null)
                    .filter((entry): entry is string => Boolean(entry)),
                ],
            ),
        ),
        clientStyles: Array.from(
            new Set(
                [
                    ...globalClientAssets.flatMap((record) => record.styles),
                    ...resolvedEntryIds.flatMap((entryId) => clientAssetManifest[entryId]?.styles ?? []),
                ],
            ),
        ),
    };
}

async function importServerRouteModule(absolutePath: string, fresh: boolean) {
    const moduleUrl = pathToFileURL(absolutePath);

    if (fresh) {
        const stats = await fs.stat(absolutePath);
        moduleUrl.searchParams.set("t", `${stats.mtimeMs}`);
    }

    return import(moduleUrl.href);
}

async function loadClientManifest(clientBuildDir: string) {
    try {
        const manifest = await fs.readFile(path.join(clientBuildDir, "manifest.json"), "utf8");
        return JSON.parse(manifest);
    } catch {
        return {};
    }
}

function normalizeRouteEntryId(relativePath: string) {
    return "pages/" + relativePath
        .replace(/\.(tsx|ts|jsx|js)$/, "")
        .replace(/\\/g, "/")
        .replace(/\.__client_ssr$/, "");
}

async function resolveMetadata(
    resolver: AdaptiveMetadataResolver | undefined,
    context: AdaptiveMetadataContext
): Promise<AdaptiveMetadata | null> {
    if (!resolver) {
        return null;
    }

    if (typeof resolver === "function") {
        const resolved = await resolver(context);
        return resolved ?? null;
    }

    return resolver;
}

function parseUrl(fullUrl: string) {
    const url = new URL(fullUrl, "http://adaptive.local");
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
        query[key] = value;
    }
    return {
        pathname: url.pathname,
        segments: url.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean),
        query
    };
}


function resolveRoute(routes: RouteDefinition[], pathname: string, query: Record<string, string> = {}) {
    for (const route of routes) {
        const { matched, params } = matchRouteServer(route.path, pathname);
        if (matched) {
            return {
                component: route.component,
                params,
                query,
                clientEntry: route.clientEntry,
                metadata: route.metadata
            };
        }
    }
    return null;
}

async function loadClientAssetManifest(clientBuildDir: string) {
    try {
        const manifest = await fs.readFile(path.join(clientBuildDir, "asset-manifest.json"), "utf8");
        return JSON.parse(manifest) as Record<string, { script: string; styles: string[]; global: boolean }>;
    } catch {
        return {};
    }
}
