#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(__dirname, "template");

const EXTENSION_IDS = /** @type {const} */ (["auth", "i18n", "icons"]);

const EXTENSION_PACKAGES = {
  auth: {
    name: "@adaptive-js/extension-auth",
    localPath: ["extension", "auth"],
  },
  i18n: {
    name: "@adaptive-js/extension-i18n",
    localPath: ["extension", "i18n"],
  },
  icons: {
    name: "@adaptive-js/extension-lucide-animation-icons",
    localPath: ["extension", "lucide-animation-icons"],
  },
};

const args = process.argv.slice(2);
const projectName = args.find((arg) => !arg.startsWith("--"));
const localMode = args.includes("--local");
const monorepoRoot = path.resolve(__dirname, "..");
const styleOption = parseStyleOption(args);
const extensionOption = parseExtensionOption(args);

if (!projectName) {
  console.error(
    "Usage: create-adaptive-app <project-name> [--local] [--style tailwind|beer|none] [--extensions auth,i18n,icons] [--auth] [--i18n] [--icons] [--no-extensions]"
  );
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
const extensions = await resolveExtensionChoices(extensionOption);
const replacements = createReplacements(targetDir, styleChoice, extensions);

await copyDir(templateDir, targetDir, appName, replacements);
await finalizeTemplate(targetDir, styleChoice, extensions);

console.log(`Adaptive app created at ${targetDir}`);
if (extensions.length > 0) {
  console.log(`Extensions: ${extensions.join(", ")}`);
}
console.log("");
console.log("Next steps:");
console.log(`  cd ${projectName}`);
console.log("  npm install");
console.log("  npm run dev");

function createReplacements(targetDir, styleChoice, extensions) {
  const version = "^0.0.1";

  const replacements = {
    __WEB_DEP__: version,
    __CI_DEP__: version,
    __NITRO_ADAPTER_DEP__: version,
    __STYLE_RUNTIME_DEPENDENCIES__: renderStyleRuntimeDependencies(styleChoice),
    __STYLE_DEV_DEPENDENCIES__: renderStyleDevDependencies(styleChoice),
    __EXTENSION_DEPENDENCIES__: "",
    __ADAPTIVE_DEV__: "adaptive dev",
    __ADAPTIVE_BUILD__: "adaptive build",
    __ADAPTIVE_PREVIEW__: "adaptive preview",
    __ADAPTIVE_START__: "adaptive start"
  };

  if (!localMode) {
    replacements.__EXTENSION_DEPENDENCIES__ = renderExtensionDependencies(extensions, null);
    return replacements;
  }

  const relativeRoot = normalizePath(path.relative(targetDir, monorepoRoot));

  replacements.__WEB_DEP__ = `file:${normalizePath(path.join(relativeRoot, "packages", "web"))}`;
  replacements.__CI_DEP__ = `file:${normalizePath(path.join(relativeRoot, "packages", "ci"))}`;
  replacements.__NITRO_ADAPTER_DEP__ = `file:${normalizePath(path.join(relativeRoot, "packages", "adapter-nitro"))}`;
  replacements.__EXTENSION_DEPENDENCIES__ = renderExtensionDependencies(extensions, relativeRoot);

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

/**
 * @returns {"prompt" | "none" | string[]}
 */
function parseExtensionOption(cliArgs) {
  const hasNoExtensions = cliArgs.includes("--no-extensions");
  const explicitArgIndex = cliArgs.findIndex((arg) => arg === "--extensions");
  const explicitValue = explicitArgIndex >= 0 ? cliArgs[explicitArgIndex + 1] : null;
  const flagExtensions = EXTENSION_IDS.filter((id) => cliArgs.includes(`--${id}`));

  if (hasNoExtensions && (explicitValue || flagExtensions.length > 0)) {
    console.error('Nao misture "--no-extensions" com outras flags de extensao.');
    process.exit(1);
  }

  if (hasNoExtensions) {
    return "none";
  }

  if (explicitValue && flagExtensions.length > 0) {
    console.error('Use apenas uma forma: "--extensions auth,i18n,icons" ou "--auth/--i18n/--icons".');
    process.exit(1);
  }

  if (explicitValue) {
    if (explicitValue.startsWith("--")) {
      console.error('Faltou o valor de "--extensions". Exemplo: --extensions auth,i18n,icons');
      process.exit(1);
    }
    return normalizeExtensionChoices(explicitValue);
  }

  if (flagExtensions.length > 0) {
    return flagExtensions;
  }

  return "prompt";
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function normalizeExtensionChoices(value) {
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed || trimmed === "none") {
    return [];
  }

  const aliases = {
    auth: "auth",
    i18n: "i18n",
    icons: "icons",
    lucide: "icons",
    "animated-icons": "icons",
    "lucide-animation-icons": "icons",
  };

  const selected = [];
  for (const raw of trimmed.split(/[,\s]+/).filter(Boolean)) {
    const id = aliases[raw];
    if (!id) {
      console.error(
        `Extensao invalida: ${raw}. Use "auth", "i18n", "icons" (ou "none").`
      );
      process.exit(1);
    }
    if (!selected.includes(id)) {
      selected.push(id);
    }
  }

  return selected;
}

/**
 * @param {"prompt" | "none" | string[]} initialChoice
 * @returns {Promise<string[]>}
 */
async function resolveExtensionChoices(initialChoice) {
  if (initialChoice === "none") {
    return [];
  }

  if (Array.isArray(initialChoice)) {
    return initialChoice;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      "Extensoes opcionais (auth,i18n,icons — separe por virgula) [none]: "
    );

    const trimmed = answer.trim();
    if (!trimmed) {
      return [];
    }

    return normalizeExtensionChoices(trimmed);
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

/**
 * @param {string[]} extensions
 * @param {string | null} relativeRoot
 */
function renderExtensionDependencies(extensions, relativeRoot) {
  if (extensions.length === 0) {
    return "";
  }

  const lines = extensions.map((id) => {
    const pkg = EXTENSION_PACKAGES[id];
    const version = relativeRoot
      ? `file:${normalizePath(path.join(relativeRoot, ...pkg.localPath))}`
      : "^0.0.1";
    return `    "${pkg.name}": "${version}"`;
  });

  return `,\n${lines.join(",\n")}`;
}

async function finalizeTemplate(targetDir, styleChoice, extensions) {
  const dependencyPath = path.join(targetDir, "dependency.ts");
  const stylesPath = path.join(targetDir, "public", "styles.css");
  const legacyStylePath = path.join(targetDir, "public", "style.css");

  await safeUnlink(legacyStylePath);

  if (styleChoice === "tailwind") {
    await fs.writeFile(stylesPath, '@import "tailwindcss";\n', "utf8");
    await fs.writeFile(dependencyPath, dependencyTemplate(""), "utf8");
  } else if (styleChoice === "beer") {
    await fs.writeFile(stylesPath, "\n", "utf8");
    await fs.writeFile(
      dependencyPath,
      dependencyTemplate('import "beercss";\nimport "material-dynamic-colors";\n'),
      "utf8"
    );
  } else {
    await fs.writeFile(stylesPath, "\n", "utf8");
    await fs.writeFile(dependencyPath, dependencyTemplate(""), "utf8");
  }

  await scaffoldExtensions(targetDir, extensions);
}

/**
 * @param {string} targetDir
 * @param {string[]} extensions
 */
async function scaffoldExtensions(targetDir, extensions) {
  if (extensions.includes("auth")) {
    await fs.writeFile(
      path.join(targetDir, "src", "auth.ts"),
      authScaffoldSource(),
      "utf8"
    );
  }

  if (extensions.includes("i18n")) {
    await fs.mkdir(path.join(targetDir, "language", "en"), { recursive: true });
    await fs.mkdir(path.join(targetDir, "language", "pt-br"), { recursive: true });
    await fs.writeFile(
      path.join(targetDir, "language", "en", "common.json"),
      `${JSON.stringify({ welcome: { title: "Welcome to AdaptiveJS" } }, null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(targetDir, "language", "pt-br", "common.json"),
      `${JSON.stringify({ welcome: { title: "Bem-vindo ao AdaptiveJS" } }, null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(targetDir, "src", "i18n.ts"),
      i18nScaffoldSource(),
      "utf8"
    );
  }

  if (extensions.includes("icons")) {
    await fs.mkdir(path.join(targetDir, "src", "components"), { recursive: true });
    await fs.writeFile(
      path.join(targetDir, "src", "components", "theme-icon.tsx"),
      iconsScaffoldSource(),
      "utf8"
    );
  }
}

function authScaffoldSource() {
  return `import { createAuth } from "@adaptive-js/extension-auth/server";
import { createMemoryAuthAdapter } from "@adaptive-js/extension-auth/memory-adapter";

const adapter = createMemoryAuthAdapter({
  users: [
    {
      id: "user-1",
      email: "demo@example.com",
      roles: ["admin"],
    },
  ],
});

/**
 * Auth server-side do app.
 *
 * Em producao, troque o memory adapter por um adapter persistente
 * e use cookie "__Host-adaptive-session" com secure: true.
 */
export const auth = createAuth({
  adapter,
  cookie: {
    name: "adaptive.session.dev",
    secure: false,
  },
  csrf: {
    allowedOrigins: ["http://localhost:3000"],
  },
});
`;
}

function i18nScaffoldSource() {
  return `import { createI18n, defineMessages } from "@adaptive-js/extension-i18n";

/**
 * Mensagens embutidas para uso em UI hidratada.
 * Os JSON em /language tambem podem ser carregados no server com
 * \`loadProjectLanguages\` de \`@adaptive-js/extension-i18n/loader\`.
 */
export const messages = defineMessages({
  en: {
    welcome: {
      title: "Welcome to AdaptiveJS",
    },
  },
  "pt-br": {
    welcome: {
      title: "Bem-vindo ao AdaptiveJS",
    },
  },
});

export const { I18nProvider, useI18n } = createI18n({
  locale: "pt-br",
  fallbackLocale: "en",
  messages,
});
`;
}

function iconsScaffoldSource() {
  return `"hydrate";

import { SunIcon } from "@adaptive-js/extension-lucide-animation-icons";

export function ThemeIcon() {
  return <SunIcon size={28} animateOnHover />;
}
`;
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
