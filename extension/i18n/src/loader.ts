import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { normalizeLocale } from "./index.js";
import type { I18nMessages, I18nMessageTree } from "./index.js";

export type LoadProjectLanguagesOptions<TLocale extends string = string> = {
  rootDir?: string;
  folderName?: string;
  extensions?: string[];
};

export function resolveLanguageDirectory(rootDir = process.cwd(), folderName = "language") {
  return resolve(rootDir, folderName);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeTrees(target: I18nMessageTree, source: I18nMessageTree): I18nMessageTree {
  const output: I18nMessageTree = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const existing = output[key];

    if (isPlainObject(existing) && isPlainObject(value)) {
      output[key] = mergeTrees(existing as I18nMessageTree, value as I18nMessageTree);
      continue;
    }

    output[key] = value as any;
  }

  return output;
}

function assignNestedTree(target: I18nMessageTree, pathSegments: string[], value: I18nMessageTree) {
  if (pathSegments.length === 0) {
    return mergeTrees(target, value);
  }

  const [head, ...tail] = pathSegments;
  const current = target[head];
  const base = isPlainObject(current) ? (current as I18nMessageTree) : {};
  target[head] = assignNestedTree(base, tail, value);
  return target;
}

function collectJsonFiles(directory: string, extensions: string[], files: string[] = []) {
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      collectJsonFiles(filePath, extensions, files);
      continue;
    }

    if (entry.isFile() && extensions.includes(extname(entry.name))) {
      files.push(filePath);
    }
  }

  return files;
}

function loadLocaleDirectory(localeDir: string, extensions: string[]) {
  const files = collectJsonFiles(localeDir, extensions);

  if (files.length === 0) {
    throw new Error(
      `[AdaptiveJS i18n] The locale folder "${localeDir}" was found, but it does not contain any supported language files. Add at least one JSON file such as "${join(localeDir, "common.json")}" or "${join(localeDir, "index.json")}".`
    );
  }

  let localeTree: I18nMessageTree = {};

  for (const filePath of files) {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as I18nMessageTree;
    const rel = relative(localeDir, filePath);
    const normalized = rel.split(sep).join("/");
    const withoutExtension = normalized.replace(/\.[^.]+$/, "");
    const pathSegments = withoutExtension === "index"
      ? []
      : withoutExtension
          .split("/")
          .map((segment) => segment.trim())
          .filter(Boolean);

    localeTree = assignNestedTree(localeTree, pathSegments, parsed);
  }

  return localeTree;
}

export function loadLanguage<TLocale extends string = string>(
  locale: TLocale,
  options: LoadProjectLanguagesOptions<TLocale> = {}
): I18nMessageTree {
  const normalizedLocale = normalizeLocale(locale) as TLocale;
  const rootDir = options.rootDir ?? process.cwd();
  const folderName = options.folderName ?? "language";
  const extensions = options.extensions ?? [".json"];
  const languageDir = resolveLanguageDirectory(rootDir, folderName);

  if (!existsSync(languageDir)) {
    throw new Error(
      `[AdaptiveJS i18n] No "${folderName}" folder was found at "${languageDir}". Create a "${folderName}" folder in the project root, for example:\n- ${folderName}/en/common.json\n- ${folderName}/pt-br/common.json`
    );
  }

  const localeDirectory = join(languageDir, normalizedLocale);
  if (existsSync(localeDirectory)) {
    return loadLocaleDirectory(localeDirectory, extensions);
  }

  for (const extension of extensions) {
    const localeFile = join(languageDir, `${normalizedLocale}${extension}`);
    if (existsSync(localeFile)) {
      const raw = readFileSync(localeFile, "utf8");
      return JSON.parse(raw) as I18nMessageTree;
    }
  }

  throw new Error(
    `[AdaptiveJS i18n] The locale "${normalizedLocale}" was not found inside "${languageDir}". Create a folder like "${folderName}/${normalizedLocale}" or a file like "${folderName}/${normalizedLocale}.json".`
  );
}

export function loadProjectLanguages<TLocale extends string = string>(
  options: LoadProjectLanguagesOptions<TLocale> = {}
): I18nMessages<TLocale> {
  const rootDir = options.rootDir ?? process.cwd();
  const folderName = options.folderName ?? "language";
  const extensions = options.extensions ?? [".json"];
  const languageDir = resolveLanguageDirectory(rootDir, folderName);

  if (!existsSync(languageDir)) {
    throw new Error(
      `[AdaptiveJS i18n] No "${folderName}" folder was found at "${languageDir}". Create a "${folderName}" folder in the project root, for example:\n- ${folderName}/en/common.json\n- ${folderName}/pt-br/common.json`
    );
  }

  const messages = {} as I18nMessages<TLocale>;
  const entries = readdirSync(languageDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      messages[normalizeLocale(entry.name) as TLocale] = loadLanguage(entry.name as TLocale, options);
      continue;
    }

    if (entry.isFile() && extensions.includes(extname(entry.name))) {
      const locale = normalizeLocale(entry.name.slice(0, -extname(entry.name).length)) as TLocale;
      messages[locale] = loadLanguage(locale, options);
    }
  }

  if (Object.keys(messages).length === 0) {
    throw new Error(
      `[AdaptiveJS i18n] The "${folderName}" folder exists at "${languageDir}", but no locales were found. Create folders such as "${folderName}/en" and "${folderName}/pt-br", each one containing at least one JSON file.`
    );
  }

  return messages;
}
