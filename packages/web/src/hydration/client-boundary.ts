export const CLIENT_COMPONENT_SYMBOL = Symbol.for("adaptive.client_component");
export const CLIENT_BOUNDARY_TAG = "adaptive-client-boundary";
export const CLIENT_BOUNDARY_MODE_CLIENT = "client";
export const CLIENT_BOUNDARY_MODE_HYDRATE = "hydrate";
export const CLIENT_BOUNDARY_START_PREFIX = "adaptive-client-start:";
export const CLIENT_BOUNDARY_END = "adaptive-client-end";
export const REACTIVE_CHILD_START = "adaptive-reactive-start";
export const REACTIVE_CHILD_END = "adaptive-reactive-end";
export const REACTIVE_STRUCT_START = "adaptive-struct-start";
export const REACTIVE_STRUCT_END = "adaptive-struct-end";
export const REACTIVE_LIST_START = "adaptive-list-start";
export const REACTIVE_LIST_END = "adaptive-list-end";
export const REACTIVE_ASYNC_START = "adaptive-async-start";
export const REACTIVE_ASYNC_END = "adaptive-async-end";
export const HYDRATE_SLOT_TAG = "adaptive-hydrate-slot";
export const HYDRATE_SLOT_START = "adaptive-hydrate-slot-start";
export const HYDRATE_SLOT_END = "adaptive-hydrate-slot-end";

export function isClientBoundaryTag(tag: unknown) {
  return tag === CLIENT_BOUNDARY_TAG;
}

export function isHydrateSlotTag(tag: unknown) {
  return tag === HYDRATE_SLOT_TAG;
}
