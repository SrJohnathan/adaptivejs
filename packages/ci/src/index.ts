#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { prepareEnv } from "./env-loader.js";
import { buildNitroIfNeeded, previewNitro, type CliArgs } from "./nitro.js";
import {buildApp, buildAppDev} from "./build.js";
import {startAdaptiveDevServer} from "./dev-server.js";



const command = process.argv[2];
const parsedArgs = parseCliArgs(process.argv.slice(3));
const targetDir = parsedArgs.targetDir;

switch (command) {
    case "build":

        await runBuild(targetDir, parsedArgs);
        break;
    case "dev":
        await runDev(targetDir);
        break;
    case "preview":
        await runPreview(targetDir);
        break;
    case "run":
    case "start":
        await runProduction(targetDir);
        break;
    default:
        console.error("Usage: adaptive <dev|build|preview|run|start> [appDir]");
        process.exit(1);
}

function parseCliArgs(args: string[]): CliArgs {
    let targetDir = process.cwd();

    for (const arg of args) {
        if (!arg.startsWith("--")) {
            targetDir = path.resolve(arg);
        }
    }

    return { targetDir };
}

async function runBuild(appDir: string, args: CliArgs): Promise<void> {
    await prepareEnv(appDir, "production");
    process.env.ADAPTIVE_ASSET_BASE = "/_adaptive";


    await buildNitroIfNeeded(args, async () => {
        await buildApp(appDir);
    });
}

async function runPreview(appDir: string): Promise<void> {
    await prepareEnv(appDir, "production");
    await previewNitro(appDir);
}

async function runProduction(appDir: string): Promise<void> {
    await prepareEnv(appDir, "production");
    await previewNitro(appDir);
}

async function runDev(appDir: string): Promise<void> {
    await prepareEnv(appDir, "development");

    let building = false;
    let rebuildPending = false;
    let debounceTimer: NodeJS.Timeout | null = null;

    async function executeRebuild() {
        if (building) {
            rebuildPending = true;
            return;
        }

        building = true;
        rebuildPending = false;

        try {
            console.log("🔁 rebuilding...");
            await buildAppDev(appDir);
            console.log("✅ done");
        } catch (err) {
            console.error("❌ build error", err);
        } finally {
            building = false;
            if (rebuildPending) {
                rebuildPending = false;
                scheduleRebuild();
            }
        }
    }

    function scheduleRebuild() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            executeRebuild();
        }, 100);
    }

    await executeRebuild();
    await startAdaptiveDevServer(appDir);

    fs.watch(path.join(appDir, "src"), { recursive: true }, scheduleRebuild);
    fs.watch(path.join(appDir, "public"), { recursive: true }, scheduleRebuild);
    watchIfExists(path.join(appDir, "index.html"), scheduleRebuild);
    watchIfExists(path.join(appDir, "dependency.ts"), scheduleRebuild);
    watchIfExists(path.join(appDir, "dependency.tsx"), scheduleRebuild);
    watchIfExists(path.join(appDir, "dependency.js"), scheduleRebuild);
    watchIfExists(path.join(appDir, "dependency.jsx"), scheduleRebuild);
}

function watchIfExists(targetPath: string, listener: () => void) {
    if (!fs.existsSync(targetPath)) return;
    fs.watch(targetPath, listener);
}
