#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(__dirname, "template");

const args = process.argv.slice(2);
const projectName = args.find((arg) => !arg.startsWith("--"));
const localMode = args.includes("--local");
const monorepoRoot = path.resolve(__dirname, "..");

if (!projectName) {
  console.error("Usage: create-adaptive-app <project-name> [--local]");
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), projectName);

try {
  await fs.access(targetDir);
  console.error(`Directory already exists: ${targetDir}`);
  process.exit(1);
} catch {
  // ok
}

await copyDir(templateDir, targetDir, projectName, createReplacements(targetDir));

console.log(`Adaptive app created at ${targetDir}`);
console.log("");
console.log("Next steps:");
console.log(`  cd ${projectName}`);
console.log("  npm install");
console.log("  npm run dev");

function createReplacements(targetDir) {
  const replacements = {
  __FT_DEP__: "^0.1.8",
  __WEB_DEP__: "^0.1.8",
  __UI_DEP__: "^0.1.8",
  __CLI_DEPENDENCY__: "\"@adaptivejs/cli\": \"^0.1.8\",",
  __STATIC_DEPENDENCY__: "\"@adaptivejs/static\": \"^0.1.8\",",
    __ADAPTIVE_DEV__: "adaptive dev",
    __ADAPTIVE_BUILD__: "adaptive build",
    __ADAPTIVE_BUILD_NETLIFY__: "adaptive build --preset netlify",
    __ADAPTIVE_PREVIEW_NETLIFY__: "adaptive preview --preset netlify",
    __ADAPTIVE_START__: "adaptive start"
  };

  if (!localMode) {
    return replacements;
  }

  const relativeRoot = normalizePath(path.relative(targetDir, monorepoRoot));
  replacements.__FT_DEP__ = `file:${normalizePath(path.join(relativeRoot, "ft"))}`;
  replacements.__WEB_DEP__ = `file:${normalizePath(path.join(relativeRoot, "web"))}`;
  replacements.__UI_DEP__ = `file:${normalizePath(path.join(relativeRoot, "ui"))}`;
  replacements.__CLI_DEPENDENCY__ = "";
  replacements.__STATIC_DEPENDENCY__ = `"@adaptivejs/static": "file:${normalizePath(path.join(relativeRoot, "static"))}",`;
  replacements.__ADAPTIVE_DEV__ = `node ${normalizePath(path.join(relativeRoot, "scripts", "adaptive-cli.mjs"))} dev .`;
  replacements.__ADAPTIVE_BUILD__ = `node ${normalizePath(path.join(relativeRoot, "scripts", "adaptive-cli.mjs"))} build .`;
  replacements.__ADAPTIVE_BUILD_NETLIFY__ = `node ${normalizePath(path.join(relativeRoot, "scripts", "adaptive-cli.mjs"))} build . --preset netlify`;
  replacements.__ADAPTIVE_PREVIEW_NETLIFY__ = `node ${normalizePath(path.join(relativeRoot, "scripts", "adaptive-cli.mjs"))} preview . --preset netlify`;
  replacements.__ADAPTIVE_START__ = `node ${normalizePath(path.join(relativeRoot, "scripts", "adaptive-cli.mjs"))} start .`;
  return replacements;
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

async function copyDir(fromDir, toDir, appName, replacements) {
  await fs.mkdir(toDir, { recursive: true });
  const entries = await fs.readdir(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(fromDir, entry.name);
    const targetName = entry.name === "_gitignore" ? ".gitignore" : entry.name;
    const targetPath = path.join(toDir, targetName);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath, appName, replacements);
      continue;
    }

    let content = await fs.readFile(sourcePath, "utf8");
    content = content.replace(/__APP_NAME__/g, appName);
    for (const [token, replacement] of Object.entries(replacements)) {
      content = content.replaceAll(token, replacement);
    }
    await fs.writeFile(targetPath, content, "utf8");
  }
}
