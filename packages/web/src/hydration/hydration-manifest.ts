export const HYDRATION_MANIFEST_ATTR = "data-adaptive-hydration-manifest";
export const LEGACY_HYDRATION_MANIFEST_ATTR = "data-adaptive-manifest";
export const HYDRATION_BOUNDARY_ID_ATTR = "data-adaptive-boundary-id";

export type HydrationManifestInstruction =
  | { key: string; kind: "event"; id: string; event: string }
  | { key: string; kind: "ref"; id: string }
  | { key: string; kind: "reactive-range"; id: string }
  | { key: string; kind: "reactive-struct"; id: string }
  | { key: string; kind: "reactive-list"; id: string }
  | { key: string; kind: "reactive-async"; id: string }
  | { key: string; kind: "dynamic-prop"; id: string; prop: string };

export type HydrationManifest = {
  boundaryId: string;
  instructions: HydrationManifestInstruction[];
};
