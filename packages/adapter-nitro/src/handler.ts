/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */


import {
  eventHandler,

  readBody,
} from "h3";
import { createRouter ,handle_actions_request } from "@adaptive-js/core";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {createReadStream, existsSync} from "node:fs";
import fs from "node:fs/promises";

const ACTION_PATH = "/_action";

const bundledServerDir = path.resolve(process.cwd(), "adaptive-runtime");
const cwdServerRuntimeDir = path.resolve(process.cwd(), "server", "adaptive-runtime");
const resolvedRuntimeRoot = resolveRuntimeRoot();

const appRoot = process.env.ADAPTIVE_APP_ROOT || resolvedRuntimeRoot;
const templatePath = path.join(resolvedRuntimeRoot, "client", "index.html");
const buildMetaPath = path.join(resolvedRuntimeRoot, "client", "build-meta.json");
const serverBuildDir = path.join(resolvedRuntimeRoot, "server");
const clientBuildDir = path.join(resolvedRuntimeRoot, "client");


async function tryServeStatic(event: any, pathname: string) {
  let filePath: string | null = null;

  if (pathname.startsWith("/_adaptive/")) {
    filePath = path.join(clientBuildDir, pathname.replace(/^\/_adaptive\//, ""));
  } else if (pathname !== "/" && !pathname.includes("..")) {
    filePath = path.join(clientBuildDir, pathname.slice(1));
  }

  if (!filePath) return null;

  try {
    await fs.access(filePath);
    event.node.res.setHeader("content-type", getContentType(filePath));
    setNoStoreHeaders(event.node.res);
    return createReadStream(filePath);
  } catch {
    return null;
  }
}

function getContentType(filePath: string) {
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}


export default eventHandler(async (event) => {
  const url = event.path || "/";
  const pathname = parseUrl(url).pathname;

  const staticResponse = await tryServeStatic(event, pathname);
  if (staticResponse) return staticResponse;

  if (event.method === "POST" && pathname === ACTION_PATH) {
    return handleAction(event);
  }

  return handleSsr(event, url);
});


async function handleAction(event: any) {
  const body: any = await readBody(event);

  const result = await handle_actions_request({
    moduleId: body?.module ?? "actions/index",
    actionName: String(body?.action ?? ""),
    args: Array.isArray(body?.args)
        ? body.args
        : body?.input !== undefined
            ? [body.input]
            : [],
    isProduction: true,
    sourceDir: appRoot,
    serverBuildDir,
    context: {
      event,
      appDir: appRoot,
      serverBuildDir,
      clientBuildDir,
    },
  });

  event.res.status = result.status;
  return result.body;
}

async function handleSsr(event: any, url: string) {

  const result = await createRouter(url, [], {
    isProduction: true,
    sourceDir: appRoot,
    serverBuildDir,
    clientBuildDir,
  });




  if (result?.__type === "redirect") {
    event.node.res.statusCode = result.status ?? 302;
    event.node.res.setHeader("Location", result.location);
    return;
  }

  const uri = parseUrl(url);
  const template = await loadTemplate(templatePath);
  const assetVersion = await loadBuildVersion(buildMetaPath);
 // const renderModule = await loadRenderModule(serverBuildDir);

 /* const routeContext = {
    url,
    pathname: uri.pathname,
    params: result.params ?? {},
    query: uri.query,
  };

  const layoutMetadata = await resolveModuleMetadata(renderModule, routeContext);
  const headHtml = renderMetadataTags(
      mergeMetadata(layoutMetadata, result.metadata ?? null),
  );*/

  const headHtml = renderMetadataTags(result.metadata ?? null);

  const hydrationScript =
      `<script>` +
      `window.__ROUTE__=${JSON.stringify(uri.pathname)};` +
      `window.__PARAMS__=${JSON.stringify(result.params ?? {})};` +
      `window.__QUERYS__=${JSON.stringify(result.query ?? {})};` +
      `</script>`;

  const html = applyAssetVersion(
      injectIntoTemplate(
          template,
          result.html,
          hydrationScript,
          result.clientEntries ?? [],
          result.clientStyles ?? [],
          headHtml,
      ),
      assetVersion,
  );

  event.node.res.setHeader("content-type", "text/html; charset=utf-8");
  setNoStoreHeaders(event.node.res);
  return html;
}



function resolveRuntimeRoot() {
  const candidates = [];

  if (process.env.ADAPTIVE_RUNTIME_ROOT) {
    candidates.push(process.env.ADAPTIVE_RUNTIME_ROOT);
  }

  candidates.push(bundledServerDir, cwdServerRuntimeDir);

  try {
    candidates.push(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), "adaptive-runtime"),
    );
  } catch {}

  try {
    candidates.push(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "adaptive-runtime"),
    );
  } catch {}

  for (const candidate of candidates) {
    if (candidate && existsSync(path.join(candidate, "server", "server-modules.json"))) {
      return candidate;
    }
  }

  return process.env.ADAPTIVE_RUNTIME_ROOT || bundledServerDir;
}

async function loadTemplate(templatePath: string) {
  try {
    const fs = await import("node:fs/promises");
    return await fs.readFile(templatePath, "utf8");
  } catch {
    return `<!doctype html><html><head><!--adaptive-head--><!--hydration-script--></head><body><div id="root"><!--app-html--></div></body></html>`;
  }
}

async function loadRenderModule(serverBuildDir: string) {
  try {
    const modulePath = path.join(serverBuildDir, "layout.js");
    return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
  } catch {
    return null;
  }
}

async function loadBuildVersion(buildMetaPath: string) {
  try {
    const fs = await import("node:fs/promises");
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

function parseUrl(fullUrl: string) {
  const url = new URL(fullUrl, "http://adaptive.local");
  const query: Record<string, string> = {};

  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }

  return {
    pathname: url.pathname,
    query,
  };
}

async function resolveModuleMetadata(module: any, context: any) {
  if (!module) return null;

  const resolver =
      typeof module.generateMetadata === "function"
          ? module.generateMetadata
          : module.metadata;

  return resolveMetadata(resolver, context);
}

async function resolveMetadata(resolver: any, context: any) {
  if (!resolver) return null;

  if (typeof resolver === "function") {
    return (await resolver(context)) ?? null;
  }

  return resolver;
}

function mergeMetadata(base: any, override: any) {
  if (!base && !override) return null;

  return {
    ...(base ?? {}),
    ...(override ?? {}),
    openGraph: {
      ...(base?.openGraph ?? {}),
      ...(override?.openGraph ?? {}),
    },
    twitter: {
      ...(base?.twitter ?? {}),
      ...(override?.twitter ?? {}),
    },
  };
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
    description ? `<meta name="description" content="${escapeAttribute(description)}" />` : "",
    metadata.themeColor ? `<meta name="theme-color" content="${escapeAttribute(metadata.themeColor)}" />` : "",
    metadata.robots ? `<meta name="robots" content="${escapeAttribute(metadata.robots)}" />` : "",
    keywords ? `<meta name="keywords" content="${escapeAttribute(keywords)}" />` : "",
    metadata.canonical ? `<link rel="canonical" href="${escapeAttribute(metadata.canonical)}" />` : "",
    og.title ? `<meta property="og:title" content="${escapeAttribute(og.title)}" />` : "",
    og.description ? `<meta property="og:description" content="${escapeAttribute(og.description)}" />` : "",
    og.image ? `<meta property="og:image" content="${escapeAttribute(og.image)}" />` : "",
    og.url ? `<meta property="og:url" content="${escapeAttribute(og.url)}" />` : "",
    og.type ? `<meta property="og:type" content="${escapeAttribute(og.type)}" />` : "",
    og.siteName ? `<meta property="og:site_name" content="${escapeAttribute(og.siteName)}" />` : "",
    og.locale ? `<meta property="og:locale" content="${escapeAttribute(og.locale)}" />` : "",
    twitter.card ? `<meta name="twitter:card" content="${escapeAttribute(twitter.card)}" />` : "",
    twitter.title ? `<meta name="twitter:title" content="${escapeAttribute(twitter.title)}" />` : "",
    twitter.description ? `<meta name="twitter:description" content="${escapeAttribute(twitter.description)}" />` : "",
    twitter.image ? `<meta name="twitter:image" content="${escapeAttribute(twitter.image)}" />` : "",
    twitter.site ? `<meta name="twitter:site" content="${escapeAttribute(twitter.site)}" />` : "",
    twitter.creator ? `<meta name="twitter:creator" content="${escapeAttribute(twitter.creator)}" />` : "",
  ].filter(Boolean).join("");
}

function escapeHtml(value: string) {
  return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function setNoStoreHeaders(response: {
  setHeader(name: string, value: string): void;
}) {
  response.setHeader("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  response.setHeader("pragma", "no-cache");
  response.setHeader("expires", "0");
}
