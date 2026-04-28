export interface AdaptiveAppApi {
  getPlatform(): string;
}

export const App: AdaptiveAppApi = {
  getPlatform(): string {
    throw new Error(
      "Adaptive platform API is not implemented in @adaptivejs/common. Use a target package like @adaptivejs/web or @adaptivejs/desktop."
    );
  }
};
