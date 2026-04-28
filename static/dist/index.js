import { createNitro, build, prepare, copyPublicAssets } from "nitropack";
import { createApp } from "vinxi";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
function getAdaptiveRoot(appDir) {
	return path.join(appDir, ".adaptivejs");
}
function getAdaptiveOutputDir(appDir, preset) {
	return path.join(getAdaptiveRoot(appDir), "output", preset);
}
function getAdaptiveAdapterDir(appDir, preset) {
	return path.join(getAdaptiveRoot(appDir), "adapters", "nitro", preset);
}
function getAdaptiveNitroCacheDir(appDir, preset) {
	return path.join(getAdaptiveRoot(appDir), "cache", "nitro", preset);
}
export async function createVinxiApp(options = {}) {
	const appDir = path.resolve(options.appDir || process.cwd());
	const requestedPreset = options.preset || "static";
	return createApp({
		root: appDir,
		routers: [
			{
				name: "public",
				type: "static",
				dir: "./public"
			},
			{
				name: "client",
				type: "static",
				dir: "./dist/client",
				base: "/_adaptive"
			},
			{
				name: "ssr",
				type: "http",
				handler: path.join(getAdaptiveAdapterDir(appDir, requestedPreset), "adaptive-handler.js"),
				target: "server"
			}
		]
	});
}
export async function buildAdaptive(options = {}) {
	process.env.ADAPTIVE_ASSET_BASE = "/_adaptive";
	const requestedPreset = options.preset || "static";
	const appDir = path.resolve(options.appDir || process.cwd());
	const adaptiveRoot = getAdaptiveRoot(appDir);
	const distDir = path.join(appDir, "dist");
	const clientDir = path.join(distDir, "client");
	const outputDir = options.outputDir || getAdaptiveOutputDir(appDir, requestedPreset);
	const adapterDir = getAdaptiveAdapterDir(appDir, requestedPreset);
	const nitroBuildDir = getAdaptiveNitroCacheDir(appDir, requestedPreset);
	const runtimeBuildDir = path.join(adapterDir, "runtime");
	const runtimeServerDir = path.join(runtimeBuildDir, "server");
	const runtimeClientDir = path.join(runtimeBuildDir, "client");
	const runtimeTemplatePath = path.join(runtimeClientDir, "index.html");
	const runtimeBuildMetaPath = path.join(runtimeClientDir, "build-meta.json");
	const deployedServerDir = path.join(outputDir, "server");
	const deployedRuntimeRoot = path.join(deployedServerDir, "adaptive-runtime");
	const deployedRuntimeServerDir = path.join(deployedRuntimeRoot, "server");
	const deployedRuntimeClientDir = path.join(deployedRuntimeRoot, "client");
	const bundledAdaptivePackagesDir = path.join(appDir, "node_modules", "@adaptivejs");
	const deployedAdaptivePackagesDir = path.join(deployedServerDir, "node_modules", "@adaptivejs");
	console.log("buildAdaptive appDir:", appDir);
	console.log("buildAdaptive distDir:", distDir);
	console.log("buildAdaptive clientDir:", clientDir);
	console.log("buildAdaptive adaptiveRoot:", adaptiveRoot);
	console.log("buildAdaptive outputDir:", outputDir);
	console.log("buildAdaptive adapterDir:", adapterDir);
	console.log("buildAdaptive nitroBuildDir:", nitroBuildDir);
	const presetMap = {
		node: "node-server",
		vercel: "vercel",
		netlify: "netlify",
		static: "static"
	};
	const mappedPreset = presetMap[requestedPreset] || requestedPreset;
	console.log(`Building Adaptive with Nitro (preset: ${mappedPreset})...`);
	await fs.rm(outputDir, {
		recursive: true,
		force: true
	});
	await fs.rm(adapterDir, {
		recursive: true,
		force: true
	});
	await fs.rm(nitroBuildDir, {
		recursive: true,
		force: true
	});
	await fs.mkdir(adapterDir, { recursive: true });
	await fs.mkdir(runtimeBuildDir, { recursive: true });
	await fs.cp(path.join(distDir, "server"), runtimeServerDir, { recursive: true });
	await fs.cp(clientDir, runtimeClientDir, { recursive: true });
	const rawHandlerPath = path.join(adapterDir, "adaptive-handler.js");
	const handlerCode = `
  import { eventHandler, setResponseHeader } from "h3";
  import { createRouter as createAdaptiveRouter } from "@adaptivejs/web/server";
  import path from "node:path";
  import { fileURLToPath, pathToFileURL } from "node:url";
  import { existsSync } from "node:fs";

const bundledServerDir = path.resolve(process.cwd(), "adaptive-runtime");
const cwdServerRuntimeDir = path.resolve(process.cwd(), "server", "adaptive-runtime");
const resolvedRuntimeRoot = resolveRuntimeRoot();
const appRoot = process.env.ADAPTIVE_APP_ROOT || resolvedRuntimeRoot;
const templatePath = path.join(resolvedRuntimeRoot, "client", "index.html");
const buildMetaPath = path.join(resolvedRuntimeRoot, "client", "build-meta.json");
const serverBuildDir = path.join(resolvedRuntimeRoot, "server");
const clientBuildDir = path.join(resolvedRuntimeRoot, "client");

function resolveRuntimeRoot() {
  const candidates = [];

  if (process.env.ADAPTIVE_RUNTIME_ROOT) {
    candidates.push(process.env.ADAPTIVE_RUNTIME_ROOT);
  }

  candidates.push(bundledServerDir, cwdServerRuntimeDir);

  try {
    candidates.push(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "adaptive-runtime"));
  } catch {}

  try {
    candidates.push(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "adaptive-runtime"));
  } catch {}

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (existsSync(path.join(candidate, "server", "server-modules.json"))) {
      return candidate;
    }
  }

  return process.env.ADAPTIVE_RUNTIME_ROOT || bundledServerDir;
}

  export default eventHandler(async (event) => {
    const url = event.path || "/";
  
    const result = await createAdaptiveRouter(url, [], {
      isProduction: true,
    appDir: appRoot,
    serverBuildDir,
    clientBuildDir,
  });

    const uri = parseUrl(url);
    const template = await loadTemplate(templatePath);
    const assetVersion = await loadBuildVersion(buildMetaPath);
    const renderModule = await loadRenderModule(serverBuildDir);
    const routeContext = {
      url,
      pathname: uri.pathname,
      params: result.params ?? {},
      query: uri.query
    };
    const layoutMetadata = await resolveModuleMetadata(renderModule, routeContext);
    const headHtml = renderMetadataTags(mergeMetadata(layoutMetadata, result.metadata ?? null));
    const hydrationScript = \`<script>window.__ROUTE__=\${JSON.stringify(uri.pathname)};window.__PARAMS__=\${JSON.stringify(result.params ?? {})};window.__QUERYS__=\${JSON.stringify(result.query ?? {})}<\/script>\`;
    const html = applyAssetVersion(
      injectIntoTemplate(template, result.html, hydrationScript, result.clientEntries ?? [], headHtml),
      assetVersion,
    );

  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");
  return html;
});

  async function loadTemplate(templatePath) {
    try {
      const fs = await import("node:fs/promises");
      return await fs.readFile(templatePath, "utf8");
    } catch {
      return "<!doctype html><html><head><!--adaptive-head--><!--hydration-script--></head><body><div id=\\"root\\"><!--app-html--></div></body></html>";
    }
  }

  async function loadRenderModule(serverBuildDir) {
    try {
      const modulePath = path.join(serverBuildDir, "layout.js");
      return import(\`\${pathToFileURL(modulePath).href}?t=\${Date.now()}\`);
    } catch {
      return null;
    }
  }

async function loadBuildVersion(buildMetaPath) {
  try {
    const fs = await import("node:fs/promises");
    const metadata = await fs.readFile(buildMetaPath, "utf8");
    const parsed = JSON.parse(metadata);
    return parsed.buildId ?? null;
  } catch {
    return null;
  }
}

  function injectIntoTemplate(template, html, hydrationScript, clientEntries, headHtml = "") {
    const withHtml = template.includes("<!--app-html-->")
      ? template.replace("<!--app-html-->", html)
      : template.replace("</body>", \`<div id="root">\${html}</div></body>\`);
    const withHead = headHtml
      ? withHtml.includes("<!--adaptive-head-->")
        ? withHtml.replace("<!--adaptive-head-->", headHtml)
        : withHtml.replace("</head>", \`\${headHtml}</head>\`)
      : withHtml;
  
    const clientScripts = clientEntries
      .map((entry) => \`<script type="module" src="\${entry}"><\/script>\`)
      .join("");
  
    if (withHead.includes("<!--hydration-script-->")) {
      return withHead.replace("<!--hydration-script-->", \`\${hydrationScript}\${clientScripts}\`);
    }
  
    return withHead.replace("</body>", \`\${hydrationScript}\${clientScripts}</body>\`);
  }

function applyAssetVersion(html, assetVersion) {
  if (!assetVersion) {
    return html;
  }

  return html.replace(/\\b(href|src)="(\\/[^"#]*)"/g, (_match, attr, url) => {
    if (
      url.startsWith("//") ||
      url.startsWith("/#") ||
      url.startsWith("/?")
    ) {
      return \`\${attr}="\${url}"\`;
    }

    const separator = url.includes("?") ? "&" : "?";
    return \`\${attr}="\${url}\${separator}v=\${assetVersion}"\`;
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
      query
    };
  }

  async function resolveModuleMetadata(module, context) {
    if (!module) {
      return null;
    }

    const resolver = typeof module.generateMetadata === "function"
      ? module.generateMetadata
      : module.metadata;

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
      ...(base ?? {}),
      ...(override ?? {}),
      openGraph: {
        ...(base?.openGraph ?? {}),
        ...(override?.openGraph ?? {})
      },
      twitter: {
        ...(base?.twitter ?? {}),
        ...(override?.twitter ?? {})
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
      title ? \`<title>\${escapeHtml(title)}</title>\` : "",
      description ? \`<meta name="description" content="\${escapeAttribute(description)}" />\` : "",
      metadata.themeColor ? \`<meta name="theme-color" content="\${escapeAttribute(metadata.themeColor)}" />\` : "",
      metadata.robots ? \`<meta name="robots" content="\${escapeAttribute(metadata.robots)}" />\` : "",
      keywords ? \`<meta name="keywords" content="\${escapeAttribute(keywords)}" />\` : "",
      metadata.canonical ? \`<link rel="canonical" href="\${escapeAttribute(metadata.canonical)}" />\` : "",
      og.title ? \`<meta property="og:title" content="\${escapeAttribute(og.title)}" />\` : "",
      og.description ? \`<meta property="og:description" content="\${escapeAttribute(og.description)}" />\` : "",
      og.image ? \`<meta property="og:image" content="\${escapeAttribute(og.image)}" />\` : "",
      og.url ? \`<meta property="og:url" content="\${escapeAttribute(og.url)}" />\` : "",
      og.type ? \`<meta property="og:type" content="\${escapeAttribute(og.type)}" />\` : "",
      og.siteName ? \`<meta property="og:site_name" content="\${escapeAttribute(og.siteName)}" />\` : "",
      og.locale ? \`<meta property="og:locale" content="\${escapeAttribute(og.locale)}" />\` : "",
      twitter.card ? \`<meta name="twitter:card" content="\${escapeAttribute(twitter.card)}" />\` : "",
      twitter.title ? \`<meta name="twitter:title" content="\${escapeAttribute(twitter.title)}" />\` : "",
      twitter.description ? \`<meta name="twitter:description" content="\${escapeAttribute(twitter.description)}" />\` : "",
      twitter.image ? \`<meta name="twitter:image" content="\${escapeAttribute(twitter.image)}" />\` : "",
      twitter.site ? \`<meta name="twitter:site" content="\${escapeAttribute(twitter.site)}" />\` : "",
      twitter.creator ? \`<meta name="twitter:creator" content="\${escapeAttribute(twitter.creator)}" />\` : ""
    ];

    return tags.filter(Boolean).join("");
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }
`;
	await fs.writeFile(rawHandlerPath, handlerCode, "utf8");
	const handlerPath = rawHandlerPath.replace(/\\/g, "/");
	const publicAssets = [{
		baseURL: "/",
		dir: path.join(appDir, "public")
	}, {
		baseURL: "/_adaptive",
		dir: clientDir
	}];
	const nitro = await createNitro({
		dev: false,
		rootDir: appDir,
		srcDir: appDir,
		buildDir: nitroBuildDir,
		publicAssets,
		compatibilityDate: "2026-04-27",
		output: { dir: outputDir },
		preset: mappedPreset,
		handlers: [{
			route: "/**",
			handler: handlerPath
		}]
	});
	await prepare(nitro);
	await copyPublicAssets(nitro);
	await build(nitro);
	await fs.mkdir(deployedRuntimeRoot, { recursive: true });
	await fs.cp(runtimeServerDir, deployedRuntimeServerDir, { recursive: true });
	await fs.cp(runtimeClientDir, deployedRuntimeClientDir, { recursive: true });
	await fs.mkdir(deployedAdaptivePackagesDir, { recursive: true });
	await copyDirContents(bundledAdaptivePackagesDir, deployedAdaptivePackagesDir, { includeTopLevel: new Set([
		"common",
		"core",
		"ft",
		"ssr",
		"ui",
		"web"
	]) });
	if (requestedPreset === "netlify" || requestedPreset === "vercel") {
		await fs.mkdir(outputDir, { recursive: true });
		await copyDirContents(path.join(appDir, "public"), outputDir, { skip: new Set(["_redirects"]) });
		await fs.mkdir(path.join(outputDir, "_adaptive"), { recursive: true });
		await fs.cp(runtimeClientDir, path.join(outputDir, "_adaptive"), { recursive: true });
	}
	if (requestedPreset === "netlify") {
		await fs.writeFile(path.join(outputDir, "_redirects"), "/* /.netlify/functions/server 200\n", "utf8");
	}
	console.log(`Build complete: ${outputDir}`);
	if (requestedPreset === "static") {
		console.warn("Warning: preset 'static' needs prerender routes to generate full static HTML. For SSR deploy, use preset 'vercel', 'netlify' or 'node'.");
	}
}
async function copyDirContents(fromDir, toDir, options = {}) {
	try {
		const entries = await fs.readdir(fromDir, { withFileTypes: true });
		const depth = options.depth ?? 0;
		for (const entry of entries) {
			if (options.skip?.has(entry.name)) {
				continue;
			}
			if (depth === 0 && options.includeTopLevel && !options.includeTopLevel.has(entry.name)) {
				continue;
			}
			const sourcePath = path.join(fromDir, entry.name);
			const targetPath = path.join(toDir, entry.name);
			if (entry.isDirectory()) {
				await fs.mkdir(targetPath, { recursive: true });
				await copyDirContents(sourcePath, targetPath, {
					...options,
					depth: depth + 1
				});
			} else {
				await fs.mkdir(path.dirname(targetPath), { recursive: true });
				await fs.copyFile(sourcePath, targetPath);
			}
		}
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}
}
/** @deprecated Use buildAdaptive instead */
export async function buildStatic(options = {}) {
	return buildAdaptive({
		...options,
		preset: "static"
	});
}
export async function previewAdaptive(options = {}) {
	const preset = options.preset || "netlify";
	const appDir = path.resolve(options.appDir || process.cwd());
	const requestedPort = options.port || Number(process.env.PORT || 3e3);
	const host = options.host || "127.0.0.1";
	const port = await findAvailablePort(host, requestedPort);
	const outputDir = getAdaptiveOutputDir(appDir, preset);
	const staticRoot = preset === "netlify" ? outputDir : path.join(appDir, "dist");
	const runtimeClientRoot = path.join(getAdaptiveAdapterDir(appDir, preset), "runtime", "client");
	const handlerModulePath = preset === "netlify" ? path.join(getAdaptiveOutputDir(appDir, "netlify"), "server", "main.mjs") : path.join(getAdaptiveOutputDir(appDir, "vercel"), "functions", "__fallback.func", "index.mjs");
	const previousRuntimeRoot = process.env.ADAPTIVE_RUNTIME_ROOT;
	const previousAppRoot = process.env.ADAPTIVE_APP_ROOT;
	if (preset === "netlify") {
		process.env.ADAPTIVE_RUNTIME_ROOT = path.join(getAdaptiveOutputDir(appDir, "netlify"), "server", "adaptive-runtime");
		process.env.ADAPTIVE_APP_ROOT = process.env.ADAPTIVE_RUNTIME_ROOT;
	}
	const handlerModule = await import(`${pathToFileURL(handlerModulePath).href}?t=${Date.now()}`);
	if (preset === "netlify") {
		if (previousRuntimeRoot === undefined) {
			delete process.env.ADAPTIVE_RUNTIME_ROOT;
		} else {
			process.env.ADAPTIVE_RUNTIME_ROOT = previousRuntimeRoot;
		}
		if (previousAppRoot === undefined) {
			delete process.env.ADAPTIVE_APP_ROOT;
		} else {
			process.env.ADAPTIVE_APP_ROOT = previousAppRoot;
		}
	}
	const server = http.createServer(async (req, res) => {
		try {
			if (await tryServeStaticFile(staticRoot, req, res)) {
				return;
			}
			if (await tryServeStaticFile(runtimeClientRoot, req, res, "/_adaptive")) {
				return;
			}
			if (preset === "netlify") {
				const response = await handlerModule.default(toWebRequest(req, port));
				await writeWebResponse(res, response);
				return;
			}
			handlerModule.default(req, res);
		} catch (error) {
			res.statusCode = 500;
			res.setHeader("content-type", "text/plain; charset=utf-8");
			res.end(error instanceof Error ? error.stack || error.message : String(error));
		}
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => {
			server.off("error", reject);
			resolve(null);
		});
	});
	console.log(`Adaptive ${preset} preview listening on http://${host}:${port}`);
	return server;
}
async function findAvailablePort(host, startPort) {
	let port = startPort;
	while (true) {
		const available = await new Promise((resolve) => {
			const probe = http.createServer();
			probe.once("error", (error) => {
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
async function tryServeStaticFile(staticRoot, req, res, mountBase = "/") {
	const requestUrl = new URL(req.url || "/", "http://localhost");
	const pathname = decodeURIComponent(requestUrl.pathname);
	const normalizedMountBase = mountBase === "/" ? "/" : mountBase.replace(/\/+$/, "");
	if (normalizedMountBase !== "/" && !pathname.startsWith(normalizedMountBase + "/")) {
		return false;
	}
	const strippedPath = normalizedMountBase === "/" ? pathname : pathname.slice(normalizedMountBase.length);
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
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}
function toWebRequest(req, port) {
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
	const init = {
		method,
		headers
	};
	if (method !== "GET" && method !== "HEAD") {
		init.body = Readable.toWeb(req);
		init.duplex = "half";
	}
	return new Request(url, init);
}
async function writeWebResponse(res, response) {
	res.statusCode = response.status;
	response.headers.forEach((value, key) => {
		if (key.toLowerCase() === "set-cookie" && "getSetCookie" in response.headers) {
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
	const stream = Readable.fromWeb(response.body);
	stream.pipe(res);
}
function getContentType(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	const map = {
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
		".webp": "image/webp"
	};
	return map[extension] || "application/octet-stream";
}

//# sourceMappingURL=index.js.map
