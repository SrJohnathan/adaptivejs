import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import fg from "fast-glob";
import formidable from "formidable";
import { AdaptiveFormData } from "@adaptivejs/common";
import { renderToString, renderToStringWithMetadata } from "@adaptivejs/ft";
import { formDataToObject, normalizeFormidableFiles } from "./convertFile.js";
import { matchRouteServer, parseRoutePathServer } from "./matchRouteServer.js";
export async function init_server(options = {}) {
	const isAdaptiveDev = process.env.ADAPTIVE_DEV === "true";
	const isProduction = process.env.NODE_ENV === "production";
	const app = express();
	const requestedPort = normalizePort(options.port || process.env.PORT || 3e3);
	const base = options.base || "/";
	const assetBase = createAssetBase(base);
	const appDir = options.appDir || process.cwd();
	const sourceDir = options.sourceDir || path.join(appDir, "src");
	const serverBuildDir = options.serverBuildDir || path.join(appDir, "dist", "server");
	const clientBuildDir = options.clientBuildDir || path.join(appDir, "dist", "client");
	const templatePath = options.templatePath || (isProduction ? path.join(clientBuildDir, "index.html") : path.join(appDir, "index.html"));
	const publicDir = options.publicDir || path.join(appDir, "public");
	const staticOptions = createStaticOptions(isAdaptiveDev);
	if (isProduction && !isAdaptiveDev) {
		app.use(base, createPrecompressedMiddleware(clientBuildDir));
		app.use(assetBase, createPrecompressedMiddleware(clientBuildDir));
	}
	app.use(base, express.static(publicDir, staticOptions));
	app.use(base, express.static(clientBuildDir, staticOptions));
	app.use(assetBase, express.static(clientBuildDir, staticOptions));
	app.post("/_action/:actionName", async (req, res) => {
		await handleActionRequest(req, res, {
			isProduction,
			sourceDir,
			serverBuildDir,
			defaultModuleId: "actions/index"
		});
	});
	app.post("/_action", express.json({ limit: "10mb" }), async (req, res) => {
		await handleActionRequest(req, res, {
			isProduction,
			sourceDir,
			serverBuildDir
		});
	});
	options.plugins?.forEach((plugin) => registerPlugin(app, base, plugin));
	app.use(async (req, res) => {
		try {
			const template = await loadTemplate(templatePath);
			const url = req.originalUrl.replace(base, "") || "/";
			const renderModule = await loadRenderModule({
				isProduction,
				sourceDir,
				serverBuildDir
			});
			const render = renderModule?.default;
			const result = typeof render === "function" ? await render(url) : await createRouter(url, undefined, {
				isProduction,
				sourceDir,
				serverBuildDir,
				clientBuildDir
			});
			const uri = parseUrl(url);
			const routeContext = {
				url,
				pathname: uri.pathname,
				params: result.params ?? {},
				query: uri.query
			};
			const hydrationScript = `<script>window.__ROUTE__=${JSON.stringify(uri.pathname)};window.__PARAMS__=${JSON.stringify(result.params ?? {})};window.__QUERYS__=${JSON.stringify(result.query ?? {})}<\/script>`;
			const devReloadScript = isAdaptiveDev ? createDevReloadScript(base) : "";
			const assetVersion = await loadBuildVersion(clientBuildDir);
			const layoutMetadata = await resolveModuleMetadata(renderModule, routeContext);
			const headHtml = renderMetadataTags(mergeMetadata(layoutMetadata, result.metadata ?? null));
			const html = applyAssetVersion(injectIntoTemplate(template, result.html, `${hydrationScript}${devReloadScript}`, result.clientEntries ?? [], headHtml), assetVersion);
			if (isAdaptiveDev) {
				applyNoStoreHeaders(res);
			}
			res.type("html").send(html);
		} catch (error) {
			console.error(error);
			res.status(500).send(error?.stack || String(error));
		}
	});
	const resolvedPort = await listenWithPortFallback(app, requestedPort);
	console.log(`Adaptive SSR listening on http://localhost:${resolvedPort}`);
	return app;
}
export async function createRouter(url, routes = [], options) {
	const isProduction = options?.isProduction ?? process.env.NODE_ENV === "production";
	const sourceDir = options?.sourceDir || path.join(process.cwd(), "src");
	const serverBuildDir = options?.serverBuildDir || path.join(process.cwd(), "dist", "server");
	const clientBuildDir = options?.clientBuildDir || path.join(process.cwd(), "dist", "client");
	const pagesDir = isProduction ? path.join(serverBuildDir, "pages") : path.join(sourceDir, "pages");
	const pagePattern = isProduction ? "**/*.js" : "**/*.tsx";
	const clientManifest = await loadClientManifest(clientBuildDir);
	if (routes.length === 0) {
		const modules = await fg(pagePattern, {
			cwd: pagesDir,
			onlyFiles: true,
			ignore: [
				"**/components/**",
				"**/forms/**",
				"**/_*.tsx",
				"**/_*.js"
			]
		});
		for (const relativePath of modules) {
			const absolutePath = path.join(pagesDir, relativePath);
			const mod = await import(pathToFileURL(absolutePath).href);
			if (typeof mod.default !== "function") continue;
			routes.push({
				path: parseRoutePathServer(relativePath),
				component: mod.default,
				clientEntry: normalizeRouteEntryId(relativePath),
				metadata: typeof mod.generateMetadata === "function" ? mod.generateMetadata : mod.metadata
			});
		}
	}
	const uri = parseUrl(url);
	const pathname = uri.pathname === "/" ? "/index" : uri.pathname;
	const routeMatch = resolveRoute(routes, pathname, uri.query);
	if (!routeMatch) {
		return {
			html: renderToString({
				tag: "div",
				props: {},
				children: ["404 - Page not found"]
			}),
			params: {},
			query: {},
			clientEntries: []
		};
	}
	const rendered = renderToStringWithMetadata({
		tag: routeMatch.component,
		props: {
			params: routeMatch.params,
			querys: uri.query
		},
		children: []
	});
	const metadata = await resolveMetadata(routeMatch.metadata, {
		url,
		pathname: uri.pathname,
		params: routeMatch.params ?? {},
		query: uri.query
	});
	return {
		html: rendered.html,
		params: routeMatch.params ?? {},
		query: uri.query,
		metadata,
		clientEntries: Array.from(new Set([routeMatch.clientEntry ? clientManifest[routeMatch.clientEntry] : null, ...rendered.clientModuleIds.map((moduleId) => clientManifest[moduleId] ?? null)].filter((entry) => Boolean(entry))))
	};
}
async function handleActionRequest(req, res, options) {
	try {
		const actionRequest = await parseActionRequest(req, options.defaultModuleId);
		const actionModule = await loadActionModuleById({
			isProduction: options.isProduction,
			sourceDir: options.sourceDir,
			serverBuildDir: options.serverBuildDir,
			moduleId: actionRequest.moduleId
		});
		const fn = actionModule[actionRequest.actionName];
		if (typeof fn !== "function") {
			res.status(404).json({
				success: false,
				error: `Action '${actionRequest.actionName}' not found.`
			});
			return;
		}
		const result = await fn(...actionRequest.args);
		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error?.message ?? "Action failed."
		});
	}
}
async function parseActionRequest(req, defaultModuleId) {
	const contentType = req.headers["content-type"] || "";
	const headerModuleId = readActionHeader(req.headers["x-adaptive-module"]);
	const headerActionName = readActionHeader(req.headers["x-adaptive-action"]);
	const headerArgsMode = readActionHeader(req.headers["x-adaptive-args-mode"]);
	if (typeof contentType === "string" && contentType.includes("multipart/form-data")) {
		const form = formidable({ multiples: true });
		return await new Promise((resolve, reject) => {
			form.parse(req, async (error, fields, files) => {
				if (error) {
					reject(new Error("Failed to parse form submission."));
					return;
				}
				try {
					const normalizedFiles = await normalizeFormidableFiles(files);
					const moduleField = readActionMeta(fields.__adaptive_module ?? normalizedFiles.__adaptive_module);
					const actionField = readActionMeta(fields.__adaptive_action ?? normalizedFiles.__adaptive_action);
					delete fields.__adaptive_module;
					delete fields.__adaptive_action;
					delete normalizedFiles.__adaptive_module;
					delete normalizedFiles.__adaptive_action;
					const merged = {
						...fields,
						...normalizedFiles
					};
					const payload = normalizeIndexedStructures(formDataToObject(merged));
					const moduleId = normalizeServerModuleId(String(headerModuleId ?? moduleField ?? defaultModuleId ?? "actions/index"));
					const actionName = String(headerActionName ?? actionField ?? req.params.actionName ?? "");
					const args = headerArgsMode === "formdata-single" ? [createNodeFormData(fields, normalizedFiles)] : Array.isArray(payload.args) ? payload.args : payload.args !== undefined ? [payload.args] : [];
					resolve({
						moduleId,
						actionName,
						args
					});
				} catch (parseError) {
					reject(parseError);
				}
			});
		});
	}
	const body = typeof req.body === "object" && req.body !== null ? req.body : {};
	return {
		moduleId: normalizeServerModuleId(String(headerModuleId ?? body.module ?? defaultModuleId ?? "actions/index")),
		actionName: String(headerActionName ?? body.action ?? req.params.actionName ?? ""),
		args: Array.isArray(body.args) ? body.args : []
	};
}
function createNodeFormData(fields, files) {
	const formData = new FormData();
	appendFormDataEntries(formData, fields);
	appendFormDataEntries(formData, files);
	return AdaptiveFormData.fromNative(formData);
}
function appendFormDataEntries(formData, source) {
	for (const [key, value] of Object.entries(source)) {
		appendFormDataValue(formData, key, value);
	}
}
function appendFormDataValue(formData, key, value) {
	if (value == null) return;
	if (Array.isArray(value)) {
		for (const item of value) {
			appendFormDataValue(formData, key, item);
		}
		return;
	}
	if (value instanceof File) {
		formData.append(key, value, value.name);
		return;
	}
	formData.append(key, String(value));
}
async function loadActionModuleById(options) {
	const manifest = await loadServerModuleManifest(options.serverBuildDir);
	if (!manifest.includes(options.moduleId)) {
		throw new Error(`Server module '${options.moduleId}' is not registered.`);
	}
	const modulePath = options.isProduction ? path.join(options.serverBuildDir, `${options.moduleId}.js`) : path.join(options.sourceDir, `${options.moduleId}.ts`);
	return import(pathToFileURL(modulePath).href);
}
function resolveRoute(routes, pathname, query = {}) {
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
function registerPlugin(app, base, plugin) {
	const fullPath = `${base}${plugin.path}`;
	switch (plugin.method) {
		case "GET":
			app.get(fullPath, (req, res) => plugin.callback(req, res));
			break;
		case "POST":
			app.post(fullPath, (req, res) => plugin.callback(req, res));
			break;
		case "PUT":
			app.put(fullPath, (req, res) => plugin.callback(req, res));
			break;
		case "DELETE":
			app.delete(fullPath, (req, res) => plugin.callback(req, res));
			break;
		case "PATCH":
			app.patch(fullPath, (req, res) => plugin.callback(req, res));
			break;
	}
}
async function loadTemplate(templatePath) {
	try {
		return await fs.readFile(templatePath, "utf8");
	} catch {
		return "<!doctype html><html><head><!--hydration-script--></head><body><div id=\"root\"><!--app-html--></div></body></html>";
	}
}
async function loadRenderModule(options) {
	const modulePath = options.isProduction ? path.join(options.serverBuildDir, "layout.js") : path.join(options.sourceDir, "layout.ts");
	return import(pathToFileURL(modulePath).href);
}
function injectIntoTemplate(template, html, hydrationScript, clientEntries, headHtml = "") {
	const withHtml = template.includes("<!--app-html-->") ? template.replace("<!--app-html-->", html) : template.replace("</body>", `<div id="root">${html}</div></body>`);
	const withHead = headHtml ? withHtml.includes("<!--adaptive-head-->") ? withHtml.replace("<!--adaptive-head-->", headHtml) : withHtml.replace("</head>", `${headHtml}</head>`) : withHtml;
	const clientScripts = clientEntries.map((entry) => `<script type="module" src="${entry}"><\/script>`).join("");
	if (withHead.includes("<!--hydration-script-->")) {
		return withHead.replace("<!--hydration-script-->", `${hydrationScript}${clientScripts}`);
	}
	return withHead.replace("</body>", `${hydrationScript}${clientScripts}</body>`);
}
async function loadBuildVersion(clientBuildDir) {
	try {
		const metadata = await fs.readFile(path.join(clientBuildDir, "build-meta.json"), "utf8");
		const parsed = JSON.parse(metadata);
		return parsed.buildId ?? null;
	} catch {
		return null;
	}
}
function applyAssetVersion(html, assetVersion) {
	if (!assetVersion) {
		return html;
	}
	return html.replace(/\b(href|src)="(\/[^"#]*)"/g, (_match, attr, url) => {
		if (url.startsWith("//") || url.startsWith("/#") || url.startsWith("/?")) {
			return `${attr}="${url}"`;
		}
		const separator = url.includes("?") ? "&" : "?";
		return `${attr}="${url}${separator}v=${assetVersion}"`;
	});
}
function parseUrl(fullUrl) {
	const url = new URL(fullUrl, "http://adaptive.local");
	const query = {};
	for (const [key, value] of url.searchParams.entries()) {
		query[key] = value;
	}
	return {
		pathname: url.pathname,
		segments: url.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean),
		query
	};
}
async function loadClientManifest(clientBuildDir) {
	try {
		const manifest = await fs.readFile(path.join(clientBuildDir, "manifest.json"), "utf8");
		return JSON.parse(manifest);
	} catch {
		return {};
	}
}
async function loadServerModuleManifest(serverBuildDir) {
	try {
		const manifest = await fs.readFile(path.join(serverBuildDir, "server-modules.json"), "utf8");
		return JSON.parse(manifest);
	} catch {
		return ["actions/index"];
	}
}
function normalizeRouteEntryId(relativePath) {
	return relativePath.replace(/\.(tsx|ts|jsx|js)$/, "").replace(/\\/g, "/");
}
async function resolveModuleMetadata(module, context) {
	if (!module) {
		return null;
	}
	const resolver = typeof module.generateMetadata === "function" ? module.generateMetadata : module.metadata;
	return resolveMetadata(resolver, context);
}
async function resolveMetadata(resolver, context) {
	if (!resolver) {
		return null;
	}
	if (typeof resolver === "function") {
		const resolved = await resolver(context);
		return resolved ?? null;
	}
	return resolver;
}
function mergeMetadata(base, override) {
	if (!base && !override) {
		return null;
	}
	return {
		...base ?? {},
		...override ?? {},
		openGraph: {
			...base?.openGraph ?? {},
			...override?.openGraph ?? {}
		},
		twitter: {
			...base?.twitter ?? {},
			...override?.twitter ?? {}
		}
	};
}
function renderMetadataTags(metadata) {
	if (!metadata) {
		return "";
	}
	const title = metadata.title;
	const description = metadata.description;
	const image = metadata.image;
	const url = metadata.url;
	const siteName = metadata.siteName;
	const locale = metadata.locale;
	const type = metadata.type;
	const keywords = Array.isArray(metadata.keywords) ? metadata.keywords.join(", ") : metadata.keywords;
	const og = {
		title: metadata.openGraph?.title ?? title,
		description: metadata.openGraph?.description ?? description,
		image: metadata.openGraph?.image ?? image,
		url: metadata.openGraph?.url ?? url,
		type: metadata.openGraph?.type ?? type,
		siteName: metadata.openGraph?.siteName ?? siteName,
		locale: metadata.openGraph?.locale ?? locale
	};
	const twitter = {
		card: metadata.twitter?.card ?? "summary_large_image",
		title: metadata.twitter?.title ?? title,
		description: metadata.twitter?.description ?? description,
		image: metadata.twitter?.image ?? image,
		site: metadata.twitter?.site,
		creator: metadata.twitter?.creator
	};
	const tags = [
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
		twitter.creator ? `<meta name="twitter:creator" content="${escapeAttribute(twitter.creator)}" />` : ""
	];
	return tags.filter(Boolean).join("");
}
function escapeHtml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttribute(value) {
	return escapeHtml(value).replace(/"/g, "&quot;");
}
function normalizeServerModuleId(moduleId) {
	const normalized = moduleId.replace(/\\/g, "/").replace(/^\/+/, "");
	if (normalized.includes("..")) {
		throw new Error("Invalid server module path.");
	}
	return normalized.replace(/\.(tsx|ts|jsx|js)$/, "");
}
function readActionMeta(value) {
	if (Array.isArray(value)) {
		return readActionMeta(value[0]);
	}
	if (value instanceof File) {
		return value.name;
	}
	return value;
}
function readActionHeader(value) {
	return Array.isArray(value) ? value[0] : value;
}
function normalizeIndexedStructures(value) {
	if (Array.isArray(value)) {
		return value.map((item) => normalizeIndexedStructures(item));
	}
	if (!value || typeof value !== "object" || value instanceof File) {
		return value;
	}
	const keys = Object.keys(value);
	const isIndexedObject = keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
	if (isIndexedObject) {
		return keys.sort((a, b) => Number(a) - Number(b)).map((key) => normalizeIndexedStructures(value[key]));
	}
	const output = {};
	for (const [key, nested] of Object.entries(value)) {
		output[key] = normalizeIndexedStructures(nested);
	}
	return output;
}
function createPrecompressedMiddleware(rootDir) {
	return async (req, res, next) => {
		if (!req.path || req.path === "/") {
			next();
			return;
		}
		const absolutePath = path.join(rootDir, req.path.replace(/^\/+/, ""));
		const accepted = req.headers["accept-encoding"] || "";
		const prefersBrotli = typeof accepted === "string" && accepted.includes("br");
		const prefersGzip = typeof accepted === "string" && accepted.includes("gzip");
		const candidate = prefersBrotli ? `${absolutePath}.br` : prefersGzip ? `${absolutePath}.gz` : null;
		if (!candidate) {
			next();
			return;
		}
		try {
			await fs.access(candidate);
			res.setHeader("Vary", "Accept-Encoding");
			res.type(absolutePath);
			res.setHeader("Content-Encoding", prefersBrotli ? "br" : "gzip");
			res.sendFile(candidate);
		} catch {
			next();
		}
	};
}
function createDevReloadScript(base) {
	const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
	const buildMetaPath = `${normalizedBase || ""}/build-meta.json`;
	return `<script>
  (function () {
    const metaUrl = ${JSON.stringify(buildMetaPath)};
    let currentBuildId = null;
    const poll = async () => {
      try {
        const response = await fetch(metaUrl + "?t=" + Date.now(), { cache: "no-store" });
        if (!response.ok) return;
        const meta = await response.json();
        if (!currentBuildId) {
          currentBuildId = meta.buildId;
          return;
        }
        if (meta.buildId !== currentBuildId) {
          window.location.reload();
        }
      } catch {
        // Ignore dev reload polling failures.
      }
    };
    poll();
    setInterval(poll, 1000);
  })();
  <\/script>`;
}
function createStaticOptions(isAdaptiveDev) {
	return {
		index: false,
		etag: !isAdaptiveDev,
		lastModified: !isAdaptiveDev,
		setHeaders(res) {
			if (isAdaptiveDev) {
				applyNoStoreHeaders(res);
			}
		}
	};
}
function createAssetBase(base) {
	const normalizedBase = base === "/" ? "" : base.replace(/\/+$/, "");
	return `${normalizedBase}/_adaptive`;
}
function applyNoStoreHeaders(res) {
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
	res.setHeader("Pragma", "no-cache");
	res.setHeader("Expires", "0");
	res.setHeader("Surrogate-Control", "no-store");
}
function normalizePort(value) {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 3e3;
}
async function listenWithPortFallback(app, startPort) {
	let port = startPort;
	while (true) {
		const resolvedPort = await tryListen(app, port);
		if (resolvedPort !== null) {
			return resolvedPort;
		}
		port += 1;
	}
}
async function tryListen(app, port) {
	return await new Promise((resolve, reject) => {
		const server = app.listen(port);
		server.once("listening", () => {
			resolve(port);
		});
		server.once("error", (error) => {
			server.close();
			if (error.code === "EADDRINUSE" || error.code === "EACCES") {
				resolve(null);
				return;
			}
			reject(error);
		});
	});
}

//# sourceMappingURL=serve.js.map
