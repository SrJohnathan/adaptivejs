export type CliArgs = {
    targetDir: string;
};


export async function buildNitroIfNeeded(
    args: CliArgs,
    buildApp: () => Promise<void>,
): Promise<void> {
    const previousAssetBase = process.env.ADAPTIVE_ASSET_BASE;

    try {
        await buildApp();

        const { buildAdaptive } = await import("@adaptive-js/adapter-nitro");

        await buildAdaptive({
            appDir: args.targetDir,

        });
    } finally {
        restoreAssetBase(previousAssetBase);
    }
}

export async function previewNitro(appDir: string): Promise<void> {
    const port = Number(process.env.PORT || "3000");

    const { previewAdaptive } = await import("@adaptive-js/adapter-nitro");

    await previewAdaptive({
        appDir,
        port,
    });
}

function restoreAssetBase(previousAssetBase: string | undefined): void {
    if (previousAssetBase === undefined) {
        delete process.env.ADAPTIVE_ASSET_BASE;
    } else {
        process.env.ADAPTIVE_ASSET_BASE = previousAssetBase;
    }
}