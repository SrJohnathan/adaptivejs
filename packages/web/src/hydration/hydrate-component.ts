import { CLIENT_BOUNDARY_MODE_HYDRATE } from "./client-boundary.js";
import { createBoundaryComponent, wrapHydratePropsForServer } from "./boundary-component.js";

export function createHydrateComponent(
  moduleId: string,
  exportName = "default",
  serverRender?: ((props?: Record<string, any>) => any) | null,
) {
  return createBoundaryComponent({
    mode: CLIENT_BOUNDARY_MODE_HYDRATE,
    moduleId,
    exportName,
    serverRender,
    wrapServerProps: wrapHydratePropsForServer
  });
}
