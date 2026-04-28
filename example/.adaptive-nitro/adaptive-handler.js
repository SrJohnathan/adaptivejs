
import { eventHandler, setResponseHeader } from "h3";
import { createRouter as createAdaptiveRouter } from "@adaptivejs/web/server";
import path from "node:path";

const appRoot = process.env.ADAPTIVE_APP_ROOT || "D:\\projetos\\Adaptive\\example";

export default eventHandler(async (event) => {
  const url = event.path || "/";

  const result = await createAdaptiveRouter(url, [], {
    isProduction: true,
    appDir: appRoot,
    serverBuildDir: path.join(appRoot, "dist", "server"),
    clientBuildDir: path.join(appRoot, "dist", "client"),
  });

  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");
  return result.html;
});
