#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { buildApp } from "./build-app.mjs";
import { buildDesktopApp } from "./desktop/build-desktop-app.mjs";
import { loadAdaptiveEnv } from "./env-loader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
let devBuildPromise = Promise.resolve();
let devBuildQueued = false;
const command = process.argv[2];

function getArgValue(name) {
    const index = process.argv.indexOf(name);
    return index !== -1 ? process.argv[index + 1] : null;
}

const preset = getArgValue("--preset");

const args = process.argv.slice(3);

const targetArg = args.find((arg, index) => {
    const previous = args[index - 1];

    if (arg.startsWith("-")) return false;
    if (previous === "--preset") return false;

    return true;
});

const targetDir = targetArg ? path.resolve(targetArg) : process.cwd();

function getAdaptiveOutputDir(appDir, preset) {
    return path.join(appDir, ".adaptivejs", "output", preset);
}




switch (command) {
    case "build":
        await prepareEnv(targetDir, "production");

        const isAdapterBuild = Boolean(preset) || process.argv.includes("--static");

        if (isAdapterBuild) {
            process.env.ADAPTIVE_ASSET_BASE = "/_adaptive";
        }

        buildFramework();
        await buildApp(targetDir);

        if (isAdapterBuild) {
            const { buildAdaptive } = await import("@adaptivejs/static");
            await buildAdaptive({
                appDir: targetDir,
                preset: preset || "static",
            });
        }

        break;
    case "dev":
        await prepareEnv(targetDir, "development");
        await runDev(targetDir);
        break;
    case "preview":
        await prepareEnv(targetDir, "production");
        await runPreview(targetDir, preset);
        break;
    case "desktop":
        await prepareEnv(targetDir, "development");
        buildFramework();
        await buildDesktopApp(targetDir, { cargo: true });
        break;
    case "desktop:build":
        await prepareEnv(targetDir, "production");
        buildFramework();
        await buildDesktopApp(targetDir, { cargo: true, release: true });
        break;
    case "desktop:ir":
        await prepareEnv(targetDir, "development");
        buildFramework();
        await buildDesktopApp(targetDir, { cargo: false });
        break;
    case "run":
    case "start":
        await prepareEnv(targetDir, "production");
        runProduction(targetDir);
        break;
    default:
        console.error(
            "Usage: adaptive <dev|build|preview|run|start|desktop|desktop:build|desktop:ir> [appDir]",
        );
        process.exit(1);
}

function buildFramework() {
    runCommand(
        npmExecutable(),
        ["run", "build", "--workspace", "@adaptivejs/static"],
        rootDir,
    );
    runCommand(
        npmExecutable(),
        ["run", "build", "--workspace", "@adaptivejs/ft"],
        rootDir,
    );
    runCommand(
        npmExecutable(),
        ["run", "build", "--workspace", "@adaptivejs/core"],
        rootDir,
    );
    runCommand(
        npmExecutable(),
        ["run", "build", "--workspace", "@adaptivejs/common"],
        rootDir,
    );
    runCommand(
        npmExecutable(),
        ["run", "build", "--workspace", "@adaptivejs/ui"],
        rootDir,
    );
    runCommand(
        npmExecutable(),
        ["run", "build", "--workspace", "@adaptivejs/ssr"],
        rootDir,
    );
    runCommand(
        npmExecutable(),
        ["run", "build", "--workspace", "@adaptivejs/web"],
        rootDir,
    );
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

async function runPreview(appDir, presetValue) {
    const resolvedPreset = presetValue || "node";
    const port = Number(process.env.PORT || "3000");

    if (resolvedPreset === "node") {
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

    if (resolvedPreset === "netlify" || resolvedPreset === "vercel") {
        const { previewAdaptive } = await import("@adaptivejs/static");
        await previewAdaptive({
            appDir,
            preset: resolvedPreset,
            port,
        });
        return;
    }

    console.error(`Unsupported preview preset: ${resolvedPreset}`);
    process.exit(1);
}

function runCommand(command, args, cwd) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        shell: true,
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function npmExecutable() {
    return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function rebuildDev(appDir) {
    if (devBuildQueued) return devBuildPromise;
    devBuildQueued = true;
    devBuildPromise = (async () => {
        try {
            await prepareEnv(appDir, "development");
            buildFramework();
            await buildApp(appDir, { dev: true });
        } finally {
            devBuildQueued = false;
        }
    })();
    return devBuildPromise;
}

function watchDevInputs(appDir, onChange) {
    const watchTargets = [
        { target: path.join(rootDir, "core", "src"), recursive: true },
        { target: path.join(rootDir, "common", "src"), recursive: true },
        { target: path.join(rootDir, "ui", "src"), recursive: true },
        { target: path.join(rootDir, "web", "src"), recursive: true },
        { target: path.join(rootDir, "ft", "src"), recursive: true },
        { target: path.join(rootDir, "ssr", "src"), recursive: true },
        { target: path.join(appDir, "src"), recursive: true },
        { target: path.join(appDir, "client"), recursive: true },
        { target: path.join(appDir, "public"), recursive: true },
        { target: path.join(appDir, "server.ts"), recursive: false },
        { target: path.join(appDir, "index.html"), recursive: false },
        { target: path.join(appDir, ".env"), recursive: false },
        { target: path.join(appDir, ".env.local"), recursive: false },
        { target: path.join(appDir, ".env.development"), recursive: false },
        {
            target: path.join(appDir, ".env.development.local"),
            recursive: false,
        },
        { target: path.join(appDir, ".env.production"), recursive: false },
        {
            target: path.join(appDir, ".env.production.local"),
            recursive: false,
        },
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
