#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(__dirname, "template");

const args = process.argv.slice(2);
const projectName = args.find((arg) => !arg.startsWith("--"));
const localMode = args.includes("--local");
const monorepoRoot = path.resolve(__dirname, "..");
const styleOption = parseStyleOption(args);

if (!projectName) {
  console.error("Usage: create-adaptive-app <project-name> [--local] [--style tailwind|beer|none]");
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

const appName = path.basename(targetDir);
const styleChoice = await resolveStyleChoice(styleOption);
await copyDir(templateDir, targetDir, appName, createReplacements(targetDir, styleChoice));
await finalizeTemplate(targetDir, styleChoice);

console.log(`Adaptive app created at ${targetDir}`);
console.log("");
console.log("Next steps:");
console.log(`  cd ${projectName}`);
console.log("  npm install");
console.log("  npm run dev");

function createReplacements(targetDir, styleChoice) {
  const version = "^0.0.1";

  const replacements = {
    __WEB_DEP__: version,
    __CI_DEP__: version,
    __NITRO_ADAPTER_DEP__: version,
    __STYLE_RUNTIME_DEPENDENCIES__: renderStyleRuntimeDependencies(styleChoice),
    __STYLE_DEV_DEPENDENCIES__: renderStyleDevDependencies(styleChoice),
    __ADAPTIVE_DEV__: "adaptive dev",
    __ADAPTIVE_BUILD__: "adaptive build",
    __ADAPTIVE_PREVIEW__: "adaptive preview",
    __ADAPTIVE_START__: "adaptive start"
  };

  if (!localMode) {
    return replacements;
  }

  const relativeRoot = normalizePath(path.relative(targetDir, monorepoRoot));

  replacements.__WEB_DEP__ = `file:${normalizePath(path.join(relativeRoot, "packages", "web"))}`;
  replacements.__CI_DEP__ = `file:${normalizePath(path.join(relativeRoot, "packages", "ci"))}`;
  replacements.__NITRO_ADAPTER_DEP__ = `file:${normalizePath(path.join(relativeRoot, "packages", "adapter-nitro"))}`;

  replacements.__ADAPTIVE_DEV__ = `node ${normalizePath(path.join(relativeRoot, "packages", "ci", "dist", "index.js"))} dev .`;
  replacements.__ADAPTIVE_BUILD__ = `node ${normalizePath(path.join(relativeRoot, "packages", "ci", "dist", "index.js"))} build .`;
  replacements.__ADAPTIVE_PREVIEW__ = `node ${normalizePath(path.join(relativeRoot, "packages", "ci", "dist", "index.js"))} preview .`;
  replacements.__ADAPTIVE_START__ = `node ${normalizePath(path.join(relativeRoot, "packages", "ci", "dist", "index.js"))} start .`;

  return replacements;
}

function parseStyleOption(cliArgs) {
  const explicitStyleArgIndex = cliArgs.findIndex((arg) => arg === "--style");
  const explicitStyle = explicitStyleArgIndex >= 0 ? cliArgs[explicitStyleArgIndex + 1] : null;
  const hasTailwind = cliArgs.includes("--tailwind");
  const hasBeer = cliArgs.includes("--beer");

  if (explicitStyle && (hasTailwind || hasBeer)) {
    console.error('Use apenas uma forma de escolha de estilo: "--style ..." ou "--tailwind/--beer".');
    process.exit(1);
  }

  if (hasTailwind && hasBeer) {
    console.error("TailwindCSS e BeerCSS sao mutuamente exclusivos no scaffold. Escolha apenas um.");
    process.exit(1);
  }

  if (explicitStyle) {
    return normalizeStyleChoice(explicitStyle);
  }

  if (hasTailwind) return "tailwind";
  if (hasBeer) return "beer";
  return null;
}

function normalizeStyleChoice(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "tailwind" || normalized === "tailwindcss") {
    return "tailwind";
  }
  if (normalized === "beer" || normalized === "beercss") {
    return "beer";
  }
  if (normalized === "none" || normalized === "default") {
    return "none";
  }

  console.error(`Estilo invalido: ${value}. Use "tailwind", "beer" ou "none".`);
  process.exit(1);
}

async function resolveStyleChoice(initialChoice) {
  if (initialChoice) {
    return initialChoice;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      "Escolha o estilo global do scaffold (none/tailwind/beer) [none]: "
    );

    const trimmed = answer.trim();
    if (!trimmed) {
      return "none";
    }

    return normalizeStyleChoice(trimmed);
  } finally {
    rl.close();
  }
}

function renderStyleRuntimeDependencies(styleChoice) {
  if (styleChoice === "beer") {
    return [
      ',',
      '    "beercss": "^3.12.13",',
      '    "material-dynamic-colors": "^1.1.0"'
    ].join("\n");
  }

  return "";
}

function renderStyleDevDependencies(styleChoice) {
  if (styleChoice === "tailwind") {
    return [
      ',',
      '    "@tailwindcss/postcss": "^4.1.7",',
      '    "postcss": "^8.5.6",',
      '    "tailwindcss": "^4.1.7"'
    ].join("\n");
  }

  return "";
}

async function finalizeTemplate(targetDir, styleChoice) {
  const dependencyPath = path.join(targetDir, "dependency.ts");
  const stylesPath = path.join(targetDir, "public", "styles.css");
  const legacyStylePath = path.join(targetDir, "public", "style.css");

  await safeUnlink(legacyStylePath);

  if (styleChoice === "tailwind") {
    await fs.writeFile(stylesPath, '@import "tailwindcss";\n', "utf8");
    await fs.writeFile(dependencyPath, dependencyTemplate(""), "utf8");
    return;
  }

  if (styleChoice === "beer") {
    await fs.writeFile(stylesPath, "\n", "utf8");
    await fs.writeFile(
      dependencyPath,
      dependencyTemplate('import "beercss";\nimport "material-dynamic-colors";\n'),
      "utf8"
    );
    return;
  }

  await fs.writeFile(stylesPath, "\n", "utf8");
  await fs.writeFile(dependencyPath, dependencyTemplate(""), "utf8");
}

function dependencyTemplate(importBlock) {
  const imports = importBlock.trim();
  return `/*
 * Use este arquivo para dependencias globais do app.
 *
 * Bons exemplos:
 * - bibliotecas de estilo global
 * - temas globais
 * - side effects de UI que precisam existir em todas as paginas
 *
 * Evite colocar aqui:
 * - logica de componente
 * - handlers locais
 * - estado reativo de tela
 *
 * O pipeline do Adaptive trata este arquivo como entry client global
 * automaticamente, entao nao precisa escrever "client" nem exportar nada.
 *
 * Use this file for global app dependencies.
 *
 * Good examples:
 * - global style libraries
 * - global themes
 * - UI side effects that must exist on every page
 *
 * Avoid putting here:
 * - component logic
 * - local handlers
 * - page-level reactive state
 *
 * The Adaptive pipeline treats this file as a global client entry
 * automatically, so you do not need to write "client" or export anything.
 */

${imports}${imports ? "\n" : ""}`;
}

async function safeUnlink(targetPath) {
  try {
    await fs.unlink(targetPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
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
