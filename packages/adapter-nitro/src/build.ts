import { createNitro, build, prepare, copyPublicAssets } from "nitropack";
import { createApp } from "vinxi";
import path from "node:path";
import fs from "node:fs/promises";

import { fileURLToPath } from "node:url";


export interface StaticOptions {
  appDir?: string;
  outputDir?: string;
}

export interface PreviewOptions {
  appDir?: string;
  port?: number;
  host?: string;
}

export async function createVinxiApp(options: StaticOptions = {}) {
  const appDir = path.resolve(options.appDir || process.cwd());




  return createApp({
    root: appDir,
    routers: [
      {
        name: "public",
        type: "static",
        dir: "./public",
      },
      {
        name: "client",
        type: "static",
        dir: "./dist/client",
        base: "/_adaptive",
      },
      {
        name: "ssr",
        type: "http",
        handler: fileURLToPath(
            new URL("./handler.js", import.meta.url)
        ).replace(/\\/g, "/"),
        target: "server",
      },
    ],
  });
}

export async function buildAdaptive(options: StaticOptions = {}) {
  process.env.ADAPTIVE_ASSET_BASE = "/_adaptive";

  const appDir = path.resolve(options.appDir || process.cwd());

  const distDir = path.join(appDir, "dist");
  const clientDir = path.join(distDir, "client");

  const outputDir =
      options.outputDir || path.join(appDir, ".adaptivejs", "output");

  const adapterDir = path.join(appDir, ".adaptivejs", "adapter");
  const nitroBuildDir = path.join(appDir, ".adaptivejs", "cache");

  const runtimeServerDir = path.join(adapterDir, "runtime", "server");
  const runtimeClientDir = path.join(adapterDir, "runtime", "client");

  const deployedServerDir = path.join(outputDir, "server");
  const deployedRuntimeRoot = path.join(deployedServerDir, "adaptive-runtime");

  console.log(`Building Adaptive runtime...`);

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.rm(adapterDir, { recursive: true, force: true });
  await fs.rm(nitroBuildDir, { recursive: true, force: true });

  await fs.mkdir(runtimeServerDir, { recursive: true });
  await fs.mkdir(runtimeClientDir, { recursive: true });

  await fs.cp(path.join(distDir, "server"), runtimeServerDir, { recursive: true });
  await fs.cp(clientDir, runtimeClientDir, { recursive: true });

  const nitro = await createNitro({
    dev: false,
    rootDir: appDir,
    srcDir: appDir,
    buildDir: nitroBuildDir,
    output: { dir: outputDir },
    compatibilityDate: "2026-04-27",

    publicAssets: [
      { baseURL: "/", dir: path.join(appDir, "public") },
      { baseURL: "/_adaptive", dir: clientDir },
    ],

    preset: "netlify", // 🔥 único

    handlers: [
      {
        route: "/**",
        handler: fileURLToPath(
            new URL("./handler.js", import.meta.url)
        ).replace(/\\/g, "/"),
      },
    ],
  });

  await prepare(nitro);
  await copyPublicAssets(nitro);
  await build(nitro);

  await fs.mkdir(deployedRuntimeRoot, { recursive: true });

  await fs.cp(runtimeServerDir, path.join(deployedRuntimeRoot, "server"), {
    recursive: true,
  });

  await fs.cp(runtimeClientDir, path.join(deployedRuntimeRoot, "client"), {
    recursive: true,
  });

  console.log(`Build complete: ${outputDir}`);
}









