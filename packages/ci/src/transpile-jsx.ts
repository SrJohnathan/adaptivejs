/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */




import fs from "node:fs/promises";
import path from "node:path";
import {
    extractExports,
    getHydratableDirective, normalizeEntryId,
    rewriteRelativeImportExtensions,
    stripHydrateDirective
} from "./utilly.js";
import {transform} from "oxc-transform";

export async function buildServerFile(sourcePath:string, outputPath:string, options:any) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });


    const sourceText = await fs.readFile(sourcePath, "utf8");

    const componentDirective = getHydratableDirective(sourceText);
    if (componentDirective) {
        const moduleId = normalizeEntryId(path.relative(options.srcRoot, sourcePath));
        const ssrModulePath = outputPath.replace(/\.js$/, ".__client_ssr.js");
        await buildTransformedFile(
            sourcePath,
            ssrModulePath,
            options.cwd,
            stripHydrateDirective(sourceText),
        );
        await fs.writeFile(
            outputPath,
            createServerClientStub(
                sourceText,
                moduleId,
                `./${path.basename(ssrModulePath)}`,
                componentDirective,
            ),
            "utf8",
        );
        return;
    }

    await buildTransformedFile(sourcePath, outputPath, options.cwd, sourceText);
}



async function buildTransformedFile(sourcePath:string, outputPath:string, cwd:any, sourceText:string) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const result = await transform(sourcePath, sourceText, {
        cwd,
        lang: sourcePath.endsWith(".tsx") ? "tsx" : "ts",
        sourceType: "module",
        sourcemap: true,
        target: ["es2022", "node20"],
        jsx: {
            runtime: "automatic",
            importSource: "@adaptive-js/web",
        },
        typescript: {
            rewriteImportExtensions: "rewrite",
        },
    });



    if (result.errors.length > 0) {
        for (const error of result.errors) {
            console.error(`${sourcePath}: ${error.message}`);
            if (error.codeframe) console.error(error.codeframe);
        }
        process.exit(1);
    }

    const mapPath = `${outputPath}.map`;
    const sourceMapComment = `//# sourceMappingURL=${path.basename(mapPath)}`;
    const rewrittenCode = normalizePublicJsxImports(
        rewriteRelativeImportExtensions(result.code, sourcePath),
    );
    await fs.writeFile(
        outputPath,
        `${rewrittenCode}\n${sourceMapComment}\n`,
        "utf8",
    );
    if (result.map) {
        await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), "utf8");
    }
}


function createServerClientStub(sourceText:string, moduleId:any, ssrImportPath:any, componentDirective = "client") {
    const { namedExports } = extractExports(sourceText);
    const isHydrateDirective = componentDirective === "hydrate";
    const factoryName = isHydrateDirective
        ? "createHydrateComponent"
        : "createClientComponent";
    const lines = [
        `import { ${factoryName} } from "@adaptive-js/web";`,
    ];

    if (isHydrateDirective) {
        lines.unshift(`import * as serverModule from ${JSON.stringify(ssrImportPath)};`);
        lines.push(
            `export default ${factoryName}(${JSON.stringify(moduleId)}, "default", typeof serverModule.default === "function" ? serverModule.default : undefined);`,
        );
    } else {
        // Pure client boundaries must not execute the component implementation on the server.
        // Passing a serverRender here would eagerly touch browser-only libraries during SSR.
        lines.push(
            `export default ${factoryName}(${JSON.stringify(moduleId)}, "default");`,
        );
    }

    for (const exportName of namedExports) {
        if (exportName === "default") continue;
        if (isHydrateDirective) {
            lines.push(
                `export const ${exportName} = ${factoryName}(${JSON.stringify(moduleId)}, ${JSON.stringify(exportName)}, typeof serverModule[${JSON.stringify(exportName)}] === "function" ? serverModule[${JSON.stringify(exportName)}] : undefined);`,
            );
            continue;
        }

        lines.push(
            `export const ${exportName} = ${factoryName}(${JSON.stringify(moduleId)}, ${JSON.stringify(exportName)});`,
        );
    }

    lines.push("");
    return lines.join("\n");
}

function normalizePublicJsxImports(code: string) {
    return code
        .replace(/(["'])@adaptivejs\/jsx\/jsx-runtime\1/g, `$1@adaptive-js/web/jsx-runtime$1`)
        .replace(/(["'])@adaptivejs\/jsx\/jsx-dev-runtime\1/g, `$1@adaptive-js/web/jsx-dev-runtime$1`)
        .replace(/(["'])@adaptivejs\/jsx\1/g, `$1@adaptive-js/web$1`);
}
