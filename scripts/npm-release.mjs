import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const artifactDir = path.join(rootDir, ".npm-packages");
const otpArgument = readOption("--otp");
const otpFromEnv = process.env.NPM_CONFIG_OTP || process.env.NPM_OTP;
const publishOtp = otpArgument ?? otpFromEnv ?? null;

const command = process.argv[2] ?? "check";

if (!["check", "pack", "publish"].includes(command)) {
  console.error("Usage: node scripts/npm-release.mjs <check|pack|publish> [--otp 123456]");
  process.exit(1);
}

const publishablePackages = await collectPublishablePackages(rootDir);

if (publishablePackages.length === 0) {
  console.error("No publishable workspaces were found.");
  process.exit(1);
}

if (command === "pack") {
  await fs.rm(artifactDir, { recursive: true, force: true });
  await fs.mkdir(artifactDir, { recursive: true });
}

for (const pkg of publishablePackages) {
  console.log(`\n==> ${pkg.name}`);

  if (pkg.scripts.build) {
    await run("npm", ["run", "build", "--workspace", pkg.name], rootDir);
  }

  if (command === "check") {
    await run("npm", ["pack", "--dry-run"], pkg.dir);
    continue;
  }

  if (command === "pack") {
    await run("npm", ["pack", "--pack-destination", artifactDir], pkg.dir);
    continue;
  }

  const publishArgs = ["publish", "--access", "public"];
  if (publishOtp) {
    publishArgs.push("--otp", publishOtp);
  }

  await run("npm", publishArgs, pkg.dir);
}

if (command === "pack") {
  console.log(`\nArtifacts written to ${artifactDir}`);
}

async function collectPublishablePackages(repoRoot) {
  const rootPackageJson = JSON.parse(
    await fs.readFile(path.join(repoRoot, "package.json"), "utf8")
  );

  const workspacePatterns = Array.isArray(rootPackageJson.workspaces)
    ? rootPackageJson.workspaces
    : [];

  const packages = [];

  for (const pattern of workspacePatterns) {
    if (!pattern.endsWith("/*")) {
      const packageDir = path.join(repoRoot, pattern);
      const pkg = await tryReadPackage(packageDir);
      if (pkg && isPublishablePackage(pkg.json)) {
        packages.push(pkg);
      }
      continue;
    }

    const baseDir = path.join(repoRoot, pattern.slice(0, -2));
    let entries = [];

    try {
      entries = await fs.readdir(baseDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const packageDir = path.join(baseDir, entry.name);
      const pkg = await tryReadPackage(packageDir);
      if (pkg && isPublishablePackage(pkg.json)) {
        packages.push(pkg);
      }
    }
  }

  return topologicallySortPackages(dedupePackages(packages));
}

async function tryReadPackage(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");

  try {
    const json = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    return {
      dir: packageDir,
      packageJsonPath,
      json,
      name: json.name,
      scripts: json.scripts ?? {}
    };
  } catch {
    return null;
  }
}

function isPublishablePackage(pkg) {
  if (!pkg?.name) return false;
  if (pkg.private === true) return false;
  return true;
}

function dedupePackages(packages) {
  const seen = new Set();
  return packages.filter((pkg) => {
    if (seen.has(pkg.name)) {
      return false;
    }
    seen.add(pkg.name);
    return true;
  });
}

function topologicallySortPackages(packages) {
  const packageMap = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const dependencyGraph = new Map();
  const localNames = new Set(packageMap.keys());

  for (const pkg of packages) {
    const allDeps = {
      ...(pkg.json.dependencies ?? {}),
      ...(pkg.json.peerDependencies ?? {}),
      ...(pkg.json.optionalDependencies ?? {})
    };

    dependencyGraph.set(
      pkg.name,
      Object.keys(allDeps).filter((depName) => localNames.has(depName))
    );
  }

  const sorted = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular workspace dependency detected while ordering publish list: ${name}`);
    }

    visiting.add(name);
    const deps = dependencyGraph.get(name) ?? [];
    deps.forEach(visit);
    visiting.delete(name);
    visited.add(name);
    sorted.push(packageMap.get(name));
  }

  for (const pkg of packages) {
    visit(pkg.name);
  }

  return sorted;
}

function run(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${bin} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}
