import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRouter } from "@adaptivejs/web/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

export default async function render(url: string) {
  return createRouter(url, [], {
    isProduction,
    sourceDir: isProduction ? path.resolve(__dirname, "..", "..", "src") : __dirname,
    serverBuildDir: isProduction ? __dirname : path.resolve(__dirname, "..", "dist", "server"),
    clientBuildDir: isProduction ? path.resolve(__dirname, "..", "client") : path.resolve(__dirname, "..", "dist", "client")
  });
}
