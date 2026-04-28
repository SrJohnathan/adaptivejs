#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { buildApp } from "./build-app.mjs";
import { loadAdaptiveEnv } from "./env-loader.mjs";

let devBuildPromise = Promise.resolve();
let devBuildQueued = false;
const command = process.argv[2];
const cliArgs = process.argv.slice(3);
const parsedArgs = parseCliArgs(cliArgs);
const targetDir = parsedArgs.targetDir;

switch (command) {
  case "build":
    await prepareEnv(targetDir, "production");
    const preset = parsedArgs.preset;
    const previousAssetBase = process.env.ADAPTIVE_ASSET_BASE;

    if (preset) {
      process.env.ADAPTIVE_ASSET_BASE = "/_adaptive";
    }

    await buildApp(targetDir);

    if (preset || parsedArgs.staticBuild) {
      const { buildAdaptive } = await import("@adaptivejs/static");
      await buildAdaptive({ 
        appDir: targetDir, 
        preset: preset || "static" 
      });
    }

    if (preset) {
      if (previousAssetBase === undefined) {
        delete process.env.ADAPTIVE_ASSET_BASE;
      } else {
        process.env.ADAPTIVE_ASSET_BASE = previousAssetBase;
      }
    }
    break;
  case "dev":
    await prepareEnv(targetDir, "development");
    await runDev(targetDir);
    break;
  case "preview":
    await prepareEnv(targetDir, "production");
    await runPreview(targetDir, parsedArgs);
    break;
  case "run":
  case "start":
    await prepareEnv(targetDir, "production");
    runProduction(targetDir);
    break;
  case "desktop":
  case "desktop:build":
  case "desktop:ir":
    console.error(
      "Desktop commands are not available in the published CLI yet. Use the Adaptive monorepo for desktop experimentation.",
    );
    process.exit(1);
    break;
  default:
    console.error("Usage: adaptive <dev|build|preview|run|start> [appDir]");
    process.exit(1);
}

function parseCliArgs(args) {
  let targetDir = process.cwd();
  let preset = null;
  let staticBuild = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--preset") {
      preset = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--static") {
      staticBuild = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      targetDir = path.resolve(arg);
    }
  }

  return {
    targetDir,
    preset,
    staticBuild,
  };
}

function getAdaptiveOutputDir(appDir, preset) {
  return path.join(appDir, ".adaptivejs", "output", preset);
}

function runProduction(appDir) {
  const entryPath = path.join(appDir, "dist", "server-entry.js");
  const child = spawn(process.execPath, [entryPath], {
    cwd: appDir,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: process.env.PORT || "3000",
    },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

async function runDev(appDir) {
  await rebuildDev(appDir);

  const entryPath = path.join(appDir, "dist", "server-entry.js");
  let child = startDevServer(entryPath, appDir);

  let watchers = [];

  async function rebuildAndRestart() {
    if (child && !child.killed) {
      await stopChildProcess(child);
    }
    await rebuildDev(appDir);
    child = startDevServer(entryPath, appDir);
    child.on("exit", (code, signal) => {
      if (signal === "SIGTERM" || signal === "SIGINT") {
        return;
      }
      watchers.forEach((watcher) => watcher.close());
      process.exit(code ?? 0);
    });
  }

  watchers = watchDevInputs(appDir, rebuildAndRestart);

  const cleanup = () => {
    watchers.forEach((watcher) => watcher.close());
    if (child && !child.killed) {
      child.kill();
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGINT") {
      return;
    }
    watchers.forEach((watcher) => watcher.close());
    process.exit(code ?? 0);
  });
}

async function runPreview(appDir, args) {
  const preset = args.preset || "node";
  const port = Number(process.env.PORT || "3000");

  if (preset === "node") {
    const entryPath = path.join(
      getAdaptiveOutputDir(appDir, "node"),
      "server",
      "index.mjs",
    );
    const child = spawn(process.execPath, [entryPath], {
      cwd: appDir,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: `${port}`,
      },
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
    return;
  }

  if (preset === "netlify" || preset === "vercel") {
    const { previewAdaptive } = await import("@adaptivejs/static");
    await previewAdaptive({
      appDir,
      preset,
      port,
    });
    return;
  }

  console.error(`Unsupported preview preset: ${preset}`);
  process.exit(1);
}

async function rebuildDev(appDir) {
  if (devBuildQueued) return devBuildPromise;
  devBuildQueued = true;
  devBuildPromise = (async () => {
    try {
      await prepareEnv(appDir, "development");
      await buildApp(appDir, { dev: true });
    } finally {
      devBuildQueued = false;
    }
  })();
  return devBuildPromise;
}

function watchDevInputs(appDir, onChange) {
  const watchTargets = [
    { target: path.join(appDir, "src"), recursive: true },
    { target: path.join(appDir, "client"), recursive: true },
    { target: path.join(appDir, "public"), recursive: true },
    { target: path.join(appDir, "server.ts"), recursive: false },
    { target: path.join(appDir, "index.html"), recursive: false },
    { target: path.join(appDir, ".env"), recursive: false },
    { target: path.join(appDir, ".env.local"), recursive: false },
    { target: path.join(appDir, ".env.development"), recursive: false },
    { target: path.join(appDir, ".env.development.local"), recursive: false },
    { target: path.join(appDir, ".env.production"), recursive: false },
    { target: path.join(appDir, ".env.production.local"), recursive: false },
  ];

  const watchers = [];
  let timeout = null;

  const queueRebuild = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      onChange().catch((error) => {
        console.error("Adaptive dev rebuild failed");
        console.error(error);
      });
    }, 150);
  };

  for (const { target, recursive } of watchTargets) {
    try {
      const watcher = fs.watch(target, { recursive }, () => {
        queueRebuild();
      });
      watcher.on("error", (error) => {
        if (error && error.code !== "EPERM") {
          console.error(`Adaptive dev watcher error: ${target}`);
          console.error(error);
        }
      });
      watchers.push(watcher);
    } catch {
      // Ignore missing optional paths like app/client.
    }
  }

  return watchers;
}

function startDevServer(entryPath, appDir) {
  return spawn(process.execPath, [entryPath], {
    cwd: appDir,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      ADAPTIVE_DEV: "true",
      PORT: process.env.PORT || "3000",
    },
  });
}

function stopChildProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }

    child.once("exit", () => resolve());
    child.kill();
  });
}

async function prepareEnv(appDir, mode) {
  process.env.ADAPTIVE_ENV_MODE = mode;
  await loadAdaptiveEnv(appDir, mode);
}
