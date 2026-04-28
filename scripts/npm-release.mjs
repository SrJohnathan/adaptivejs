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

const publishablePackages = [
  { name: "@adaptivejs/cli", dir: "cli" },
  { name: "@adaptivejs/core", dir: "core" },
  { name: "@adaptivejs/common", dir: "common" },
  { name: "@adaptivejs/ui", dir: "ui" },
  { name: "@adaptivejs/ft", dir: "ft" },
  { name: "@adaptivejs/ssr", dir: "ssr" },
  { name: "@adaptivejs/static", dir: "static" },
  { name: "@adaptivejs/web", dir: "web" },
  { name: "create-adaptive-app", dir: "create-adaptive-app" }
];

const command = process.argv[2] ?? "check";

if (!["check", "pack", "publish"].includes(command)) {
  console.error("Usage: node scripts/npm-release.mjs <check|pack|publish> [--otp 123456]");
  process.exit(1);
}

if (command === "pack") {
  await fs.rm(artifactDir, { recursive: true, force: true });
  await fs.mkdir(artifactDir, { recursive: true });
}

for (const pkg of publishablePackages) {
  const packageDir = path.join(rootDir, pkg.dir);
  console.log(`\n==> ${pkg.name}`);

  await run("npm", ["run", "build", "--workspace", pkg.name], rootDir);

  if (command === "check") {
    await run("npm", ["pack", "--dry-run"], packageDir);
    continue;
  }

  if (command === "pack") {
    await run("npm", ["pack", "--pack-destination", artifactDir], packageDir);
    continue;
  }

  const publishArgs = ["publish", "--access", "public"];
  if (publishOtp) {
    publishArgs.push("--otp", publishOtp);
  }
  await run("npm", publishArgs, packageDir);
}

if (command === "pack") {
  console.log(`\nArtifacts written to ${artifactDir}`);
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
