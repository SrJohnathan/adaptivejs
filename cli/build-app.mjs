import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import esbuild from "esbuild";
import { transform } from "oxc-transform";
import { createClientEnvDefine, getPublicEnv } from "./env-loader.mjs";

const resolvedWebEntry = fileURLToPath(await import.meta.resolve("@adaptivejs/web"));
const resolvedWebAppEntry = fileURLToPath(await import.meta.resolve("@adaptivejs/web/app"));

export async function buildApp(appDir, options = {}) {
  const isDev = options.dev === true;
  const srcDir = path.join(appDir, "src");
  const clientSrcDir = path.join(appDir, "client");
  const distDir = path.join(appDir, "dist");
  const serverDistDir = path.join(distDir, "server");
  const clientDistDir = path.join(distDir, "client");
  const tempDir = path.join(appDir, ".adaptive-temp");

  await rmWithRetries(distDir);
  await rmWithRetries(tempDir);
  await fs.mkdir(serverDistDir, { recursive: true });
  await fs.mkdir(clientDistDir, { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });

  await buildTree(srcDir, serverDistDir, { cwd: appDir, srcRoot: srcDir });
  await writeServerModuleManifest(srcDir, serverDistDir);
  await writePageIRArtifacts({
    srcDir,
    serverDistDir,
    distDir,
  });
  await buildFile(
    path.join(appDir, "server.ts"),
    path.join(distDir, "server-entry.js"),
    appDir,
  );
  await rewriteRelativeImportsInTree(distDir);
  await fs.copyFile(
    path.join(appDir, "index.html"),
    path.join(clientDistDir, "index.html"),
  );
  await copyDir(path.join(appDir, "public"), clientDistDir);
  await bundleClientEntries({
    appDir,
    srcDir,
    clientSrcDir,
    clientDistDir,
    tempDir,
    dev: isDev,
    define: createClientEnvDefine(options.publicEnv ?? getPublicEnv()),
  });
  await writeBuildMetadata(clientDistDir, { dev: isDev });
  if (!isDev) {
    await minifyStaticAssets(clientDistDir);
    await compressAssets(clientDistDir);
  }
  await rmWithRetries(tempDir);
}

async function rmWithRetries(targetPath, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableRmError(error) || attempt === attempts) {
        throw error;
      }
      await delay(attempt * 120);
    }
  }
}

function isRetryableRmError(error) {
  return error && (error.code === "EBUSY" || error.code === "EPERM");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildTree(fromDir, toDir, options) {
  const entries = await fs.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(targetPath, { recursive: true });
      await buildTree(sourcePath, targetPath, options);
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      await buildServerFile(
        sourcePath,
        targetPath.replace(/\.(ts|tsx)$/, ".js"),
        options,
      );
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function buildServerFile(sourcePath, outputPath, options) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const sourceText = rewriteCommonImportsForWeb(
    await fs.readFile(sourcePath, "utf8"),
  );

  if (hasClientDirective(sourceText)) {
    const moduleId = normalizeEntryId(path.relative(options.srcRoot, sourcePath));
    const ssrModulePath = outputPath.replace(/\.js$/, ".__client_ssr.js");
    await buildTransformedFile(
      sourcePath,
      ssrModulePath,
      options.cwd,
      stripClientDirective(sourceText),
    );
    await fs.writeFile(
      outputPath,
      createServerClientStub(
        sourceText,
        moduleId,
        `./${path.basename(ssrModulePath)}`,
      ),
      "utf8",
    );
    return;
  }

  await buildTransformedFile(sourcePath, outputPath, options.cwd, sourceText);
}

async function buildFile(sourcePath, outputPath, cwd) {
  const sourceText = rewriteCommonImportsForWeb(
    await fs.readFile(sourcePath, "utf8"),
  );
  await buildTransformedFile(sourcePath, outputPath, cwd, sourceText);
}

async function buildTransformedFile(sourcePath, outputPath, cwd, sourceText) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const result = transform(sourcePath, sourceText, {
    cwd,
    lang: sourcePath.endsWith(".tsx") ? "tsx" : "ts",
    sourceType: "module",
    sourcemap: true,
    target: ["es2022", "node20"],
    jsx: {
      runtime: "automatic",
      importSource: "@adaptivejs/web",
    },
    typescript: {
      rewriteImportExtensions: "rewrite",
    },
  });

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`${sourcePath}: ${error.message}`);
      if (error.codeframe) console.error(error.codeframe);
    }
    process.exit(1);
  }

  const mapPath = `${outputPath}.map`;
  const sourceMapComment = `//# sourceMappingURL=${path.basename(mapPath)}`;
  const rewrittenCode = rewriteRelativeImportExtensions(result.code, sourcePath);
  await fs.writeFile(
    outputPath,
    `${rewrittenCode}\n${sourceMapComment}\n`,
    "utf8",
  );
  if (result.map) {
    await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), "utf8");
  }
}

async function copyDir(fromDir, toDir) {
  try {
    const entries = await fs.readdir(fromDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(fromDir, entry.name);
      const targetPath = path.join(toDir, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(targetPath, { recursive: true });
        await copyDir(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
}

async function bundleClientEntries({
  appDir,
  srcDir,
  clientSrcDir,
  clientDistDir,
  tempDir,
  dev = false,
  define = {},
}) {
  const entryPoints = [];
  const entryPointIds = new Map();

  for (const { file, id } of await collectExplicitClientEntries(clientSrcDir)) {
    entryPoints.push(file);
    entryPointIds.set(path.resolve(file), id);
  }

  for (const { wrapperPath, id } of await createClientComponentWrappers({
    srcDir,
    tempDir,
  })) {
    entryPoints.push(wrapperPath);
    entryPointIds.set(path.resolve(wrapperPath), id);
  }

  if (entryPoints.length === 0) return;

  const result = await esbuild.build({
    entryPoints,
    outdir: clientDistDir,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    minify: !dev,
    sourcemap: dev ? "inline" : false,
    jsx: "automatic",
    jsxImportSource: "@adaptivejs/web",
    treeShaking: true,
    legalComments: "none",
    define,
    metafile: true,
    entryNames: "[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
    },
    plugins: [commonToWebAliasPlugin(appDir), serverOnlyProxyPlugin(srcDir)],
  });

  const manifest = {};

  for (const [outputFile, meta] of Object.entries(result.metafile.outputs)) {
    if (!meta.entryPoint) continue;
    const assetBase = process.env.ADAPTIVE_ASSET_BASE || "";
    const relativeName = path.relative(clientDistDir, outputFile).replace(/\\/g, "/");
    const publicName = joinPublicPath(assetBase, relativeName);
    const resolvedEntryPoint = path.resolve(meta.entryPoint);
    const entryId =
      entryPointIds.get(resolvedEntryPoint) ??
      normalizeEntryId(path.relative(clientSrcDir, resolvedEntryPoint));
    manifest[entryId] = publicName;
  }

  await fs.writeFile(
    path.join(clientDistDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

async function collectExplicitClientEntries(clientSrcDir) {
  try {
    const candidateFiles = await collectSourceFiles(clientSrcDir);
    const entries = [];

    for (const file of candidateFiles) {
      const source = await fs.readFile(file, "utf8");
      if (!hasClientDirective(source)) continue;
      entries.push({
        file,
        id: normalizeEntryId(path.relative(clientSrcDir, file)),
      });
    }

    return entries;
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function createClientComponentWrappers({ srcDir, tempDir }) {
  const files = await collectSourceFiles(srcDir);
  const wrappers = [];
  const wrapperDir = path.join(tempDir, "client-components");
  await fs.mkdir(wrapperDir, { recursive: true });

  for (const file of files) {
    const relativePath = path.relative(srcDir, file);
    if (
      relativePath.startsWith(`pages${path.sep}`) ||
      relativePath === "layout.ts" ||
      relativePath === "layout.tsx"
    ) {
      continue;
    }

    const source = await fs.readFile(file, "utf8");
    if (!hasClientDirective(source)) continue;

    const moduleId = normalizeEntryId(relativePath);
    const wrapperPath = path.join(
      wrapperDir,
      `${moduleId.replace(/[\\/]/g, "__")}.tsx`,
    );
    const importPath = toImportPath(path.relative(path.dirname(wrapperPath), file));
    const wrapperSource = [
      `import * as clientModule from ${JSON.stringify(importPath)};`,
      `import { hydrateClientComponents } from "@adaptivejs/ft";`,
      ``,
      `hydrateClientComponents(${JSON.stringify(moduleId)}, clientModule);`,
      `export {};`,
      ``,
    ].join("\n");

    await fs.mkdir(path.dirname(wrapperPath), { recursive: true });
    await fs.writeFile(wrapperPath, wrapperSource, "utf8");
    wrappers.push({ wrapperPath, id: moduleId });
  }

  return wrappers;
}

async function collectSourceFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }

    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function hasClientDirective(source) {
  return /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:client|use client)["']\s*;?/.test(
    source,
  );
}

function hasServerDirective(source) {
  return /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:server|use server)["']\s*;?/.test(
    source,
  );
}

function stripClientDirective(source) {
  return source.replace(
    /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*["'](?:client|use client)["']\s*;?\s*/,
    "",
  );
}

function normalizeEntryId(relativePath) {
  return relativePath.replace(/\.(ts|tsx|js|jsx)$/, "").replace(/\\/g, "/");
}

function joinPublicPath(basePath, relativePath) {
  const normalizedBase = basePath
    ? `/${basePath.replace(/^\/+|\/+$/g, "")}`
    : "";
  const normalizedRelative = relativePath.replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedRelative}`.replace(/\/{2,}/g, "/");
}

function createServerClientStub(sourceText, moduleId, ssrImportPath) {
  const { namedExports } = extractExports(sourceText);
  const lines = [
    `import * as serverModule from ${JSON.stringify(ssrImportPath)};`,
    `import { createClientComponent } from "@adaptivejs/ft";`,
    `export default createClientComponent(${JSON.stringify(moduleId)}, "default", typeof serverModule.default === "function" ? serverModule.default : undefined);`,
  ];

  for (const exportName of namedExports) {
    if (exportName === "default") continue;
    lines.push(
      `export const ${exportName} = createClientComponent(${JSON.stringify(moduleId)}, ${JSON.stringify(exportName)}, typeof serverModule[${JSON.stringify(exportName)}] === "function" ? serverModule[${JSON.stringify(exportName)}] : undefined);`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function extractExports(sourceText) {
  const exports = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sourceText))) {
      exports.add(match[1]);
    }
  }

  const listPattern = /export\s*\{([^}]+)\}/g;
  let listMatch;
  while ((listMatch = listPattern.exec(sourceText))) {
    for (const segment of listMatch[1].split(",")) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const aliasMatch = trimmed.match(
        /(?:[A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/,
      );
      exports.add(aliasMatch ? aliasMatch[1] : trimmed);
    }
  }

  return {
    namedExports: Array.from(exports),
    hasDefaultExport: /export\s+default\b/.test(sourceText),
  };
}

function toImportPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function rewriteRelativeImportExtensions(code, sourcePath = null) {
  return code
    .replace(
      /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
      (_, start, specifier, end) =>
        `${start}${ensureJsExtension(specifier, sourcePath)}${end}`,
    )
    .replace(
      /(import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
      (_, start, specifier, end) =>
        `${start}${ensureJsExtension(specifier, sourcePath)}${end}`,
    );
}

function ensureJsExtension(specifier, sourcePath = null) {
  if (/\.(js|mjs|cjs|json)$/.test(specifier)) return specifier;
  if (sourcePath) {
    const absoluteBase = path.resolve(path.dirname(sourcePath), specifier);
    if (hasModuleFile(absoluteBase)) {
      return `${specifier}.js`;
    }
    if (hasModuleIndex(absoluteBase)) {
      return `${specifier}/index.js`;
    }
  }
  return `${specifier}.js`;
}

function hasModuleFile(absoluteBase) {
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].some((extension) =>
    existsSync(`${absoluteBase}${extension}`),
  );
}

function hasModuleIndex(absoluteBase) {
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].some((extension) =>
    existsSync(path.join(absoluteBase, `index${extension}`)),
  );
}

async function rewriteRelativeImportsInTree(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await rewriteRelativeImportsInTree(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;
    const source = await fs.readFile(fullPath, "utf8");
    const rewritten = rewriteRelativeImportExtensions(source);
    if (rewritten !== source) {
      await fs.writeFile(fullPath, rewritten, "utf8");
    }
  }
}

async function minifyStaticAssets(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await minifyStaticAssets(fullPath);
      continue;
    }
    if (entry.name.endsWith(".css")) {
      const css = await fs.readFile(fullPath, "utf8");
      const minified = css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .replace(/\s*([{}:;,])\s*/g, "$1")
        .replace(/;}/g, "}");
      await fs.writeFile(fullPath, minified.trim(), "utf8");
    }
  }
}

async function compressAssets(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await compressAssets(fullPath);
      continue;
    }
    if (!/\.(js|css|html|svg|json)$/.test(entry.name)) continue;

    const content = await fs.readFile(fullPath);
    const gzip = gzipSync(content, { level: 9 });
    const brotli = brotliCompressSync(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
    });

    await fs.writeFile(`${fullPath}.gz`, gzip);
    await fs.writeFile(`${fullPath}.br`, brotli);
  }
}

async function writeBuildMetadata(clientDistDir, options = {}) {
  const metadata = {
    buildId: `${Date.now()}`,
    mode: options.dev ? "development" : "production",
  };

  await fs.writeFile(
    path.join(clientDistDir, "build-meta.json"),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );
}

async function writeServerModuleManifest(srcDir, serverDistDir) {
  const files = await collectSourceFiles(srcDir);
  const serverModules = [];

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    if (!hasServerDirective(source)) continue;
    serverModules.push(normalizeEntryId(path.relative(srcDir, file)));
  }

  await fs.writeFile(
    path.join(serverDistDir, "server-modules.json"),
    JSON.stringify(serverModules, null, 2),
    "utf8",
  );
}

async function writePageIRArtifacts({ srcDir, serverDistDir, distDir }) {
  const pagesDir = path.join(serverDistDir, "pages");
  const irRootDir = path.join(distDir, "ir");
  const pagesIRDir = path.join(irRootDir, "pages");
  const manifest = [];

  await fs.mkdir(pagesIRDir, { recursive: true });

  let pageFiles = [];
  try {
    pageFiles = await collectSourceFiles(pagesDir);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const coreModule = await import("@adaptivejs/core");

  for (const file of pageFiles) {
    if (!file.endsWith(".js")) continue;

    const relativePath = path.relative(pagesDir, file);
    if (/(^|[\\/])_/.test(relativePath)) continue;
    if (/(^|[\\/])(components|forms)([\\/]|$)/.test(relativePath)) continue;

    const route = normalizeIRRoute(parseRoutePathForIR(relativePath));
    const relativeSource = path
      .relative(srcDir, path.join(srcDir, "pages", relativePath))
      .replace(/\.(js|jsx)$/, ".tsx")
      .replace(/\\/g, "/");

    const pageModule = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    if (typeof pageModule.default !== "function") continue;

    let renderedTree = null;
    try {
      renderedTree = await pageModule.default({ params: {}, querys: {} });
    } catch {
      renderedTree = null;
    }

    const normalizedTree = coreModule.normalizeToIR(renderedTree, {
      resolveComponents: true,
      evaluateDynamicChildren: false,
      evaluateDynamicProps: false,
    });

    const document = coreModule.createIRPageDocument(
      route,
      relativeSource,
      normalizedTree,
    );
    const outputRelativePath = relativePath.replace(/\.js$/, ".ir.json");
    const outputPath = path.join(pagesIRDir, outputRelativePath);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(
      outputPath,
      coreModule.serializeIRPageDocument(document),
      "utf8",
    );

    manifest.push({
      route,
      source: relativeSource,
      file: `/ir/pages/${outputRelativePath.replace(/\\/g, "/")}`,
    });
  }

  await fs.writeFile(
    path.join(irRootDir, "page-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

function parseRoutePathForIR(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  let routePath = normalizedPath.replace(/\.(tsx|ts|jsx|js)$/, "");
  routePath = routePath.replace(/\/index$/, "");

  if (!routePath || routePath === "/" || routePath === "index") {
    return "/";
  }

  const segments = routePath.split("/").filter(Boolean);
  const convertedSegments = segments.map((segment) => {
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return `:${segment.slice(1, -1)}`;
    }
    return segment;
  });

  return `/${convertedSegments.join("/").toLowerCase()}`;
}

function normalizeIRRoute(route) {
  return route === "/index" ? "/" : route;
}

function serverOnlyProxyPlugin(srcDir) {
  return {
    name: "adaptive-server-only-proxy",
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        const source = await fs.readFile(args.path, "utf8");
        if (!hasServerDirective(source)) {
          return null;
        }

        return {
          contents: createClientServerProxyModule(
            source,
            normalizeEntryId(path.relative(srcDir, args.path)),
          ),
          loader: "ts",
        };
      });
    },
  };
}

function commonToWebAliasPlugin(appDir) {
  const normalizedAppDir = path.resolve(appDir);
  return {
    name: "adaptive-common-to-web-alias",
    setup(build) {
      build.onResolve({ filter: /^@adaptivejs\/common(?:\/app)?$/ }, (args) => {
        if (!shouldAliasCommonImport(args.importer, normalizedAppDir)) {
          return null;
        }

        if (args.path === "@adaptivejs/common/app") {
          return { path: resolvedWebAppEntry };
        }

        return { path: resolvedWebEntry };
      });
    },
  };
}

function shouldAliasCommonImport(importer, normalizedAppDir) {
  if (!importer) {
    return true;
  }

  const normalizedImporter = path.resolve(importer);
  if (!normalizedImporter.startsWith(normalizedAppDir + path.sep) && normalizedImporter !== normalizedAppDir) {
    return false;
  }

  if (normalizedImporter.includes(`node_modules${path.sep}`)) {
    return false;
  }

  return true;
}

function rewriteCommonImportsForWeb(sourceText) {
  return sourceText
    .replaceAll('"@adaptivejs/common/app"', '"@adaptivejs/web/app"')
    .replaceAll("'@adaptivejs/common/app'", "'@adaptivejs/web/app'")
    .replaceAll('"@adaptivejs/common"', '"@adaptivejs/web"')
    .replaceAll("'@adaptivejs/common'", "'@adaptivejs/web'");
}

function createClientServerProxyModule(sourceText, moduleId) {
  const { namedExports, hasDefaultExport } = extractExports(sourceText);
  const lines = [`import { callServerAction } from "@adaptivejs/ft";`];

  if (hasDefaultExport) {
    lines.push(
      `export default (...args) => callServerAction(${JSON.stringify(moduleId)}, "default", args);`,
    );
  }

  for (const exportName of namedExports) {
    if (exportName === "default") continue;
    lines.push(
      `export const ${exportName} = (...args) => callServerAction(${JSON.stringify(moduleId)}, ${JSON.stringify(exportName)}, args);`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

const modulePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const appDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : process.cwd();
  await buildApp(appDir);
}
