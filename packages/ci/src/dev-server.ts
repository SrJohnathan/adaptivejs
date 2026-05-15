/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

// dev-server.ts
import { H3, defineHandler, readBody } from "h3";
import { toNodeHandler } from "h3/node";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createRouter, handle_actions_request } from "@adaptivejs/core";
import * as http from "node:http";

const ACTION_PATH = "/_action";
const MAX_PORT_CANDIDATES = 20;

export async function startAdaptiveDevServer(appDir: string) {
    const preferredPort = Number(process.env.PORT || 3000);

    const sourceDir = path.join(appDir, "src");
    const devRuntimeDir = path.join(appDir, ".adaptivejs", "dev-runtime");
    const serverBuildDir = path.join(devRuntimeDir, "server");
    const clientBuildDir = path.join(devRuntimeDir, "client");
    const templatePath = path.join(clientBuildDir, "index.html");
    const buildMetaPath = path.join(clientBuildDir, "build-meta.json");

    const app = new H3();

    app.use(
        "/**",
        defineHandler(async (event) => {
            const pathname = event.url.pathname;
            const url = pathname + event.url.search;

            const staticResponse = await tryServeStatic(event, clientBuildDir, pathname);
            if (staticResponse) return staticResponse;

            if (event.req.method === "POST" && pathname === ACTION_PATH) {
                return handleAction(event, { appDir, sourceDir, serverBuildDir, clientBuildDir });
            }

            return handleSsr(event, url, {
                templatePath,
                buildMetaPath,
                sourceDir,
                serverBuildDir,
                clientBuildDir,
                appDir
            });
        }),
    );

    const { server, port } = await listenOnAvailablePort(
        () => http.createServer(toNodeHandler(app)),
        preferredPort,
    );

    server.on("error", (error) => {
        console.error("Adaptive dev server error", error);
    });

    console.log(`🚀 Adaptive dev server: http://localhost:${port}`);
}

async function listenOnAvailablePort(
    createServer: () => http.Server,
    preferredPort: number,
) {
    let lastError: unknown = null;

    for (let offset = 0; offset < MAX_PORT_CANDIDATES; offset += 1) {
        const port = preferredPort + offset;
        const server = createServer();

        try {
            await listen(server, port);

            if (offset > 0) {
                console.warn(`⚠️ Port ${preferredPort} occupied, using ${port} instead.`);
            }

            return { server, port };
        } catch (error: any) {
            lastError = error;
            server.close();

            if (error?.code !== "EADDRINUSE") {
                throw error;
            }
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error(`Could not find an available port starting from ${preferredPort}.`);
}

function listen(server: http.Server, port: number) {
    return new Promise<void>((resolve, reject) => {
        const onError = (error: Error & { code?: string }) => {
            server.off("listening", onListening);
            reject(error);
        };

        const onListening = () => {
            server.off("error", onError);
            resolve();
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port);
    });
}

async function tryServeStatic(event: any, clientBuildDir: string, pathname: string) {
    let filePath: string | null = null;

    if (pathname.startsWith("/_adaptive/")) {
        filePath = path.join(clientBuildDir, pathname.replace(/^\/_adaptive\//, ""));
    } else if (pathname !== "/" && !pathname.includes("..")) {
        filePath = path.join(clientBuildDir, pathname.slice(1));
    }

    if (!filePath) return null;

    try {
        await fs.access(filePath);
        event.res.headers.set("content-type", getContentType(filePath));
        setNoStoreHeaders(event.res.headers);
        return createReadStream(filePath);
    } catch {
        return null;
    }
}

async function handleAction(event: any, dirs: {
    appDir: string;
    sourceDir: string;
    serverBuildDir: string;
    clientBuildDir: string;
}) {
    const body: any = await readBody(event);

    const result = await handle_actions_request({
        moduleId: body?.module ?? "actions/index",
        actionName: String(body?.action ?? ""),
        args: Array.isArray(body?.args)
            ? body.args
            : body?.input !== undefined
                ? [body.input]
                : [],
        isProduction: false,
        sourceDir: dirs.sourceDir,
        serverBuildDir: dirs.serverBuildDir,
        context: {
            event,
            appDir: dirs.appDir,
            sourceDir: dirs.sourceDir,
            serverBuildDir: dirs.serverBuildDir,
            clientBuildDir: dirs.clientBuildDir,
        },
    });

    event.res.status = result.status;
    return result.body;
}

async function handleSsr(event: any, url: string, dirs: {
    templatePath: string;
    buildMetaPath: string;
    sourceDir: string;
    serverBuildDir: string;
    clientBuildDir: string;
    appDir: string;
}) {
    const result = await createRouter(url, [], {
        isProduction: true,
        sourceDir: dirs.sourceDir,
        serverBuildDir: dirs.serverBuildDir,
        clientBuildDir: dirs.clientBuildDir,
        freshServerModules: true,
    });

    if (result?.__type === "redirect") {
        event.res.status = result.status ?? 302;
        event.res.headers.set("location", result.location);
        return;
    }

    const uri = parseUrl(url);
    const template = await loadTemplate(dirs.templatePath);
    const assetVersion = await loadBuildVersion(dirs.buildMetaPath);

    const headHtml = renderMetadataTags(result.metadata ?? null);

    const hydrationScript =
        `<script>` +
        `window.__ROUTE__=${JSON.stringify(uri.pathname)};` +
        `window.__PARAMS__=${JSON.stringify(result.params ?? {})};` +
        `window.__QUERYS__=${JSON.stringify(result.query ?? {})};` +
        `</script>`;

    const liveReloadScript = createDevLiveReloadScript(assetVersion);

    const html = applyAssetVersion(
        injectIntoTemplate(
            template,
            result.html,
            `${hydrationScript}${liveReloadScript}`,
            result.clientEntries ?? [],
            result.clientStyles ?? [],
            headHtml,
        ),
        assetVersion,
    );

    event.res.headers.set("content-type", "text/html; charset=utf-8");
    setNoStoreHeaders(event.res.headers);
    return html;
}

async function loadTemplate(templatePath: string) {
    try {
        return await fs.readFile(templatePath, "utf8");
    } catch {
        return `<!doctype html><html><head><!--adaptive-head--><!--hydration-script--></head><body><div id="root"><!--app-html--></div></body></html>`;
    }
}

async function loadBuildVersion(buildMetaPath: string) {
    try {
        const metadata = await fs.readFile(buildMetaPath, "utf8");
        const parsed = JSON.parse(metadata);
        return parsed.buildId ?? null;
    } catch {
        return null;
    }
}

function injectIntoTemplate(
    template: string,
    html: string,
    hydrationScript: string,
    clientEntries: string[],
    clientStyles: string[],
    headHtml = "",
) {
    const withHtml = template.includes("<!--app-html-->")
        ? template.replace("<!--app-html-->", html)
        : template.replace("</body>", `<div id="root">${html}</div></body>`);

    const styleLinks = clientStyles
        .map((entry) => `<link rel="stylesheet" href="${entry}">`)
        .join("");

    const withHead = headHtml || styleLinks
        ? withHtml.includes("<!--adaptive-head-->")
            ? withHtml.replace("<!--adaptive-head-->", `${headHtml}${styleLinks}`)
            : withHtml.replace("</head>", `${headHtml}${styleLinks}</head>`)
        : withHtml;

    const clientScripts = clientEntries
        .map((entry) => `<script type="module" src="${entry}"></script>`)
        .join("");

    if (withHead.includes("<!--hydration-script-->")) {
        return withHead.replace("<!--hydration-script-->", `${hydrationScript}${clientScripts}`);
    }

    return withHead.replace("</body>", `${hydrationScript}${clientScripts}</body>`);
}

function applyAssetVersion(html: string, assetVersion: string | null) {
    if (!assetVersion) return html;

    return html.replace(/\b(href|src)="(\/[^"#]*)"/g, (_match, attr, url) => {
        if (!shouldVersionAssetUrl(url)) {
            return `${attr}="${url}"`;
        }

        const separator = url.includes("?") ? "&" : "?";
        return `${attr}="${url}${separator}v=${assetVersion}"`;
    });
}

function shouldVersionAssetUrl(url: string) {
    if (
        url.startsWith("//") ||
        url.startsWith("/#") ||
        url.startsWith("/?")
    ) {
        return false;
    }

    if (url.startsWith("/_adaptive/")) {
        return true;
    }

    return /\.[a-z0-9]+($|\?)/i.test(url);
}

function createDevLiveReloadScript(assetVersion: string | null) {
    const initialBuildId = JSON.stringify(assetVersion ?? null);

    return `<script>
(() => {
  const initialBuildId = ${initialBuildId};
  if (!initialBuildId) return;

  let disposed = false;
  let reloading = false;

  async function checkForUpdates() {
    if (disposed || reloading) return;

    try {
      const response = await fetch('/_adaptive/build-meta.json?ts=' + Date.now(), {
        cache: 'no-store',
        headers: {
          'cache-control': 'no-store'
        }
      });

      if (!response.ok) return;

      const metadata = await response.json();
      if (metadata?.buildId && metadata.buildId !== initialBuildId) {
        disposed = true;
        reloading = true;
        window.location.reload();
        window.setTimeout(() => {
          if (!document.hidden) {
            window.location.href = window.location.href;
          }
        }, 150);
      }
    } catch {}
  }

  const interval = window.setInterval(checkForUpdates, 1000);
  window.addEventListener('beforeunload', () => {
    disposed = true;
    window.clearInterval(interval);
  }, { once: true });
})();
</script>`;
}

function setNoStoreHeaders(headers: Headers) {
    headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("pragma", "no-cache");
    headers.set("expires", "0");
}

function parseUrl(fullUrl: string) {
    const url = new URL(fullUrl, "http://adaptive.local");
    const query: Record<string, string> = {};

    for (const [key, value] of url.searchParams.entries()) {
        query[key] = value;
    }

    return { pathname: url.pathname, query };
}

function renderMetadataTags(metadata: any) {
    if (!metadata) return "";

    const title = metadata.title;
    const description = metadata.description;
    const image = metadata.image;
    const url = metadata.url;
    const siteName = metadata.siteName;
    const locale = metadata.locale;
    const type = metadata.type;
    const keywords = Array.isArray(metadata.keywords)
        ? metadata.keywords.join(", ")
        : metadata.keywords;

    const og = {
        title: metadata.openGraph?.title ?? title,
        description: metadata.openGraph?.description ?? description,
        image: metadata.openGraph?.image ?? image,
        url: metadata.openGraph?.url ?? url,
        type: metadata.openGraph?.type ?? type,
        siteName: metadata.openGraph?.siteName ?? siteName,
        locale: metadata.openGraph?.locale ?? locale,
    };

    const twitter = {
        card: metadata.twitter?.card ?? "summary_large_image",
        title: metadata.twitter?.title ?? title,
        description: metadata.twitter?.description ?? description,
        image: metadata.twitter?.image ?? image,
        site: metadata.twitter?.site,
        creator: metadata.twitter?.creator,
    };

    return [
        title ? `<title>${escapeHtml(title)}</title>` : "",
        description ? `<meta name="description" content="${escapeAttr(description)}" />` : "",
        metadata.themeColor ? `<meta name="theme-color" content="${escapeAttr(metadata.themeColor)}" />` : "",
        metadata.robots ? `<meta name="robots" content="${escapeAttr(metadata.robots)}" />` : "",
        keywords ? `<meta name="keywords" content="${escapeAttr(keywords)}" />` : "",
        metadata.canonical ? `<link rel="canonical" href="${escapeAttr(metadata.canonical)}" />` : "",
        og.title ? `<meta property="og:title" content="${escapeAttr(og.title)}" />` : "",
        og.description ? `<meta property="og:description" content="${escapeAttr(og.description)}" />` : "",
        og.image ? `<meta property="og:image" content="${escapeAttr(og.image)}" />` : "",
        og.url ? `<meta property="og:url" content="${escapeAttr(og.url)}" />` : "",
        og.type ? `<meta property="og:type" content="${escapeAttr(og.type)}" />` : "",
        og.siteName ? `<meta property="og:site_name" content="${escapeAttr(og.siteName)}" />` : "",
        og.locale ? `<meta property="og:locale" content="${escapeAttr(og.locale)}" />` : "",
        twitter.card ? `<meta name="twitter:card" content="${escapeAttr(twitter.card)}" />` : "",
        twitter.title ? `<meta name="twitter:title" content="${escapeAttr(twitter.title)}" />` : "",
        twitter.description ? `<meta name="twitter:description" content="${escapeAttr(twitter.description)}" />` : "",
        twitter.image ? `<meta name="twitter:image" content="${escapeAttr(twitter.image)}" />` : "",
        twitter.site ? `<meta name="twitter:site" content="${escapeAttr(twitter.site)}" />` : "",
        twitter.creator ? `<meta name="twitter:creator" content="${escapeAttr(twitter.creator)}" />` : "",
    ].filter(Boolean).join("");
}

function escapeHtml(value: string) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(value: string) {
    return escapeHtml(value).replace(/"/g, "&quot;");
}

function getContentType(filePath: string) {
    if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
    if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
    if (filePath.endsWith(".ico")) return "image/x-icon";
    if (filePath.endsWith(".svg")) return "image/svg+xml";
    if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
    if (filePath.endsWith(".png")) return "image/png";
    return "application/octet-stream";
}
