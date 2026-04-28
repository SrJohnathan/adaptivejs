import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "oxc-transform";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const packageDirArg = process.argv[2];

if (!packageDirArg) {
    console.error("Usage: node scripts/build-package.mjs <package-dir>");
    process.exit(1);
}

const packageDir = path.resolve(rootDir, packageDirArg);
const srcDir = path.join(packageDir, "src");
const distDir = path.join(packageDir, "dist");

await rmWithRetry(distDir);
await fs.mkdir(distDir, { recursive: true });

const sourceFiles = await collectSourceFiles(srcDir);

for (const file of sourceFiles) {
    const relativePath = path.relative(srcDir, file);

    if (file.endsWith(".d.ts")) {
        const outputPath = path.join(distDir, relativePath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.copyFile(file, outputPath);
        continue;
    }

    const outputPath = path
        .join(distDir, relativePath)
        .replace(/\.(ts|tsx)$/, ".js");
    const mapPath = `${outputPath}.map`;

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const sourceText = await fs.readFile(file, "utf8");
    const result = transform(file, sourceText, {
        cwd: packageDir,
        lang: file.endsWith(".tsx") ? "tsx" : "ts",
        sourceType: "module",
        sourcemap: true,
        target: ["es2022", "node20"],
        jsx: {
            runtime: "automatic",
            importSource: "@adaptivejs/ft",
        },
        typescript: {
            rewriteImportExtensions: "rewrite",
        },
    });

    if (result.errors.length > 0) {
        for (const error of result.errors) {
            console.error(`${path.relative(rootDir, file)}: ${error.message}`);
            if (error.codeframe) console.error(error.codeframe);
        }
        process.exitCode = 1;
        continue;
    }

    const sourceMapComment = `//# sourceMappingURL=${path.basename(mapPath)}`;
    await fs.writeFile(
        outputPath,
        `${result.code}\n${sourceMapComment}\n`,
        "utf8",
    );
    if (result.map) {
        await fs.writeFile(
            mapPath,
            JSON.stringify(result.map, null, 2),
            "utf8",
        );
    }
}

if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
}

async function collectSourceFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectSourceFiles(fullPath)));
            continue;
        }

        if (
            (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) ||
            entry.name.endsWith(".d.ts")
        ) {
            files.push(fullPath);
        }
    }

    return files;
}

async function rmWithRetry(targetPath, attempts = 5) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await fs.rm(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            const code = error && typeof error === "object" && "code" in error ? error.code : "";
            if (!["ENOTEMPTY", "EBUSY", "EPERM"].includes(String(code)) || attempt === attempts) {
                throw error;
            }

            await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        }
    }
}
