import path from "node:path";
import { fileURLToPath } from "node:url";
import { init_server } from "@adaptivejs/web/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const appRoot = isProduction ? path.resolve(__dirname, "..") : __dirname;

await init_server({
  port: Number(process.env.PORT || 3000),
  appDir: appRoot,
  sourceDir: path.join(appRoot, "src"),
  serverBuildDir: path.join(appRoot, "dist", "server"),
  clientBuildDir: path.join(appRoot, "dist", "client"),
  templatePath: isProduction
    ? path.join(appRoot, "dist", "client", "index.html")
    : path.join(appRoot, "index.html"),
  publicDir: path.join(appRoot, "public")
});
