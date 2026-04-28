import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./build-app.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

await buildApp(path.join(rootDir, "example"));
