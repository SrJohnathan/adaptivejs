#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { prepareEnv } from "./env-loader.js";
import { buildNitroIfNeeded, previewNitro, type CliArgs } from "./nitro.js";
import {buildApp, buildAppDev, buildAppDevIncremental} from "./build.js";
import {startAdaptiveDevServer} from "./dev-server.js";
import {FileChange} from "./utilly.js";



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

    const pendingChanges = new Map<string, FileChange>();

    async function executeRebuild() {
        if (building) {
            rebuildPending = true;
            return;
        }

        building = true;
        rebuildPending = false;

        const changes = Array.from(pendingChanges.values());
        pendingChanges.clear();

        try {
            console.log("🔁 rebuilding...");

            if (changes.length === 0) {
                await buildAppDev(appDir);
            } else {
                console.log(
                    "[adaptive] changed:",
                    changes.map((change) => change.filePath).join(", "),
                );

                // Por enquanto continuamos usando o full build.
                // O próximo passo será substituir isso pelo incremental builder.
              //  await buildAppDev(appDir);

                await buildAppDevIncremental(appDir, changes);
            }

            console.log("✅ done");
        } catch (err) {
            console.error("❌ build error", err);
        } finally {
            building = false;

            if (rebuildPending || pendingChanges.size > 0) {
                rebuildPending = false;
                scheduleRebuild();
            }
        }
    }

    function scheduleRebuild(change?: FileChange) {
        if (change) {
            pendingChanges.set(change.filePath, change);
        }

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void executeRebuild();
        }, 100);
    }

    function watchDirectory(targetPath: string) {
        if (!fs.existsSync(targetPath)) return;

        fs.watch(
            targetPath,
            { recursive: true },
            (eventType, filename) => {
                if (!filename) return;

                const relativePath = filename.toString();

                scheduleRebuild({
                    eventType:
                        eventType === "rename"
                            ? "rename"
                            : "change",
                    filePath: path.relative(
                        appDir,
                        path.join(targetPath, relativePath),
                    ),
                });
            },
        );
    }

    await executeRebuild();
    await startAdaptiveDevServer(appDir);

    watchDirectory(path.join(appDir, "src"));
    watchDirectory(path.join(appDir, "public"));

    watchIfExists(
        path.join(appDir, "index.html"),
        () =>
            scheduleRebuild({
                eventType: "change",
                filePath: "index.html",
            }),
    );

    watchIfExists(
        path.join(appDir, "dependency.ts"),
        () =>
            scheduleRebuild({
                eventType: "change",
                filePath: "dependency.ts",
            }),
    );

    watchIfExists(
        path.join(appDir, "dependency.tsx"),
        () =>
            scheduleRebuild({
                eventType: "change",
                filePath: "dependency.tsx",
            }),
    );

    watchIfExists(
        path.join(appDir, "dependency.js"),
        () =>
            scheduleRebuild({
                eventType: "change",
                filePath: "dependency.js",
            }),
    );

    watchIfExists(
        path.join(appDir, "dependency.jsx"),
        () =>
            scheduleRebuild({
                eventType: "change",
                filePath: "dependency.jsx",
            }),
    );
}

function watchIfExists(
    targetPath: string,
    listener: () => void,
) {
    if (!fs.existsSync(targetPath)) return;

    fs.watch(targetPath, listener);
}
