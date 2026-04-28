import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";
import fg from "fast-glob";
import { parseSync } from "oxc-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

export async function buildDesktopApp(appDir, options = {}) {
  const desktopOutputDir =
    options.desktopOutputDir ??
    path.resolve(rootDir, "desktop-rust", "adaptive");

  await ensureDesktopCompilerPackages();
  await emitDesktopIr(appDir, {
    entry: options.entry,
    outputDir: desktopOutputDir
  });

  if (options.cargo === true) {
    const desktopRustDir = path.resolve(rootDir, "desktop-rust");
    await runCargo(
      desktopRustDir,
      options.release === true ? ["build", "--release"] : ["run"]
    );
  }
}

export async function emitDesktopIr(appDir, options = {}) {
  const outputDir = options.outputDir ?? path.join(appDir, "dist", "desktop");
  const entryPath = await resolveDesktopEntry(appDir, options.entry);
  const pagesDir = path.join(appDir, "src", "pages");
  const tempDir = path.join(appDir, ".adaptive-temp", "desktop-ir");
  const outputPath = path.join(outputDir, "app.ir.json");
  const patchDesktopIrMetadata = (ir) => {
    return ir;
  };

  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const coreModuleUrl = `${pathToFileURL(path.resolve(rootDir, "core", "dist", "index.js")).href}?v=${Date.now()}`;
  const {
    createIRDynamic,
    createIRDesktopDocument,
    serializeIRDesktopDocument
  } = await import(coreModuleUrl);
  const compiledPages = await collectDesktopPages(appDir, pagesDir, tempDir);
  const entryRelative = path.relative(appDir, entryPath).replace(/\\/g, "/");
  const currentPage =
    compiledPages.find((page) => page.source === entryRelative) ??
    compiledPages[0] ??
    {
      route: "/",
      source: entryRelative,
      state: [],
      bindings: [],
      actions: [],
      effects: [],
      componentBindings: [],
      componentActions: [],
      tree: createIRDynamic("desktop-entry-missing")
    };

  let irDocument;
  try {
    const patchedIr = patchDesktopIrMetadata(currentPage.tree);
    irDocument = createIRDesktopDocument(
      entryRelative,
      patchedIr,
      currentPage.state,
      currentPage.bindings,
      currentPage.actions,
      currentPage.effects,
      currentPage.componentBindings,
      currentPage.componentActions,
      currentPage.route,
      compiledPages
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    irDocument = createIRDesktopDocument(
      path.relative(appDir, entryPath).replace(/\\/g, "/"),
      createIRDynamic(`desktop-entry-error:${message}`),
      currentPage.state,
      currentPage.bindings,
      currentPage.actions,
      currentPage.effects,
      currentPage.componentBindings,
      currentPage.componentActions,
      currentPage.route,
      compiledPages
    );
  }

  await fs.writeFile(outputPath, `${serializeIRDesktopDocument(irDocument).trim()}\n`, "utf8");
  await emitDesktopPageContracts(appDir, compiledPages);

  await fs.rm(tempDir, { recursive: true, force: true });
}

async function collectDesktopPages(appDir, pagesDir, tempDir) {
  const modules = await fg(["**/*.tsx", "**/*.ts", "**/*.jsx", "**/*.js"], {
    cwd: pagesDir,
    onlyFiles: true,
    ignore: ["**/components/**", "**/forms/**", "**/_*.tsx", "**/_*.ts", "**/_*.jsx", "**/_*.js"]
  });

  const pages = [];
  for (const relativePath of modules) {
    const absolutePath = path.join(pagesDir, relativePath);
    const compiledPage = await compileDesktopPage(appDir, absolutePath, tempDir);
    pages.push({
      route: parseDesktopRoutePath(relativePath),
      ...compiledPage
    });
  }

  return pages.sort((left, right) => left.route.localeCompare(right.route));
}

async function compileDesktopPage(appDir, entryPath, tempDir) {
  const coreModuleUrl = `${pathToFileURL(path.resolve(rootDir, "core", "dist", "index.js")).href}?v=${Date.now()}:${Math.random()}`;
  const {
    normalizeToIR,
    createIRFragment,
    createIRDynamic,
    createIRElement,
    createIRText
  } = await import(coreModuleUrl);

  const entrySource = await fs.readFile(entryPath, "utf8");
  const reactiveMetadata = await extractReactiveMetadataForFile(entryPath);

  let tree = await lowerDesktopTreeFromAst(entrySource, {
    createIRDynamic,
    createIRElement,
    createIRFragment,
    createIRText
  }, entryPath);

  if (tree === null) {
    const bundlePath = path.join(
      tempDir,
      path.relative(appDir, entryPath).replace(/[\\/]/g, "__").replace(/\.(tsx|ts|jsx|js)$/, ".mjs")
    );
    await esbuild.build({
      entryPoints: [entryPath],
      outfile: bundlePath,
      bundle: true,
      format: "esm",
      platform: "node",
      target: ["node20"],
      jsx: "automatic",
      jsxImportSource: "@adaptivejs/web",
      sourcemap: false,
      minify: false,
      legalComments: "none",
      external: ["node:*"]
    });

    const entryModuleUrl = `${pathToFileURL(bundlePath).href}?v=${Date.now()}:${Math.random()}`;
    const entryModule = await import(entryModuleUrl);
    const candidate =
      entryModule && typeof entryModule === "object" && "default" in entryModule
        ? entryModule.default
        : entryModule;
    const rendered =
      typeof candidate === "function"
        ? await candidate()
        : candidate;
    tree =
      normalizeToIR(rendered, {
        resolveComponents: true,
        evaluateDynamicChildren: false,
        evaluateDynamicProps: false,
        includeNulls: false
      }) ?? createIRFragment([]);
  }

  return {
    source: path.relative(appDir, entryPath).replace(/\\/g, "/"),
    state: reactiveMetadata.state,
    bindings: reactiveMetadata.bindings,
    actions: reactiveMetadata.actions,
    effects: reactiveMetadata.effects,
    componentBindings: reactiveMetadata.componentBindings,
    componentActions: reactiveMetadata.componentActions,
    tree
  };
}

async function emitDesktopPageContracts(appDir, compiledPages) {
  const contractsDir = path.join(appDir, "native", "desktop", "contracts");
  await fs.mkdir(contractsDir, { recursive: true });

  for (const page of compiledPages) {
    const baseName = pageContractBaseName(page.route);
    const sourcePath = path.join(appDir, page.source);
    const clientFunctions = await collectPageContractFunctions(sourcePath, "client");
    const serveFunctions = await collectPageContractFunctions(sourcePath, "serve");
    await ensureUserOwnedContract(
      path.join(contractsDir, `${baseName}.client.rs`),
      renderDesktopPageContract(page, "client", clientFunctions)
    );
    await ensureUserOwnedContract(
      path.join(contractsDir, `${baseName}.serve.rs`),
      renderDesktopPageContract(page, "serve", serveFunctions)
    );
  }
}

async function ensureUserOwnedContract(filePath, content) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, "utf8");
  }
}

function renderDesktopPageContract(page, target, functions = []) {
  const route = page.route ?? "/";
  const source = page.source ?? "unknown";
  const header = `// Adaptive ${target} contract for page ${route}
// Source: ${source}
// This file is user-owned. Adaptive creates it only when missing.
// Put platform-specific logic here when the view layer is not enough.
`;

  if (functions.length === 0) {
    return `${header}
// No ${target} functions were detected for this page yet.
`;
  }

  const body = functions
    .map((descriptor) => renderRustFunctionContract(descriptor, target, route))
    .join("\n\n");

  return `${header}
${body}
`;
}

function renderRustFunctionContract(descriptor, target, route) {
  const structs = [
    ...(descriptor.params ?? []).flatMap((parameter) => parameter.structs ?? []),
    ...(descriptor.returnType?.structs ?? [])
  ];

  const uniqueStructs = [...new Set(structs)];
  const warnings = [];

  const supportedParams = [];
  for (const parameter of descriptor.params ?? []) {
    if (parameter.supported && parameter.rustType) {
      supportedParams.push(`${rustIdentifier(parameter.name)}: ${parameter.rustType}`);
    } else {
      warnings.push(
        `Parameter '${parameter.name}' could not be converted automatically: ${parameter.reason ?? "unsupported type"}.`
      );
    }
  }

  for (const warning of descriptor.warnings ?? []) {
    warnings.push(warning);
  }

  let signature = `pub fn ${rustIdentifier(descriptor.name)}(${supportedParams.join(", ")})`;
  if (descriptor.returnType?.supported && descriptor.returnType.rustType) {
    signature += ` -> ${descriptor.returnType.rustType}`;
  } else if (descriptor.returnType && !descriptor.returnType.supported) {
    warnings.push(`Return type could not be converted automatically: ${descriptor.returnType.reason ?? "unsupported type"}.`);
  }

  const warningBlock = warnings.length > 0
    ? `${warnings.map((warning) => `// ${warning}`).join("\n")}\n`
    : "";
  const structBlock = uniqueStructs.length > 0
    ? `${uniqueStructs.join("\n\n")}\n\n`
    : "";

  return `${structBlock}${warningBlock}${signature} {\n    todo!(\"Implement ${target} function '${descriptor.name}' for page ${route}\");\n}`;
}

function pageContractBaseName(route) {
  if (!route || route === "/") {
    return "home";
  }

  return route
    .replace(/^\/+/, "")
    .replace(/[:/\\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "page";
}

function pascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

async function collectPageContractFunctions(entryPath, target, visited = new Set()) {
  const normalizedPath = path.resolve(entryPath);
  if (visited.has(normalizedPath)) {
    return [];
  }

  visited.add(normalizedPath);
  const sourceText = await fs.readFile(normalizedPath, "utf8");
  const parseResult = parseSync(normalizedPath, sourceText, {
    lang: normalizedPath.endsWith(".ts") && !normalizedPath.endsWith(".tsx") ? "ts" : "tsx",
    sourceType: "module",
    astType: "ts"
  });

  const detected = new Map();

  for (const node of parseResult.program.body ?? []) {
    if (node?.type !== "ImportDeclaration") {
      continue;
    }

    const moduleName = node.source?.value;
    if (typeof moduleName !== "string" || !moduleName.startsWith(".")) {
      continue;
    }

    const resolvedPath = await resolveModuleImport(normalizedPath, moduleName);
    if (!resolvedPath) {
      continue;
    }

    const importedSource = await fs.readFile(resolvedPath, "utf8");
    const importedParse = parseSync(resolvedPath, importedSource, {
      lang: resolvedPath.endsWith(".ts") && !resolvedPath.endsWith(".tsx") ? "ts" : "tsx",
      sourceType: "module",
      astType: "ts"
    });
    const exportedFunctions = collectExportedFunctions(importedParse.program);
    const typeEnvironment = collectTypeEnvironment(importedParse.program);

    const directive = readModuleDirective(importedParse.program);
    if (target === "serve" && directive === "server") {
      for (const specifier of node.specifiers ?? []) {
        if (specifier?.type !== "ImportSpecifier") {
          continue;
        }

        const importedName = specifier.imported?.type === "Identifier"
          ? specifier.imported.name
          : typeof specifier.imported?.value === "string"
            ? specifier.imported.value
            : null;
        if (importedName && exportedFunctions.has(importedName)) {
          detected.set(
            importedName,
            describeFunctionContract(importedName, exportedFunctions.get(importedName), typeEnvironment)
          );
        }
      }
    }

    if (target === "client" && directive === "client") {
      for (const exportedName of readExportedFunctionNames(importedParse.program)) {
        if (!looksLikeComponentName(exportedName)) {
          const functionNode = exportedFunctions.get(exportedName);
          if (functionNode) {
            detected.set(
              exportedName,
              describeFunctionContract(exportedName, functionNode, typeEnvironment)
            );
          } else {
            detected.set(exportedName, {
              name: exportedName,
              params: [],
              returnType: null,
              warnings: ["Function body could not be resolved from the module export."]
            });
          }
        }
      }
    }

    const nested = await collectPageContractFunctions(resolvedPath, target, visited);
    for (const descriptor of nested) {
      detected.set(descriptor.name, descriptor);
    }
  }

  return [...detected.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function readModuleDirective(program) {
  for (const node of program.body ?? []) {
    if (node?.type !== "ExpressionStatement") {
      break;
    }

    const expression = unwrapExpression(node.expression);
    if (expression?.type === "Literal" && typeof expression.value === "string") {
      if (expression.value === "server" || expression.value === "client") {
        return expression.value;
      }
      continue;
    }

    break;
  }

  return null;
}

function readExportedFunctionNames(program) {
  const names = [];

  for (const node of program.body ?? []) {
    if (node?.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = node.declaration;
    if (declaration?.type === "FunctionDeclaration" && declaration.id?.type === "Identifier") {
      names.push(declaration.id.name);
      continue;
    }

    if (declaration?.type !== "VariableDeclaration") {
      continue;
    }

    for (const item of declaration.declarations ?? []) {
      if (item?.id?.type === "Identifier") {
        names.push(item.id.name);
      }
    }
  }

  return names;
}

function looksLikeComponentName(name) {
  return /^[A-Z]/.test(name);
}

function collectExportedFunctions(program) {
  const functions = new Map();

  for (const node of program.body ?? []) {
    if (node?.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = node.declaration;
    if (declaration?.type === "FunctionDeclaration" && declaration.id?.type === "Identifier") {
      functions.set(declaration.id.name, declaration);
      continue;
    }

    if (declaration?.type !== "VariableDeclaration") {
      continue;
    }

    for (const item of declaration.declarations ?? []) {
      if (item?.id?.type !== "Identifier") {
        continue;
      }
      const init = unwrapExpression(item.init);
      if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
        functions.set(item.id.name, init);
      }
    }
  }

  return functions;
}

function collectTypeEnvironment(program) {
  const environment = new Map();

  for (const node of program.body ?? []) {
    const declaration = node?.type === "ExportNamedDeclaration"
      ? node.declaration
      : node;

    if (declaration?.type === "TSTypeAliasDeclaration" && declaration.id?.type === "Identifier") {
      environment.set(declaration.id.name, declaration.typeAnnotation);
      continue;
    }

    if (declaration?.type === "TSInterfaceDeclaration" && declaration.id?.type === "Identifier") {
      environment.set(declaration.id.name, declaration.body);
    }
  }

  return environment;
}

function describeFunctionContract(name, functionNode, typeEnvironment) {
  const warnings = [];
  const params = [];

  for (const parameter of functionNode.params ?? []) {
    if (parameter?.type !== "Identifier") {
      warnings.push("Only identifier parameters are supported for contract generation.");
      continue;
    }

    const typeNode = parameter.typeAnnotation?.typeAnnotation ?? null;
    if (!typeNode) {
      warnings.push(`Parameter '${parameter.name}' has no type annotation.`);
      continue;
    }

    const describedParam = describeTsTypeForRust(typeNode, typeEnvironment, pascalCase(name) + pascalCase(parameter.name));
    params.push({
      name: parameter.name,
      ...describedParam
    });
  }

  const returnType = describeReturnType(functionNode, typeEnvironment, pascalCase(name) + "Output");
  if (returnType?.warning) {
    warnings.push(returnType.warning);
  }

  return {
    name,
    params,
    returnType: returnType?.type ?? null,
    warnings
  };
}

function describeReturnType(functionNode, typeEnvironment, fallbackName) {
  const annotatedType = functionNode.returnType?.typeAnnotation ?? null;
  if (annotatedType) {
    const described = describeTsTypeForRust(annotatedType, typeEnvironment, fallbackName);
    return described.supported
      ? { type: described }
      : { type: null, warning: `Return type of '${fallbackName}' is not supported yet.` };
  }

  if (functionNode.body?.type === "BlockStatement") {
    const returnStatement = functionNode.body.body?.find((statement) => statement?.type === "ReturnStatement");
    const returnedExpression = unwrapExpression(returnStatement?.argument);
    if (returnedExpression?.type === "ObjectExpression") {
      const described = describeTsTypeForRust(returnedExpression, typeEnvironment, fallbackName);
      return described.supported
        ? { type: described }
        : { type: null, warning: `Return object of '${fallbackName}' could not be mapped to Rust.` };
    }
  }

  return null;
}

function describeTsTypeForRust(typeNode, typeEnvironment, fallbackName) {
  if (!typeNode) {
    return unsupportedRustType("Missing type annotation.");
  }

  if (typeNode.type === "TSStringKeyword") {
    return supportedRustType("String");
  }

  if (typeNode.type === "TSNumberKeyword") {
    return supportedRustType("i32");
  }

  if (typeNode.type === "TSBooleanKeyword") {
    return supportedRustType("bool");
  }

  if (typeNode.type === "TSNullKeyword") {
    return supportedRustType("()");
  }

  if (typeNode.type === "TSTypeReference") {
    const typeName = readTSTypeReferenceName(typeNode.typeName);
    if (!typeName) {
      return unsupportedRustType("Unsupported type reference.");
    }

    if (typeName === "AdaptiveFormData") {
      return unsupportedRustType("AdaptiveFormData should be implemented by the native platform contract.");
    }

    if (["File", "FormData", "Date", "Map", "Set", "Promise"].includes(typeName)) {
      return unsupportedRustType(`Type '${typeName}' has no automatic Rust equivalent.`);
    }

    const resolved = typeEnvironment.get(typeName);
    if (resolved) {
      return describeTsTypeForRust(resolved, typeEnvironment, typeName);
    }

    return supportedRustType(typeName);
  }

  if (typeNode.type === "TSUnionType") {
    const nonNullish = (typeNode.types ?? []).filter((member) =>
      member?.type !== "TSNullKeyword" && member?.type !== "TSUndefinedKeyword"
    );

    if (nonNullish.length === 1 && nonNullish.length !== (typeNode.types?.length ?? 0)) {
      const inner = describeTsTypeForRust(nonNullish[0], typeEnvironment, fallbackName);
      if (!inner.supported) {
        return inner;
      }

      return supportedRustType(`Option<${inner.rustType}>`, inner.structs);
    }

    return unsupportedRustType("Complex union types are not supported.");
  }

  if (typeNode.type === "TSTypeLiteral" || typeNode.type === "TSInterfaceBody" || typeNode.type === "ObjectExpression") {
    const structDefinition = describeObjectLikeType(typeNode, typeEnvironment, fallbackName);
    return structDefinition.supported
      ? supportedRustType(structDefinition.rustType, structDefinition.structs)
      : structDefinition;
  }

  return unsupportedRustType(`Unsupported TS type '${typeNode.type}'.`);
}

function describeObjectLikeType(typeNode, typeEnvironment, structName) {
  const members = typeNode.type === "ObjectExpression"
    ? (typeNode.properties ?? [])
      .filter((property) => property?.type === "Property" && property.kind === "init")
      .map((property) => ({
        key: readPropertyName(property.key, property.computed === true),
        optional: false,
        typeNode: property.value
      }))
    : (typeNode.body ?? typeNode.members ?? [])
      .filter((member) => member?.type === "TSPropertySignature")
      .map((member) => ({
        key: readPropertyName(member.key, member.computed === true),
        optional: member.optional === true,
        typeNode: member.typeAnnotation?.typeAnnotation ?? null
      }));

  const fields = [];
  const nestedStructs = [];

  for (const member of members) {
    if (!member.key || !member.typeNode) {
      return unsupportedRustType("Object field could not be described.");
    }

    const described = describeTsTypeForRust(member.typeNode, typeEnvironment, structName + pascalCase(member.key));
    if (!described.supported) {
      return described;
    }

    fields.push({
      name: rustIdentifier(member.key),
      rustType: member.optional ? `Option<${described.rustType}>` : described.rustType
    });
    nestedStructs.push(...(described.structs ?? []));
  }

  const definition = renderRustStruct(structName, fields);
  return supportedRustType(structName, [...nestedStructs, definition]);
}

function renderRustStruct(name, fields) {
  const body = fields.length > 0
    ? fields.map((field) => `    pub ${field.name}: ${field.rustType},`).join("\n")
    : "    // Add fields manually.";

  return `#[derive(Debug, Clone, Default)]\npub struct ${name} {\n${body}\n}`;
}

function supportedRustType(rustType, structs = []) {
  return {
    supported: true,
    rustType,
    structs
  };
}

function unsupportedRustType(reason) {
  return {
    supported: false,
    rustType: null,
    structs: [],
    reason
  };
}

function readTSTypeReferenceName(typeName) {
  if (!typeName) {
    return null;
  }

  if (typeName.type === "Identifier") {
    return typeName.name;
  }

  return null;
}

function rustIdentifier(name) {
  const cleaned = name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return cleaned || "unnamed_function";
}

async function extractReactiveMetadataForFile(entryPath, visited = new Set()) {
  const normalizedPath = path.resolve(entryPath);
  if (visited.has(normalizedPath)) {
    return {
      state: [],
      bindings: [],
      actions: [],
      effects: [],
      componentBindings: [],
      componentActions: []
    };
  }

  visited.add(normalizedPath);
  const sourceText = await fs.readFile(normalizedPath, "utf8");
  const metadata = extractReactiveMetadata(sourceText);
  const parseResult = parseSync(normalizedPath, sourceText, {
    lang: normalizedPath.endsWith(".ts") && !normalizedPath.endsWith(".tsx") ? "ts" : "tsx",
    sourceType: "module",
    astType: "ts"
  });

  for (const node of parseResult.program.body ?? []) {
    if (node?.type !== "ImportDeclaration") {
      continue;
    }

    const moduleName = node.source?.value;
    if (typeof moduleName !== "string" || !moduleName.startsWith(".")) {
      continue;
    }

    const resolvedPath = await resolveModuleImport(normalizedPath, moduleName);
    if (!resolvedPath) {
      continue;
    }

    const nested = await extractReactiveMetadataForFile(resolvedPath, visited);
    metadata.state.push(...nested.state);
    metadata.bindings.push(...nested.bindings);
    metadata.actions.push(...nested.actions);
    metadata.effects.push(...nested.effects);
    metadata.componentBindings.push(...nested.componentBindings);
    metadata.componentActions.push(...nested.componentActions);
  }

  return {
    state: dedupeBySignature(metadata.state, (state) => `${state.id}:${state.setter ?? ""}`),
    bindings: dedupeBySignature(metadata.bindings, (binding) =>
      `${binding.stateId}:${binding.access}:${binding.scope}`
    ),
    actions: dedupeBySignature(metadata.actions, (action) =>
      `${action.id}:${action.stateId}:${action.setter}:${action.operation}:${action.scope}:${JSON.stringify(action.argument ?? null)}`
    ),
    effects: dedupeBySignature(metadata.effects, (effect) =>
      `${effect.id}:${effect.hook}:${JSON.stringify(effect.actions)}:${JSON.stringify(effect.cleanupActions ?? [])}:${JSON.stringify(effect.unsupported ?? [])}`
    ),
    componentBindings: dedupeBySignature(metadata.componentBindings, (binding) =>
      `${binding.component}:${binding.index}:${binding.target}:${binding.stateId}:${binding.prefix ?? ""}:${binding.suffix ?? ""}`
    ),
    componentActions: dedupeBySignature(metadata.componentActions, (action) =>
      `${action.component}:${action.index}:${action.target}:${action.eventName}:${action.actionId}:${action.stateId}`
    )
  };
}

async function lowerDesktopTreeFromAst(sourceText, irFactory, sourcePath = "desktop-entry.tsx") {
  const parseResult = parseSync(sourcePath, sourceText, {
    lang: sourcePath.endsWith(".ts") && !sourcePath.endsWith(".tsx") ? "ts" : "tsx",
    sourceType: "module",
    astType: "ts"
  });

  if (parseResult.errors.length > 0) {
    return null;
  }

  const context = await createModuleLoweringContext(parseResult.program, sourcePath);
  const entryDeclaration = resolveDefaultExportDeclaration(parseResult.program, context);
  if (!entryDeclaration) {
    return null;
  }

  return lowerFunctionLikeNode(
    entryDeclaration.node,
    { props: {}, locals: {}, contexts: {}, contextDefinitions: {} },
    entryDeclaration.context,
    irFactory
  );
}

export function extractReactiveMetadata(sourceText) {
  const parseResult = parseSync("desktop-entry.tsx", sourceText, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts"
  });

  if (parseResult.errors.length > 0) {
    return {
      state: [],
      bindings: [],
      actions: [],
      effects: [],
      componentBindings: [],
      componentActions: []
    };
  }

  const useReactiveBindings = collectUseReactiveBindings(parseResult.program);
  if (useReactiveBindings.size === 0) {
    return {
      state: [],
      bindings: [],
      actions: [],
      effects: [],
      componentBindings: [],
      componentActions: []
    };
  }

  const definitions = [];
  const stateBySetter = new Map();
  const bindings = [];
  const actions = [];
  const effects = [];
  const componentBindings = [];
  const componentActions = [];
  let actionIndex = 0;
  let effectIndex = 0;
  walkAst(parseResult.program, (node) => {
    if (node?.type !== "VariableDeclarator") {
      return;
    }

    const tuple = readReactiveTuplePattern(node.id);
    if (!tuple) {
      return;
    }

    const init = unwrapExpression(node.init);
    if (!init || init.type !== "CallExpression") {
      return;
    }

    const callee = unwrapExpression(init.callee);
    if (callee?.type !== "Identifier" || !useReactiveBindings.has(callee.name)) {
      return;
    }

    const definition = {
      id: tuple.id,
      setter: tuple.setter,
      kind: "reactive",
      source: "useReactive",
      initial: parseReactiveInitialValue(init.arguments?.[0], tuple.id)
    };

    definitions.push(definition);
    stateBySetter.set(tuple.setter, definition.id);
  });

  walkAst(parseResult.program, (node, parents) => {
    if (node?.type === "Identifier") {
      const stateDefinition = definitions.find((definition) => definition.id === node.name);
      if (!stateDefinition || !isReactiveReadReference(node, parents)) {
        return;
      }

      bindings.push({
        stateId: stateDefinition.id,
        access: parentNodeIsStateCall(node, parents) ? "call" : "value",
        scope: determineReactiveScope(parents)
      });
      return;
    }

    if (node?.type === "CallExpression") {
      const callee = unwrapExpression(node.callee);
      if (callee?.type !== "Identifier") {
        return;
      }

      const stateId = stateBySetter.get(callee.name);
      if (stateId) {
        const action = {
          id: `${stateId}:${callee.name}:${actionIndex++}`,
          stateId,
          setter: callee.name,
          ...analyzeSetterArgument(node.arguments?.[0], stateId),
          scope: determineReactiveScope(parents),
        };

        actions.push(action);
        return;
      }

      if (callee.name === "Text") {
        const textBinding = readTextBinding(node.arguments?.[0], definitions, componentBindings.length);
        if (textBinding) {
          componentBindings.push(textBinding);
        }
        return;
      }
    }
  });

  walkAst(parseResult.program, (node) => {
    if (node?.type !== "CallExpression") {
      return;
    }

    const callee = unwrapExpression(node.callee);
    if (callee?.type !== "Identifier" || callee.name !== "Button") {
      return;
    }

    const eventBinding = readButtonEventBinding(
      node.arguments?.[1],
      actions,
      componentActions.length
    );
    if (eventBinding) {
      componentActions.push(eventBinding);
    }
  });

  let jsxTextIndex = 0;
  let jsxButtonIndex = 0;
  walkAst(parseResult.program, (node) => {
    if (node?.type !== "JSXElement") {
      return;
    }

    const tagName = readJsxTagName(node.openingElement?.name);
    if (!tagName) {
      return;
    }

    if (["p", "span", "label", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
      const binding = readJsxTextBinding(node, definitions, jsxTextIndex);
      jsxTextIndex += 1;
      if (binding) {
        componentBindings.push(binding);
      }
      return;
    }

    if (tagName === "button") {
      const actionBinding = readJsxButtonEventBinding(node, actions, jsxButtonIndex);
      jsxButtonIndex += 1;
      if (actionBinding) {
        componentActions.push(actionBinding);
      }
    }
  });

  walkAst(parseResult.program, (node) => {
    if (node?.type !== "CallExpression") {
      return;
    }

    const callee = unwrapExpression(node.callee);
    if (
      callee?.type !== "Identifier" ||
      !["useEffect", "useLayoutEffect"].includes(callee.name)
    ) {
      return;
    }

    const effect = analyzeLifecycleEffect(
      node,
      definitions,
      stateBySetter,
      effectIndex++
    );
    if (effect) {
      effects.push(effect);
    }
  });

  return {
    state: definitions,
    bindings: dedupeBySignature(bindings, (binding) =>
      `${binding.stateId}:${binding.access}:${binding.scope}`
    ),
    actions: dedupeBySignature(actions, (action) =>
      `${action.id}:${action.stateId}:${action.setter}:${action.operation}:${action.scope}:${JSON.stringify(action.argument ?? null)}`
    ),
    effects: dedupeBySignature(effects, (effect) =>
      `${effect.id}:${effect.hook}:${JSON.stringify(effect.actions)}:${JSON.stringify(effect.cleanupActions ?? [])}:${JSON.stringify(effect.unsupported ?? [])}`
    ),
    componentBindings,
    componentActions
  };
}

function analyzeLifecycleEffect(node, definitions, stateBySetter, effectIndex) {
  const callee = unwrapExpression(node.callee);
  const callback = unwrapExpression(node.arguments?.[0]);
  if (
    callee?.type !== "Identifier" ||
    (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression")
  ) {
    return null;
  }

  const actions = [];
  const cleanupActions = [];
  const unsupported = [];
  let localActionIndex = 0;

  const bodyStatements = callback.body?.type === "BlockStatement"
    ? callback.body.body ?? []
    : [{ type: "ExpressionStatement", expression: callback.body }];

  for (const statement of bodyStatements) {
    if (statement?.type === "ExpressionStatement") {
      const action = readLifecycleActionFromExpression(
        statement.expression,
        stateBySetter,
        effectIndex,
        localActionIndex++
      );
      if (action) {
        actions.push(action);
        continue;
      }

      unsupported.push(statement.type);
      continue;
    }

    if (statement?.type === "ReturnStatement") {
      const cleanup = unwrapExpression(statement.argument);
      if (
        cleanup?.type !== "ArrowFunctionExpression" &&
        cleanup?.type !== "FunctionExpression"
      ) {
        unsupported.push("ReturnStatement");
        continue;
      }

      const cleanupStatements = cleanup.body?.type === "BlockStatement"
        ? cleanup.body.body ?? []
        : [{ type: "ExpressionStatement", expression: cleanup.body }];

      for (const cleanupStatement of cleanupStatements) {
        if (cleanupStatement?.type !== "ExpressionStatement") {
          unsupported.push(cleanupStatement?.type ?? "UnknownCleanupStatement");
          continue;
        }

        const action = readLifecycleActionFromExpression(
          cleanupStatement.expression,
          stateBySetter,
          effectIndex,
          localActionIndex++
        );
        if (action) {
          cleanupActions.push(action);
        } else {
          unsupported.push(cleanupStatement.type);
        }
      }
      continue;
    }

    unsupported.push(statement?.type ?? "UnknownStatement");
  }

  return {
    id: `effect:${effectIndex}`,
    hook: callee.name,
    runOn: "resume",
    cleanupOn: "pause",
    actions,
    cleanupActions,
    unsupported
  };
}

function readLifecycleActionFromExpression(expression, stateBySetter, effectIndex, actionIndex) {
  const node = unwrapExpression(expression);
  if (node?.type !== "CallExpression") {
    return null;
  }

  const callee = unwrapExpression(node.callee);
  if (callee?.type !== "Identifier") {
    return null;
  }

  const stateId = stateBySetter.get(callee.name);
  if (!stateId) {
    return null;
  }

  return {
    id: `effect:${effectIndex}:${stateId}:${callee.name}:${actionIndex}`,
    stateId,
    setter: callee.name,
    ...analyzeSetterArgument(node.arguments?.[0], stateId),
    scope: "other"
  };
}

function collectUseReactiveBindings(program) {
  const bindings = new Set();

  for (const node of program.body ?? []) {
    if (node?.type !== "ImportDeclaration") {
      continue;
    }

    const moduleName = node.source?.value;
    if (
      typeof moduleName !== "string" ||
      !["@adaptivejs/core", "@adaptivejs/web"].includes(moduleName)
    ) {
      continue;
    }

    for (const specifier of node.specifiers ?? []) {
      if (specifier?.type !== "ImportSpecifier") {
        continue;
      }

      const importedName = specifier.imported?.type === "Identifier"
        ? specifier.imported.name
        : null;
      const localName = specifier.local?.type === "Identifier"
        ? specifier.local.name
        : null;

      if (importedName === "useReactive" && localName) {
        bindings.add(localName);
      }
    }
  }

  return bindings;
}

function readReactiveTuplePattern(pattern) {
  if (pattern?.type !== "ArrayPattern") {
    return null;
  }

  const [stateNode, setterNode] = pattern.elements ?? [];
  if (stateNode?.type !== "Identifier" || setterNode?.type !== "Identifier") {
    return null;
  }

  return {
    id: stateNode.name,
    setter: setterNode.name
  };
}

function parseReactiveInitialValue(expression, stateId) {
  const value = readStaticValueFromExpression(expression);
  if (value !== undefined) {
    return value;
  }

  return {
    kind: "dynamic",
    hint: `initial:${stateId}`
  };
}

function analyzeSetterArgument(expression, stateId) {
  const node = unwrapExpression(expression);

  if (node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression") {
    return {
      operation: "update",
      argument: { kind: "dynamic", hint: `initial:${stateId}` }
    };
  }

  if (node?.type === "BinaryExpression" && (node.operator === "+" || node.operator === "-")) {
    const left = unwrapExpression(node.left);
    const right = unwrapExpression(node.right);
    if (isStateGetterCall(left, stateId)) {
      const delta = readStaticValueFromExpression(right);
      if (typeof delta === "number") {
        return {
          operation: "add",
          argument: node.operator === "-" ? -delta : delta
        };
      }
    }
  }

  return {
    operation: "set",
    argument: parseReactiveInitialValue(expression, stateId)
  };
}

function readStaticValueFromExpression(expression) {
  const node = unwrapExpression(expression);
  if (!node) {
    return undefined;
  }

  if (node.type === "Literal") {
    if (
      typeof node.value === "string" ||
      typeof node.value === "number" ||
      typeof node.value === "boolean" ||
      node.value === null
    ) {
      return node.value;
    }

    return undefined;
  }

  if (node.type === "TemplateLiteral") {
    if ((node.expressions?.length ?? 0) === 0 && node.quasis?.length === 1) {
      return node.quasis[0]?.value?.cooked ?? node.quasis[0]?.value?.raw ?? "";
    }

    return undefined;
  }

  if (node.type === "UnaryExpression" && node.operator === "-") {
    const argumentValue = readStaticValueFromExpression(node.argument);
    return typeof argumentValue === "number" ? -argumentValue : undefined;
  }

  if (node.type === "ArrayExpression") {
    const values = [];
    for (const element of node.elements ?? []) {
      const item = readStaticValueFromExpression(element);
      if (
        item === undefined ||
        (typeof item === "object" && item !== null && !Array.isArray(item))
      ) {
        return undefined;
      }
      values.push(item);
    }
    return values;
  }

  if (node.type === "ObjectExpression") {
    const record = {};

    for (const property of node.properties ?? []) {
      if (property?.type !== "Property" || property.kind !== "init") {
        return undefined;
      }

      const key = readObjectPropertyKey(property.key, property.computed === true);
      if (!key) {
        return undefined;
      }

      const value = readStaticValueFromExpression(property.value);
      if (value === undefined) {
        return undefined;
      }

      record[key] = value;
    }

    return record;
  }

  return undefined;
}

function readObjectPropertyKey(node, computed) {
  const keyNode = unwrapExpression(node);
  if (!keyNode) {
    return null;
  }

  if (!computed && keyNode.type === "Identifier") {
    return keyNode.name;
  }

  if (keyNode.type === "Literal" && typeof keyNode.value === "string") {
    return keyNode.value;
  }

  return null;
}

function unwrapExpression(node) {
  let current = node ?? null;

  while (current) {
    if (
      current.type === "ParenthesizedExpression" ||
      current.type === "TSAsExpression" ||
      current.type === "TSSatisfiesExpression" ||
      current.type === "TSNonNullExpression" ||
      current.type === "TSTypeAssertion"
    ) {
      current = current.expression;
      continue;
    }

    return current;
  }

  return null;
}

function isReactiveReadReference(node, parents) {
  const parent = parents.at(-1) ?? null;
  if (!parent) {
    return false;
  }

  if (
    parent.type === "VariableDeclarator" &&
    parent.id === node
  ) {
    return false;
  }

  if (
    parent.type === "ArrayPattern" ||
    parent.type === "ObjectPattern" ||
    parent.type === "ImportSpecifier" ||
    parent.type === "FunctionDeclaration" ||
    parent.type === "FunctionExpression" ||
    parent.type === "ArrowFunctionExpression"
  ) {
    return false;
  }

  if (
    parent.type === "MemberExpression" &&
    parent.property === node &&
    parent.computed !== true
  ) {
    return false;
  }

  return true;
}

function parentNodeIsStateCall(node, parents) {
  const parent = parents.at(-1) ?? null;
  return parent?.type === "CallExpression" && parent.callee === node;
}

function determineReactiveScope(parents) {
  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const node = parents[index];

    if (isEventHandlerFunction(node, parents[index - 1] ?? null)) {
      return "event";
    }

    if (
      node?.type === "FunctionDeclaration" ||
      node?.type === "FunctionExpression" ||
      node?.type === "ArrowFunctionExpression"
    ) {
      return "render";
    }
  }

  return "other";
}

function isEventHandlerFunction(node, parent) {
  if (
    node?.type !== "FunctionExpression" &&
    node?.type !== "ArrowFunctionExpression"
  ) {
    return false;
  }

  if (parent?.type !== "Property") {
    return false;
  }

  const keyNode = unwrapExpression(parent.key);
  if (!keyNode) {
    return false;
  }

  const keyName = keyNode.type === "Identifier"
    ? keyNode.name
    : keyNode.type === "Literal" && typeof keyNode.value === "string"
      ? keyNode.value
      : null;

  return typeof keyName === "string" && /^on[A-Z]/.test(keyName);
}

function dedupeBySignature(items, getSignature) {
  const unique = [];
  const seen = new Set();

  for (const item of items) {
    const signature = getSignature(item);
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    unique.push(item);
  }

  return unique;
}

function readTextBinding(expression, definitions, componentIndex) {
  const node = unwrapExpression(expression);
  if (node?.type !== "TemplateLiteral") {
    return null;
  }

  if ((node.expressions?.length ?? 0) !== 1 || (node.quasis?.length ?? 0) !== 2) {
    return null;
  }

  const expressionNode = unwrapExpression(node.expressions[0]);
  if (!isReactiveIdentifierCall(expressionNode, definitions)) {
    return null;
  }

  return {
    component: "Text",
    index: componentIndex,
    target: "text.content",
    stateId: expressionNode.callee.name,
    prefix: node.quasis[0]?.value?.cooked ?? "",
    suffix: node.quasis[1]?.value?.cooked ?? ""
  };
}

function readButtonEventBinding(expression, actions, componentIndex) {
  const node = unwrapExpression(expression);
  if (node?.type !== "ObjectExpression") {
    return null;
  }

  for (const property of node.properties ?? []) {
    if (property?.type !== "Property" || property.kind !== "init") {
      continue;
    }

    const keyName = readPropertyName(property.key, property.computed === true);
    if (keyName !== "onPress") {
      continue;
    }

    const handler = unwrapExpression(property.value);
    const action = findActionForHandler(handler, actions);
    if (!action) {
      return null;
    }

    return {
      component: "Button",
      index: componentIndex,
      target: "button.onPress",
      eventName: "onPress",
      actionId: action.id,
      stateId: action.stateId
    };
  }

  return null;
}

function readJsxTextBinding(node, definitions, componentIndex) {
  const parts = [];
  let stateId = null;

  for (const child of node.children ?? []) {
    if (child?.type === "JSXText") {
      const textValue = normalizeJsxTextValue(child.value ?? "");
      if (textValue) {
        parts.push({ kind: "text", value: textValue });
      }
      continue;
    }

    if (child?.type !== "JSXExpressionContainer") {
      return null;
    }

    const expressionNode = unwrapExpression(child.expression);
    if (!expressionNode) {
      continue;
    }

    if (!isReactiveIdentifierCall(expressionNode, definitions)) {
      return null;
    }

    if (stateId) {
      return null;
    }

    stateId = expressionNode.callee.name;
    parts.push({ kind: "state", value: stateId });
  }

  if (!stateId) {
    return null;
  }

  const stateIndex = parts.findIndex((part) => part.kind === "state");
  const prefix = parts.slice(0, stateIndex).map((part) => part.value).join(" ").trim();
  const suffix = parts.slice(stateIndex + 1).map((part) => part.value).join(" ").trim();

  return {
    component: "Text",
    index: componentIndex,
    target: "text.content",
    stateId,
    prefix,
    suffix
  };
}

function readJsxButtonEventBinding(node, actions, componentIndex) {
  for (const attribute of node.openingElement?.attributes ?? []) {
    if (attribute?.type !== "JSXAttribute") {
      continue;
    }

    const attributeName = readJsxTagName(attribute.name);
    if (normalizeEventPropName(attributeName) !== "onPress") {
      continue;
    }

    if (attribute.value?.type !== "JSXExpressionContainer") {
      return null;
    }

    const action = findActionForHandler(
      unwrapExpression(attribute.value.expression),
      actions
    );

    if (!action) {
      return null;
    }

    return {
      component: "Button",
      index: componentIndex,
      target: "button.onPress",
      eventName: "onPress",
      actionId: action.id,
      stateId: action.stateId
    };
  }

  return null;
}

function findActionForHandler(handler, actions) {
  if (
    handler?.type !== "ArrowFunctionExpression" &&
    handler?.type !== "FunctionExpression"
  ) {
    return null;
  }

  let matchedAction = null;
  walkAst(handler.body, (node) => {
    if (matchedAction || node?.type !== "CallExpression") {
      return;
    }

    const callee = unwrapExpression(node.callee);
    if (callee?.type !== "Identifier") {
      return;
    }

    matchedAction = actions.find((action) => action.setter === callee.name) ?? null;
  });

  return matchedAction;
}

function isStateGetterCall(node, stateId) {
  const expressionNode = unwrapExpression(node);
  return (
    expressionNode?.type === "CallExpression" &&
    expressionNode.callee?.type === "Identifier" &&
    expressionNode.callee.name === stateId
  );
}

function isReactiveIdentifierCall(node, definitions) {
  const expressionNode = unwrapExpression(node);
  return (
    expressionNode?.type === "CallExpression" &&
    expressionNode.callee?.type === "Identifier" &&
    definitions.some((definition) => definition.id === expressionNode.callee.name)
  );
}

function readPropertyName(node, computed) {
  const keyNode = unwrapExpression(node);
  if (!keyNode) {
    return null;
  }

  if (!computed && keyNode.type === "Identifier") {
    return keyNode.name;
  }

  if (keyNode.type === "Literal" && typeof keyNode.value === "string") {
    return keyNode.value;
  }

  return null;
}

function walkAst(node, visit, parents = []) {
  if (!node || typeof node !== "object") {
    return;
  }

  visit(node, parents);

  if (Array.isArray(node)) {
    for (const item of node) {
      walkAst(item, visit, parents);
    }
    return;
  }

  for (const value of Object.values(node)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walkAst(item, visit, [...parents, node]);
      }
      continue;
    }

    walkAst(value, visit, [...parents, node]);
  }
}

async function createModuleLoweringContext(program, sourcePath, cache = new Map()) {
  const functions = new Map();
  const importedFunctions = new Map();
  const contexts = new Map();

  for (const node of program.body ?? []) {
    if (node?.type === "ImportDeclaration") {
      continue;
    }

    if (node?.type === "FunctionDeclaration" && node.id?.type === "Identifier") {
      functions.set(node.id.name, node);
      continue;
    }

    if (node?.type !== "VariableDeclaration") {
      continue;
    }

    for (const declaration of node.declarations ?? []) {
      if (declaration?.id?.type !== "Identifier") {
        continue;
      }

      const initializer = unwrapExpression(declaration.init);
      if (
        initializer?.type === "CallExpression" &&
        initializer.callee?.type === "Identifier" &&
        initializer.callee.name === "createContext"
      ) {
        contexts.set(
          declaration.id.name,
          readExpressionValue(initializer.arguments?.[0], {
            props: {},
            locals: {},
            contexts: {},
            contextDefinitions: {}
          })
        );
        continue;
      }

      if (
        initializer?.type === "ArrowFunctionExpression" ||
        initializer?.type === "FunctionExpression"
      ) {
        functions.set(declaration.id.name, initializer);
      }
    }
  }

  for (const node of program.body ?? []) {
    if (node?.type !== "ImportDeclaration") {
      continue;
    }

    const moduleName = node.source?.value;
    if (typeof moduleName !== "string" || !moduleName.startsWith(".")) {
      continue;
    }

    const resolvedPath = await resolveModuleImport(sourcePath, moduleName);
    if (!resolvedPath) {
      continue;
    }

    const importedContext = await loadModuleContext(resolvedPath, cache);
    for (const specifier of node.specifiers ?? []) {
      if (specifier?.type === "ImportDefaultSpecifier") {
        const exportedDefault = resolveDefaultExportDeclaration(importedContext.program, importedContext);
        if (exportedDefault && specifier.local?.type === "Identifier") {
          importedFunctions.set(specifier.local.name, exportedDefault);
        }
        continue;
      }

      if (specifier?.type !== "ImportSpecifier" || specifier.local?.type !== "Identifier") {
        continue;
      }

      const importedName = specifier.imported?.type === "Identifier"
        ? specifier.imported.name
        : typeof specifier.imported?.value === "string"
          ? specifier.imported.value
          : null;
      if (!importedName) {
        continue;
      }

      const importedFunction = importedContext.functions.has(importedName)
        ? { node: importedContext.functions.get(importedName), context: importedContext }
        : importedContext.importedFunctions.get(importedName);
      if (importedFunction) {
        importedFunctions.set(specifier.local.name, importedFunction);
      }

      if (importedContext.contexts.has(importedName)) {
        contexts.set(specifier.local.name, importedContext.contexts.get(importedName));
      }
    }
  }

  return { functions, importedFunctions, contexts, program, sourcePath };
}

async function loadModuleContext(sourcePath, cache) {
  const normalizedPath = path.resolve(sourcePath);
  if (cache.has(normalizedPath)) {
    return cache.get(normalizedPath);
  }

  const sourceText = await fs.readFile(normalizedPath, "utf8");
  const parseResult = parseSync(normalizedPath, sourceText, {
    lang: normalizedPath.endsWith(".ts") && !normalizedPath.endsWith(".tsx") ? "ts" : "tsx",
    sourceType: "module",
    astType: "ts"
  });

  const context = await createModuleLoweringContext(parseResult.program, normalizedPath, cache);
  cache.set(normalizedPath, context);
  return context;
}

async function resolveModuleImport(fromPath, moduleName) {
  const basePath = path.resolve(path.dirname(fromPath), moduleName);
  const candidates = [
    basePath,
    `${basePath}.tsx`,
    `${basePath}.ts`,
    `${basePath}.jsx`,
    `${basePath}.js`,
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.jsx"),
    path.join(basePath, "index.js")
  ];

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {}
  }

  return null;
}

function resolveFunctionBinding(context, name) {
  const localNode = context.functions.get(name);
  if (localNode) {
    return { node: localNode, context };
  }

  return context.importedFunctions.get(name) ?? null;
}

function resolveDefaultExportDeclaration(program, context) {
  for (const node of program.body ?? []) {
    if (node?.type !== "ExportDefaultDeclaration") {
      continue;
    }

    const declaration = unwrapExpression(node.declaration);
    if (
      declaration?.type === "FunctionDeclaration" ||
      declaration?.type === "FunctionExpression" ||
      declaration?.type === "ArrowFunctionExpression"
    ) {
      return { node: declaration, context };
    }

    if (declaration?.type === "Identifier") {
      return resolveFunctionBinding(context, declaration.name);
    }
  }

  return null;
}

function lowerFunctionLikeNode(node, scope, context, irFactory) {
  const workingScope = {
    props: buildScopeFromParams(node.params?.[0], scope.props),
    locals: { ...(scope.locals ?? {}) },
    contexts: { ...(scope.contexts ?? {}) },
    contextDefinitions: { ...(scope.contextDefinitions ?? {}) }
  };

  for (const [contextName, defaultValue] of context.contexts ?? []) {
    if (!(contextName in workingScope.contextDefinitions)) {
      workingScope.contextDefinitions[contextName] = defaultValue;
    }
  }

  if (node.body?.type === "BlockStatement") {
    for (const statement of node.body.body ?? []) {
      if (statement?.type === "VariableDeclaration") {
        collectLocalBindings(statement, workingScope);
        continue;
      }

      if (statement?.type === "ExpressionStatement") {
        applyHookExpression(statement.expression, workingScope);
        continue;
      }

      if (statement?.type === "ReturnStatement") {
        return lowerExpressionToIR(statement.argument, workingScope, context, irFactory);
      }
    }

    return null;
  }

  return lowerExpressionToIR(node.body, workingScope, context, irFactory);
}

function buildScopeFromParams(parameterNode, incomingProps) {
  if (!parameterNode) {
    return incomingProps ?? {};
  }

  if (parameterNode.type === "Identifier") {
    return {
      ...(incomingProps ?? {}),
      [parameterNode.name]: incomingProps ?? {}
    };
  }

  if (parameterNode.type === "ObjectPattern") {
    const output = {};
    for (const property of parameterNode.properties ?? []) {
      if (property?.type !== "Property") {
        continue;
      }

      const propertyName = readPropertyName(property.key, property.computed === true);
      if (!propertyName) {
        continue;
      }

      const value = incomingProps?.[propertyName];
      if (property.value?.type === "Identifier") {
        output[property.value.name] = value;
      }
    }

    return output;
  }

  return incomingProps ?? {};
}

function collectLocalBindings(statement, scope) {
  for (const declaration of statement.declarations ?? []) {
    const initializer = unwrapExpression(declaration.init);

    const tuple = readReactiveTuplePattern(declaration?.id);
    if (
      tuple &&
      initializer?.type === "CallExpression" &&
      initializer.callee?.type === "Identifier" &&
      initializer.callee.name === "useReactive"
    ) {
      const initialValue = readExpressionValue(initializer.arguments?.[0], scope);
      scope.locals[tuple.id] = initialValue;
      scope.locals[tuple.setter] = { kind: "reactive-setter", target: tuple.id };
      continue;
    }

    if (declaration?.id?.type !== "Identifier") {
      continue;
    }

    const value = readExpressionValue(initializer, scope);
    if (value !== undefined) {
      scope.locals[declaration.id.name] = value;
    }
  }
}

function lowerExpressionToIR(expression, scope, context, irFactory) {
  const node = unwrapExpression(expression);
  if (!node) {
    return null;
  }

  if (node.type === "JSXElement") {
    return lowerJsxElement(node, scope, context, irFactory);
  }

  if (node.type === "JSXFragment") {
    return irFactory.createIRFragment(
      lowerJsxChildren(node.children, scope, context, irFactory)
    );
  }

  if (node.type === "ArrayExpression") {
    return irFactory.createIRFragment(
      (node.elements ?? [])
        .map((element) => lowerExpressionToIR(element, scope, context, irFactory))
        .filter((child) => child !== null)
    );
  }

  const staticValue = readExpressionValue(node, scope);
  if (typeof staticValue === "string" || typeof staticValue === "number" || typeof staticValue === "boolean") {
    return irFactory.createIRText(String(staticValue));
  }

  if (staticValue === null) {
    return null;
  }

  if (node.type === "CallExpression") {
    return lowerCallExpression(node, scope, context, irFactory);
  }

  return irFactory.createIRDynamic(`expression:${node.type}`);
}

function lowerJsxElement(node, scope, context, irFactory) {
  const tagName = readJsxTagName(node.openingElement?.name);
  if (!tagName) {
    return irFactory.createIRDynamic("jsx:unknown-tag");
  }

  if (/^[A-Z]/.test(tagName)) {
    const localComponent = resolveFunctionBinding(context, tagName);
    if (localComponent) {
      const componentProps = readJsxProps(node.openingElement?.attributes ?? [], scope);
      if ((node.children?.length ?? 0) > 0) {
        componentProps.children = lowerJsxChildren(node.children, scope, context, irFactory);
      }
      return lowerFunctionLikeNode(
        localComponent.node,
        { props: componentProps, locals: {}, contexts: scope.contexts, contextDefinitions: scope.contextDefinitions },
        localComponent.context,
        irFactory
      );
    }
  }

  const semanticTag = mapIntrinsicToSemanticTag(tagName);
  const props = readJsxProps(node.openingElement?.attributes ?? [], scope);
  const children = lowerJsxChildren(node.children ?? [], scope, context, irFactory);
  const flattenedChildren = children.flatMap((child) =>
    child.kind === "fragment" ? child.children : [child]
  );

  if (semanticTag === "heading") {
    props.level = headingLevelFromTag(tagName);
  }

  if (semanticTag === "link" && props.href && !props.label) {
    const label = extractTextFromIRChildren(flattenedChildren);
    if (label) {
      props.label = label;
    }
  }

  if (semanticTag === "button" && !props.label) {
    const label = extractTextFromIRChildren(flattenedChildren);
    if (label) {
      props.label = label;
    }
  }

  return irFactory.createIRElement(semanticTag, props, flattenedChildren);
}

function lowerJsxChildren(children, scope, context, irFactory) {
  const lowered = [];

  for (const child of children ?? []) {
    if (!child) {
      continue;
    }

    if (child.type === "JSXText") {
      const value = normalizeJsxTextValue(child.value ?? "");
      if (value) {
        lowered.push(irFactory.createIRText(value));
      }
      continue;
    }

    if (child.type === "JSXExpressionContainer") {
      const expressionNode = unwrapExpression(child.expression);
      if (!expressionNode || expressionNode.type === "JSXEmptyExpression") {
        continue;
      }

      const loweredExpression = lowerExpressionToIR(expressionNode, scope, context, irFactory);
      if (loweredExpression) {
        lowered.push(loweredExpression);
      }
      continue;
    }

    if (child.type === "JSXElement") {
      const loweredElement = lowerJsxElement(child, scope, context, irFactory);
      if (loweredElement) {
        lowered.push(loweredElement);
      }
      continue;
    }

    if (child.type === "JSXFragment") {
      lowered.push(
        irFactory.createIRFragment(
          lowerJsxChildren(child.children ?? [], scope, context, irFactory)
        )
      );
    }
  }

  return lowered;
}

function lowerCallExpression(node, scope, context, irFactory) {
  const callee = unwrapExpression(node.callee);
  if (callee?.type === "Identifier" && callee.name === "createElement") {
    return lowerCreateElementCall(node, scope, context, irFactory);
  }

  if (callee?.type !== "Identifier") {
    return irFactory.createIRDynamic("call:unsupported");
  }

  if (callee.name === "render") {
    return lowerExpressionToIR(node.arguments?.[0], scope, context, irFactory);
  }

  if (callee.name === "AppBar") {
    return lowerAppBarCall(node, scope, context, irFactory);
  }

  const localComponent = resolveFunctionBinding(context, callee.name);
  if (localComponent) {
    const componentProps = readCallComponentProps(node.arguments ?? [], scope, context, irFactory);
    return lowerFunctionLikeNode(
      localComponent.node,
      { props: componentProps, locals: {}, contexts: scope.contexts, contextDefinitions: scope.contextDefinitions },
      localComponent.context,
      irFactory
    );
  }

  const semanticTag = mapComponentCallToSemanticTag(callee.name);
  if (!semanticTag) {
    return irFactory.createIRDynamic(`call:${callee.name}`);
  }

  const { props, children } = readSemanticCall(node, semanticTag, scope, context, irFactory);
  return irFactory.createIRElement(semanticTag, props, children);
}

function lowerCreateElementCall(node, scope, context, irFactory) {
  const [typeNode, propsNode, ...childNodes] = node.arguments ?? [];
  const resolvedTypeNode = unwrapExpression(typeNode);

  if (!resolvedTypeNode) {
    return irFactory.createIRDynamic("createElement:missing-type");
  }

  if (
    resolvedTypeNode.type === "MemberExpression" &&
    resolvedTypeNode.object?.type === "Identifier" &&
    readMemberPropertyName(resolvedTypeNode) === "Provider"
  ) {
    return lowerContextProvider(
      resolvedTypeNode.object.name,
      propsNode,
      childNodes,
      scope,
      context,
      irFactory
    );
  }

  if (resolvedTypeNode.type === "Literal" && typeof resolvedTypeNode.value === "string") {
    return lowerCreateElementIntrinsic(
      resolvedTypeNode.value,
      propsNode,
      childNodes,
      scope,
      context,
      irFactory
    );
  }

  if (resolvedTypeNode.type === "Identifier") {
    if (resolvedTypeNode.name === "Fragment") {
      return irFactory.createIRFragment(
        childNodes.flatMap((childNode) => lowerExpressionToChildren(childNode, scope, context, irFactory))
      );
    }

    const component = resolveFunctionBinding(context, resolvedTypeNode.name);
    if (component) {
      const componentProps = readCreateElementProps(propsNode, childNodes, scope, context, irFactory);
      return lowerFunctionLikeNode(
        component.node,
        {
          props: componentProps,
          locals: {},
          contexts: scope.contexts,
          contextDefinitions: scope.contextDefinitions
        },
        component.context,
        irFactory
      );
    }
  }

  const fallbackHint = resolvedTypeNode.type === "Identifier"
    ? `createElement:${resolvedTypeNode.type}:${resolvedTypeNode.name}`
    : `createElement:${resolvedTypeNode.type}`;
  return irFactory.createIRDynamic(fallbackHint);
}

function lowerContextProvider(contextName, propsNode, childNodes, scope, context, irFactory) {
  const providerProps = readCreateElementProps(propsNode, childNodes, scope, context, irFactory);
  const nextScope = {
    ...scope,
    contexts: {
      ...(scope.contexts ?? {}),
      [contextName]: providerProps.value ?? scope.contextDefinitions?.[contextName] ?? null
    }
  };
  const children = providerProps.children ?? childNodes.flatMap((childNode) =>
    lowerExpressionToChildren(childNode, nextScope, context, irFactory)
  );

  if (Array.isArray(children)) {
    return irFactory.createIRFragment(children);
  }

  return children ?? null;
}

function lowerCreateElementIntrinsic(tagName, propsNode, childNodes, scope, context, irFactory) {
  const semanticTag = mapIntrinsicToSemanticTag(tagName);
  const props = readCreateElementProps(propsNode, childNodes, scope, context, irFactory);
  const children = Array.isArray(props.children)
    ? props.children
    : childNodes.flatMap((childNode) => lowerExpressionToChildren(childNode, scope, context, irFactory));
  delete props.children;
  const flattenedChildren = children.flatMap((child) => child.kind === "fragment" ? child.children : [child]);

  if (semanticTag === "heading") {
    props.level = headingLevelFromTag(tagName);
  }

  if (semanticTag === "link" && props.href && !props.label) {
    const label = extractTextFromIRChildren(flattenedChildren);
    if (label) props.label = label;
  }

  if (semanticTag === "button" && !props.label) {
    const label = extractTextFromIRChildren(flattenedChildren);
    if (label) props.label = label;
  }

  return irFactory.createIRElement(semanticTag, props, flattenedChildren);
}

function readCreateElementProps(propsNode, childNodes, scope, context, irFactory) {
  const props = {};
  const resolvedPropsNode = unwrapExpression(propsNode);
  if (resolvedPropsNode?.type === "ObjectExpression") {
    Object.assign(props, readObjectExpressionProps(resolvedPropsNode, scope));
  }

  if (childNodes.length > 0) {
    props.children = childNodes.flatMap((childNode) =>
      lowerExpressionToChildren(childNode, scope, context, irFactory)
    );
  }

  return props;
}

function lowerAppBarCall(node, scope, context, irFactory) {
  const propsArgument = unwrapExpression(node.arguments?.[0]);
  const styleArgument = unwrapExpression(node.arguments?.[1]);

  if (propsArgument?.type !== "ObjectExpression") {
    return irFactory.createIRDynamic("call:AppBar");
  }

  const appBarProps = readObjectExpressionProps(propsArgument, scope);
  const styleProps = styleArgument?.type === "ObjectExpression"
    ? readStyleObjectExpression(styleArgument, scope)
    : {};

  const leadingChildren = readFactoryChildrenFromObjectProperty(
    propsArgument,
    "leading",
    scope,
    context,
    irFactory
  );
  const actionChildren = readFactoryChildrenFromObjectProperty(
    propsArgument,
    "actions",
    scope,
    context,
    irFactory
  );

  const titleChildren = [
    irFactory.createIRElement("text", { className: "muted" }, [
      irFactory.createIRText("Adaptive UI")
    ]),
    irFactory.createIRElement("heading", { level: 2 }, [
      irFactory.createIRText(String(appBarProps.title ?? "App Bar"))
    ])
  ];

  if (typeof appBarProps.subtitle === "string" && appBarProps.subtitle.trim()) {
    titleChildren.push(
      irFactory.createIRElement("text", { className: "muted" }, [
        irFactory.createIRText(appBarProps.subtitle)
      ])
    );
  }

  return irFactory.createIRElement(
    "surface",
    {
      ...omitKeys(appBarProps, ["title", "subtitle", "leading", "actions"]),
      padding: appBarProps.padding ?? 20,
      style: {
        border: "1px solid rgba(28, 26, 23, 0.08)",
        borderRadius: "18px",
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(6px)",
        ...styleProps
      }
    },
    [
      irFactory.createIRElement(
        "row",
        {
          style: {
            alignItems: "center",
            justifyContent: "space-between"
          }
        },
        [
          ...leadingChildren,
          irFactory.createIRElement(
            "column",
            { style: { flex: 1 } },
            titleChildren
          ),
          ...actionChildren
        ]
      )
    ]
  );
}

function readCallComponentProps(argumentsNodes, scope, context, irFactory) {
  const props = {};

  if ((argumentsNodes?.length ?? 0) > 0) {
    const firstArgument = unwrapExpression(argumentsNodes[0]);
    if (firstArgument?.type === "ObjectExpression") {
      Object.assign(props, readObjectExpressionProps(firstArgument, scope));
    } else {
      props.children = lowerExpressionToIR(firstArgument, scope, context, irFactory);
    }
  }

  if ((argumentsNodes?.length ?? 1) > 1) {
    const secondArgument = unwrapExpression(argumentsNodes[1]);
    if (secondArgument?.type === "ObjectExpression") {
      Object.assign(props, readObjectExpressionProps(secondArgument, scope));
    }
  }

  return props;
}

function readSemanticCall(node, semanticTag, scope, context, irFactory) {
  const props = {};
  const children = [];
  const args = node.arguments ?? [];

  if (semanticTag === "text" || semanticTag === "heading" || semanticTag === "link" || semanticTag === "button") {
    const labelValue = readExpressionValue(args[0], scope);
    if (labelValue !== undefined && labelValue !== null) {
      const text = String(labelValue);
      if (semanticTag === "link" || semanticTag === "button") {
        props.label = text;
      } else {
        children.push(irFactory.createIRText(text));
      }
    } else {
      const lowered = lowerExpressionToIR(args[0], scope, context, irFactory);
      if (lowered) {
        children.push(lowered);
      }
    }
  } else {
    const bodyArgument = unwrapExpression(args[0]);
    const loweredChildren = lowerExpressionToChildren(bodyArgument, scope, context, irFactory);
    children.push(...loweredChildren);
  }

  const propsArgumentIndex = semanticTag === "text" || semanticTag === "heading" || semanticTag === "link" || semanticTag === "button"
    ? 1
    : 1;
  const propsArgument = unwrapExpression(args[propsArgumentIndex]);
  if (propsArgument?.type === "ObjectExpression") {
    Object.assign(props, readObjectExpressionProps(propsArgument, scope));
  }

  const styleArgument = unwrapExpression(args[2]);
  if (styleArgument?.type === "ObjectExpression") {
    props.style = readStyleObjectExpression(styleArgument, scope);
  }

  if (semanticTag === "heading" && props.level == null) {
    props.level = 2;
  }

  return { props, children };
}

function lowerExpressionToChildren(node, scope, context, irFactory) {
  const expressionNode = unwrapExpression(node);
  if (!expressionNode) {
    return [];
  }

  if (
    expressionNode.type === "ArrowFunctionExpression" ||
    expressionNode.type === "FunctionExpression"
  ) {
    const lowered = lowerFunctionLikeNode(
      expressionNode,
      {
        props: scope.props,
        locals: { ...(scope.locals ?? {}) },
        contexts: { ...(scope.contexts ?? {}) },
        contextDefinitions: { ...(scope.contextDefinitions ?? {}) }
      },
      context,
      irFactory
    );
    if (!lowered) {
      return [];
    }
    return lowered.kind === "fragment" ? lowered.children : [lowered];
  }

  const lowered = lowerExpressionToIR(expressionNode, scope, context, irFactory);
  if (!lowered) {
    return [];
  }

  return lowered.kind === "fragment" ? lowered.children : [lowered];
}

function readJsxProps(attributes, scope) {
  const props = {};

  for (const attribute of attributes ?? []) {
    if (attribute?.type !== "JSXAttribute") {
      continue;
    }

    const propName = normalizeEventPropName(readJsxTagName(attribute.name));
    if (!propName) {
      continue;
    }

    if (!attribute.value) {
      props[propName] = true;
      continue;
    }

    if (attribute.value.type === "Literal") {
      props[propName] = attribute.value.value;
      continue;
    }

    if (attribute.value.type === "JSXExpressionContainer") {
      const expressionValue = readExpressionValue(attribute.value.expression, scope);
      if (expressionValue !== undefined) {
        props[propName] = expressionValue;
      } else if (/^on[A-Z]/.test(propName)) {
        props[propName] = { kind: "event", name: propName };
      } else {
        props[propName] = { kind: "dynamic", hint: `prop:${propName}` };
      }
    }
  }

  return props;
}

function readObjectExpressionProps(node, scope) {
  const props = {};

  for (const property of node.properties ?? []) {
    if (property?.type !== "Property" || property.kind !== "init") {
      continue;
    }

    const propName = normalizeEventPropName(readPropertyName(property.key, property.computed === true));
    if (!propName) {
      continue;
    }

    const propValue = readExpressionValue(property.value, scope);
    if (propValue !== undefined) {
      props[propName] = propValue;
    } else if (/^on[A-Z]/.test(propName)) {
      props[propName] = { kind: "event", name: propName };
    } else {
      props[propName] = { kind: "dynamic", hint: `prop:${propName}` };
    }
  }

  return props;
}

function readStyleObjectExpression(node, scope) {
  const style = {};

  for (const property of node.properties ?? []) {
    if (property?.type !== "Property" || property.kind !== "init") {
      continue;
    }

    const styleName = readStylePropertyName(property.key, property.computed === true, scope);
    if (!styleName) {
      continue;
    }

    const value = readExpressionValue(property.value, scope);
    if (value !== undefined) {
      style[styleName] = value;
    }
  }

  return style;
}

function readFactoryChildrenFromObjectProperty(
  objectNode,
  propertyName,
  scope,
  context,
  irFactory
) {
  const property = (objectNode.properties ?? []).find((candidate) => {
    if (candidate?.type !== "Property" || candidate.kind !== "init") {
      return false;
    }
    return readPropertyName(candidate.key, candidate.computed === true) === propertyName;
  });

  if (!property) {
    return [];
  }

  return lowerExpressionToChildren(property.value, scope, context, irFactory);
}

function applyHookExpression(expression, scope) {
  const node = unwrapExpression(expression);
  if (node?.type !== "CallExpression" || node.callee?.type !== "Identifier") {
    return;
  }

  if (!["useEffect", "useLayoutEffect"].includes(node.callee.name)) {
    return;
  }

  const callback = unwrapExpression(node.arguments?.[0]);
  if (
    callback?.type !== "ArrowFunctionExpression" &&
    callback?.type !== "FunctionExpression"
  ) {
    return;
  }

  applyEffectBody(callback.body, scope);
}

function applyEffectBody(body, scope) {
  const statementNodes = body?.type === "BlockStatement"
    ? body.body ?? []
    : [{ type: "ExpressionStatement", expression: body }];

  for (const statement of statementNodes) {
    if (statement?.type !== "ExpressionStatement") {
      continue;
    }

    const expression = unwrapExpression(statement.expression);
    if (expression?.type !== "CallExpression" || expression.callee?.type !== "Identifier") {
      continue;
    }

    const setterMeta = scope.locals?.[expression.callee.name];
    if (!setterMeta || setterMeta.kind !== "reactive-setter") {
      continue;
    }

    const nextValue = applyReactiveSetterExpression(scope.locals[setterMeta.target], expression.arguments?.[0], scope);
    if (nextValue !== undefined) {
      scope.locals[setterMeta.target] = nextValue;
    }
  }
}

function applyReactiveSetterExpression(currentValue, expression, scope) {
  const resolved = unwrapExpression(expression);
  const staticValue = readExpressionValue(resolved, scope);
  if (staticValue !== undefined) {
    return staticValue;
  }

  if (
    resolved?.type === "ArrowFunctionExpression" &&
    resolved.params?.[0]?.type === "Identifier"
  ) {
    const innerScope = {
      ...scope,
      locals: {
        ...(scope.locals ?? {}),
        [resolved.params[0].name]: currentValue
      }
    };
    return readExpressionValue(resolved.body, innerScope);
  }

  return undefined;
}

function readExpressionValue(expression, scope) {
  const node = unwrapExpression(expression);
  if (!node) {
    return undefined;
  }

  if (node.type === "Literal") {
    return node.value;
  }

  if (node.type === "TemplateLiteral") {
    if ((node.expressions?.length ?? 0) === 0) {
      return node.quasis?.map((quasi) => quasi.value?.cooked ?? quasi.value?.raw ?? "").join("") ?? "";
    }

    let output = "";
    for (let index = 0; index < (node.quasis?.length ?? 0); index += 1) {
      output += node.quasis[index]?.value?.cooked ?? node.quasis[index]?.value?.raw ?? "";
      if (index < (node.expressions?.length ?? 0)) {
        const expressionValue = readExpressionValue(node.expressions[index], scope);
        if (expressionValue === undefined) {
          return undefined;
        }
        output += String(expressionValue);
      }
    }
    return output;
  }

  if (node.type === "Identifier") {
    if (node.name in (scope.locals ?? {})) {
      return scope.locals[node.name];
    }
    if (node.name in (scope.props ?? {})) {
      return scope.props[node.name];
    }
    return undefined;
  }

  if (node.type === "CallExpression") {
    const platformValue = readPlatformApiCallValue(node);
    if (platformValue !== undefined) {
      return platformValue;
    }

    if (node.callee?.type === "Identifier") {
      if (node.callee.name === "useContext") {
        const contextArgument = unwrapExpression(node.arguments?.[0]);
        if (contextArgument?.type === "Identifier") {
          const value = scope.contexts?.[contextArgument.name]
            ?? scope.contextDefinitions?.[contextArgument.name];
          if (value !== undefined) {
            return { current: value };
          }
        }
      }

      if (
        node.arguments?.length === 0 &&
        node.callee.name in (scope.locals ?? {}) &&
        !scope.locals[node.callee.name]?.kind
      ) {
        return scope.locals[node.callee.name];
      }
    }
  }

  if (isMemberExpressionNode(node)) {
    const target = readExpressionValue(node.object, scope);
    const property = readMemberPropertyName(node);
    if (target && typeof target === "object" && property) {
      return target[property];
    }
    return undefined;
  }

  if (node.type === "ObjectExpression") {
    return readStaticObjectLiteral(node, scope);
  }

  if (node.type === "ArrayExpression") {
    return (node.elements ?? []).map((element) => readExpressionValue(element, scope));
  }

  if (node.type === "UnaryExpression" && node.operator === "-") {
    const value = readExpressionValue(node.argument, scope);
    return typeof value === "number" ? -value : undefined;
  }

  return undefined;
}

function readStaticObjectLiteral(node, scope) {
  const output = {};

  for (const property of node.properties ?? []) {
    if (property?.type !== "Property" || property.kind !== "init") {
      return undefined;
    }

    const key = readPropertyName(property.key, property.computed === true);
    if (!key) {
      return undefined;
    }

    const value = readExpressionValue(property.value, scope);
    if (value === undefined) {
      return undefined;
    }

    output[key] = value;
  }

  return output;
}

function readMemberPropertyName(node) {
  if (!node) {
    return null;
  }

  if (node.type === "StaticMemberExpression") {
    return node.property?.name ?? null;
  }

  const propertyNode = unwrapExpression(node.property);
  if (!propertyNode) {
    return null;
  }

  if (node.computed === true || node.type === "ComputedMemberExpression") {
    const computedValue = readExpressionValue(propertyNode, { props: {}, locals: {} });
    return typeof computedValue === "string" ? computedValue : null;
  }

  if (propertyNode.type === "Identifier") {
    return propertyNode.name;
  }

  if (propertyNode.type === "Literal" && typeof propertyNode.value === "string") {
    return propertyNode.value;
  }

  return null;
}

function readStylePropertyName(node, computed, scope) {
  const keyNode = unwrapExpression(node);
  if (!keyNode) {
    return null;
  }

  if (!computed) {
    return readPropertyName(keyNode, false);
  }

  if (
    isMemberExpressionNode(keyNode) &&
    readMemberObjectIdentifier(keyNode) === "Style"
  ) {
    const propertyName = readMemberPropertyName(keyNode);
    return propertyName;
  }

  const computedValue = readExpressionValue(keyNode, scope);
  return typeof computedValue === "string" ? computedValue : null;
}

function readPlatformApiCallValue(node) {
  if (
    isMemberExpressionNode(node?.callee) &&
    readMemberObjectIdentifier(node.callee) === "App" &&
    readMemberPropertyName(node.callee) === "getPlatform" &&
    (node.arguments?.length ?? 0) === 0
  ) {
    return "desktop";
  }

  return undefined;
}

function isMemberExpressionNode(node) {
  return node?.type === "MemberExpression" ||
    node?.type === "StaticMemberExpression" ||
    node?.type === "ComputedMemberExpression";
}

function readMemberObjectIdentifier(node) {
  return node?.object?.type === "Identifier" ? node.object.name : null;
}

function readJsxTagName(node) {
  if (!node) {
    return null;
  }

  if (node.type === "JSXIdentifier") {
    return node.name;
  }

  if (node.type === "Identifier") {
    return node.name;
  }

  return null;
}

function normalizeJsxTextValue(value) {
  return value.replace(/\s+/g, " ").trim();
}

function mapIntrinsicToSemanticTag(tagName) {
  switch (tagName) {
    case "a":
      return "link";
    case "p":
    case "span":
    case "label":
      return "text";
    case "button":
      return "button";
    case "input":
      return "input";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "main":
    case "section":
    case "article":
    case "div":
    case "form":
      return "container";
    case "nav":
      return "row";
    default:
      return tagName;
  }
}

function mapComponentCallToSemanticTag(name) {
  switch (name) {
    case "Column":
      return "column";
    case "Row":
      return "row";
    case "Text":
    case "Title":
      return "text";
    case "Heading":
      return "heading";
    case "Button":
      return "button";
    case "Input":
      return "input";
    case "Link":
      return "link";
    case "Surface":
      return "surface";
    case "Card":
      return "card";
    case "Spacer":
    case "SpacerBox":
      return "spacer";
    case "Form":
      return "form";
    case "FormGroup":
      return "container";
    case "AppBar":
      return "surface";
    default:
      return null;
  }
}

function headingLevelFromTag(tagName) {
  if (/^h[1-6]$/.test(tagName)) {
    return Number(tagName.slice(1));
  }
  return 2;
}

function extractTextFromIRChildren(children) {
  return children
    .flatMap((child) => child.kind === "fragment" ? child.children : [child])
    .map((child) => {
      if (child.kind === "text") {
        return child.value;
      }
      if (child.kind === "element") {
        return extractTextFromIRChildren(child.children);
      }
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEventPropName(propName) {
  if (propName === "onClick") {
    return "onPress";
  }
  return propName;
}

function omitKeys(record, keys) {
  const output = { ...record };
  for (const key of keys) {
    delete output[key];
  }
  return output;
}

function parseDesktopRoutePath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  let routePath = normalizedPath.replace(/\.(tsx|ts|jsx|js)$/, "");
  routePath = routePath.replace(/^\.\//, "");
  routePath = routePath.replace(/\/index$/, "");

  const segments = routePath.split("/").filter(Boolean);
  if (!routePath || routePath === "/" || (segments.length === 1 && segments[0] === "index")) {
    return "/";
  }

  const convertedSegments = segments.map((segment) => {
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return `:${segment.slice(1, -1)}`;
    }
    return segment;
  });

  return `/${convertedSegments.join("/").toLowerCase()}`;
}

export async function resolveDesktopEntry(appDir, entry) {
  if (typeof entry === "string" && entry.trim()) {
    const explicitPath = path.isAbsolute(entry)
      ? entry
      : path.resolve(appDir, entry);
    await assertFileExists(
      explicitPath,
      `desktop entry not found: ${explicitPath}`
    );
    return explicitPath;
  }

  const candidates = [
    path.join(appDir, "src", "pages", "index.tsx"),
    path.join(appDir, "src", "pages", "index.ts"),
    path.join(appDir, "src", "pages", "index.jsx"),
    path.join(appDir, "src", "pages", "index.js"),
    path.join(appDir, "src", "desktop", "index.tsx"),
    path.join(appDir, "src", "desktop", "index.ts"),
    path.join(appDir, "src", "desktop", "index.jsx"),
    path.join(appDir, "src", "desktop", "index.js"),
    path.join(appDir, "src", "desktop.tsx"),
    path.join(appDir, "src", "desktop.ts"),
    path.join(appDir, "src", "desktop.jsx"),
    path.join(appDir, "src", "desktop.js")
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(
    `Could not resolve desktop entry for ${appDir}. Pass options.entry to buildDesktopApp().`
  );
}

export async function ensureDesktopCompilerPackages() {
  await ensureWorkspacePackageBuilt("core");
  await ensureWorkspacePackageBuilt("ft");
  await ensureWorkspacePackageBuilt("ui");
  await ensureWorkspacePackageBuilt("web");
}

export async function ensureWorkspacePackageBuilt(workspaceName) {
  const distEntry = path.resolve(rootDir, workspaceName, "dist", "index.js");

  try {
    await fs.access(distEntry);
  } catch {
    await runProcess(
      npmExecutable(),
      ["run", "build", "--workspace", `@adaptivejs/${workspaceName}`],
      rootDir
    );
  }
}

export async function runCargo(cwd, args) {
  await runProcess("cargo", args, cwd);
}

export async function runNodeScript(scriptPath, cwd) {
  return runProcess(process.execPath, [scriptPath], cwd);
}

export async function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const output = stderr.trim() || stdout.trim();
      reject(
        new Error(
          output || `Command failed: ${command} ${args.join(" ")}`
        )
      );
    });
  });
}

export function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function assertFileExists(filePath, message) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(message);
  }
}
