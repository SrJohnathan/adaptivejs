import { CLIENT_BOUNDARY_MODE_CLIENT } from "./client-boundary.js";
import {

  createBoundaryComponent,

} from "./boundary-component.js";

export function createClientComponent(
  moduleId: string,
  exportName = "default",
  serverRender?: ((props?: Record<string, any>) => any) | null,
) {
  return createBoundaryComponent({
    mode: CLIENT_BOUNDARY_MODE_CLIENT,
    moduleId,
    exportName,
    serverRender
  });
}

export {
  cleanupClientComponentScopes,
  hydrateClientComponents,
  getClientComponentMetadata,
  isClientComponent
} from "./boundary-component.js";
