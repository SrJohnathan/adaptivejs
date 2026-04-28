import fs from "node:fs/promises";
import path from "node:path";

export async function loadAdaptiveEnv(appDir, mode) {
  const files = resolveEnvFiles(mode);
  const loadedFiles = [];

  for (const fileName of files) {
    const absolutePath = path.join(appDir, fileName);
    const parsed = await readEnvFile(absolutePath);
    if (!parsed) continue;

    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }

    loadedFiles.push(absolutePath);
  }

  return {
    mode,
    loadedFiles,
    publicEnv: getPublicEnv(),
  };
}

export function getPublicEnv(prefix = "ADAPTIVE_PUBLIC_") {
  const output = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix)) continue;
    output[key] = value ?? "";
  }

  return output;
}

export function createClientEnvDefine(publicEnv = getPublicEnv()) {
  const define = {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "production",
    ),
    "import.meta.env.MODE": JSON.stringify(
      process.env.ADAPTIVE_ENV_MODE ?? process.env.NODE_ENV ?? "production",
    ),
    "import.meta.env.DEV": JSON.stringify(
      process.env.ADAPTIVE_ENV_MODE === "development",
    ),
    "import.meta.env.PROD": JSON.stringify(
      process.env.ADAPTIVE_ENV_MODE !== "development",
    ),
  };

  for (const [key, value] of Object.entries(publicEnv)) {
    define[`process.env.${key}`] = JSON.stringify(value);
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return define;
}

function resolveEnvFiles(mode) {
  const modeSuffix = mode ? `.${mode}` : "";
  const files = [`.env${modeSuffix}.local`];

  if (mode !== "test") {
    files.push(".env.local");
  }

  files.push(`.env${modeSuffix}`);
  files.push(".env");
  return files;
}

async function readEnvFile(filePath) {
  try {
    const source = await fs.readFile(filePath, "utf8");
    return parseEnv(source);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseEnv(source) {
  const output = {};
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    value = value.replace(/\\n/g, "\n");
    output[key] = expandValue(value, output);
  }

  return output;
}

function expandValue(value, currentEnv) {
  return value.replace(/\$([A-Z0-9_]+)/gi, (_, key) => {
    if (process.env[key] !== undefined) return process.env[key];
    if (currentEnv[key] !== undefined) return currentEnv[key];
    return "";
  });
}
