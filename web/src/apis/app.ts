import type { AdaptiveAppApi } from "@adaptivejs/common/app";

export const App: AdaptiveAppApi = {
  getPlatform(): string {
    return "web";
  }
};
