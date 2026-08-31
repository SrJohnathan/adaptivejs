/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 *
 * Opt-in JSX thunk transform for AdaptiveJS.
 *
 * Mark a component with JSDoc `@thunk` (or line `// @thunk` / `/* @thunk *​/`).
 * Inside that component only, bare call expressions in JSX value positions:
 *
 *   <div>{value()}</div>        →  <div>{() => value()}</div>
 *   <Input value={count()} />   →  <Input value={() => count()} />
 *
 * Not transformed:
 *   - already an arrow/function: {() => value()}
 *   - event props: onClick={...}, on:click={...}
 *   - components without @thunk
 */

export type ThunkTransformResult = {
    code: string;
    /** Number of call expressions wrapped */
    wrapped: number;
    /** Number of @thunk scopes found */
    scopes: number;
};

const THUNK_TAG_RE = /@thunk\b/;

/** Props that must never be auto-wrapped (handlers / refs). */
const SKIP_PROP_RE =
    /^(on[A-Z].*|on:.*|ref|ref:.*|bind:.*)$/;

/**
 * Apply @thunk transform to source text.
 * Safe to call on any .ts/.tsx/.js/.jsx file; no-op when there is no @thunk.
 */
export function applyThunkTransform(
    code: string,
    _filePath?: string,
): ThunkTransformResult {
    if (!THUNK_TAG_RE.test(code)) {
        return { code, wrapped: 0, scopes: 0 };
    }

    const scopes = findThunkScopes(code);
    if (scopes.length === 0) {
        return { code, wrapped: 0, scopes: 0 };
    }

    // Apply from the end so earlier offsets stay valid
    let result = code;
    let wrapped = 0;

    for (let i = scopes.length - 1; i >= 0; i--) {
        const scope = scopes[i];
        const body = result.slice(scope.bodyStart, scope.bodyEnd);
        const transformed = transformJsxCallsInBody(body);
        wrapped += transformed.wrapped;
        result =
            result.slice(0, scope.bodyStart) +
            transformed.code +
            result.slice(scope.bodyEnd);
    }

    return { code: result, wrapped, scopes: scopes.length };
}

/* ========================= scope discovery ========================= */

type ThunkScope = {
    /** Inclusive start of function body `{` content */
    bodyStart: number;
    /** Exclusive end of function body (index of closing `}`) */
    bodyEnd: number;
};

/**
 * Finds function / arrow bodies that carry a @thunk annotation
 * immediately before the declaration (JSDoc or line comment).
 */
function findThunkScopes(code: string): ThunkScope[] {
    const scopes: ThunkScope[] = [];
    const len = code.length;
    let i = 0;

    while (i < len) {
        // Skip strings & comments quickly when searching for "function" / "=>" contexts
        // We search for @thunk comments, then resolve the following declaration.
        if (code[i] === "/" && code[i + 1] === "*") {
            const end = code.indexOf("*/", i + 2);
            if (end === -1) break;
            const comment = code.slice(i, end + 2);
            if (THUNK_TAG_RE.test(comment)) {
                const after = skipWs(code, end + 2);
                const scope = tryParseDeclarationBody(code, after);
                if (scope) scopes.push(scope);
            }
            i = end + 2;
            continue;
        }

        if (code[i] === "/" && code[i + 1] === "/") {
            const end = code.indexOf("\n", i + 2);
            const lineEnd = end === -1 ? len : end;
            const comment = code.slice(i, lineEnd);
            if (THUNK_TAG_RE.test(comment)) {
                const after = skipWs(code, lineEnd + (end === -1 ? 0 : 1));
                const scope = tryParseDeclarationBody(code, after);
                if (scope) scopes.push(scope);
            }
            i = lineEnd + 1;
            continue;
        }

        // skip string literals so we don't trip on "@thunk" inside strings
        if (code[i] === "'" || code[i] === '"' || code[i] === "`") {
            i = skipString(code, i);
            continue;
        }

        i++;
    }

    return scopes;
}

/**
 * From position `pos` (after annotation), accept:
 *   export async function Name(...) { body }
 *   function Name(...) { body }
 *   export const Name = async (...) => { body }
 *   const Name = (...) => { body }
 *   const Name = function (...) { body }
 */
function tryParseDeclarationBody(
    code: string,
    pos: number,
): ThunkScope | null {
    let i = skipWs(code, pos);

    // optional export / default
    if (matchKeyword(code, i, "export")) {
        i = skipWs(code, i + 6);
        if (matchKeyword(code, i, "default")) {
            i = skipWs(code, i + 7);
        }
    }

    // async function / function
    if (matchKeyword(code, i, "async")) {
        i = skipWs(code, i + 5);
    }

    if (matchKeyword(code, i, "function")) {
        i = skipWs(code, i + 8);
        // optional name
        i = skipIdent(code, i);
        i = skipWs(code, i);
        if (code[i] !== "(") return null;
        i = skipBalanced(code, i, "(", ")");
        if (i < 0) return null;
        i = skipWs(code, i);
        // optional return type `: Type`
        if (code[i] === ":") {
            i = skipTypeAnnotation(code, i + 1);
            i = skipWs(code, i);
        }
        if (code[i] !== "{") return null;
        const bodyStart = i + 1;
        const bodyEnd = skipBalanced(code, i, "{", "}");
        if (bodyEnd < 0) return null;
        return { bodyStart, bodyEnd: bodyEnd - 1 };
    }

    // const / let / var Name = ...
    if (
        matchKeyword(code, i, "const") ||
        matchKeyword(code, i, "let") ||
        matchKeyword(code, i, "var")
    ) {
        const kwLen = code.startsWith("const", i) ? 5 : 3;
        i = skipWs(code, i + kwLen);
        i = skipIdent(code, i);
        i = skipWs(code, i);
        // optional type
        if (code[i] === ":") {
            i = skipTypeAnnotation(code, i + 1);
            i = skipWs(code, i);
        }
        if (code[i] !== "=") return null;
        i = skipWs(code, i + 1);

        if (matchKeyword(code, i, "async")) {
            i = skipWs(code, i + 5);
        }

        // function expression
        if (matchKeyword(code, i, "function")) {
            i = skipWs(code, i + 8);
            i = skipIdent(code, i);
            i = skipWs(code, i);
            if (code[i] !== "(") return null;
            i = skipBalanced(code, i, "(", ")");
            if (i < 0) return null;
            i = skipWs(code, i);
            if (code[i] === ":") {
                i = skipTypeAnnotation(code, i + 1);
                i = skipWs(code, i);
            }
            if (code[i] !== "{") return null;
            const bodyStart = i + 1;
            const bodyEnd = skipBalanced(code, i, "{", "}");
            if (bodyEnd < 0) return null;
            return { bodyStart, bodyEnd: bodyEnd - 1 };
        }

        // arrow: (params) => { body }  or  param => { body }
        if (code[i] === "(") {
            i = skipBalanced(code, i, "(", ")");
            if (i < 0) return null;
            i = skipWs(code, i);
            if (code[i] === ":") {
                i = skipTypeAnnotation(code, i + 1);
                i = skipWs(code, i);
            }
        } else if (isIdentStart(code[i])) {
            i = skipIdent(code, i);
            i = skipWs(code, i);
        } else {
            return null;
        }

        if (code[i] !== "=" || code[i + 1] !== ">") return null;
        i = skipWs(code, i + 2);

        // only block bodies — expression-bodied arrows have no stable "body range"
        // for multi-expression JSX transforms; require `{ ... }`
        if (code[i] !== "{") return null;
        const bodyStart = i + 1;
        const bodyEnd = skipBalanced(code, i, "{", "}");
        if (bodyEnd < 0) return null;
        return { bodyStart, bodyEnd: bodyEnd - 1 };
    }

    return null;
}

/* ========================= JSX call wrapping ========================= */

function transformJsxCallsInBody(body: string): { code: string; wrapped: number } {
    let out = "";
    let wrapped = 0;
    let i = 0;
    const len = body.length;

    // Track simple JSX tag context for prop names: last seen prop name before `=`
    let lastPropName = "";

    while (i < len) {
        // strings
        if (body[i] === "'" || body[i] === '"' || body[i] === "`") {
            const end = skipString(body, i);
            out += body.slice(i, end);
            i = end;
            continue;
        }

        // comments
        if (body[i] === "/" && body[i + 1] === "/") {
            const end = body.indexOf("\n", i);
            const e = end === -1 ? len : end + 1;
            out += body.slice(i, e);
            i = e;
            continue;
        }
        if (body[i] === "/" && body[i + 1] === "*") {
            const end = body.indexOf("*/", i + 2);
            const e = end === -1 ? len : end + 2;
            out += body.slice(i, e);
            i = e;
            continue;
        }

        // remember prop name:  name={...}  or  name = {
        if (isIdentStart(body[i])) {
            const start = i;
            i = skipIdent(body, i);
            const ident = body.slice(start, i);
            const after = skipWs(body, i);
            if (body[after] === "=") {
                lastPropName = ident;
            }
            out += ident;
            continue;
        }

        // JSX expression container: { ... }
        if (body[i] === "{") {
            const close = skipBalanced(body, i, "{", "}");
            if (close < 0) {
                out += body[i];
                i++;
                continue;
            }

            const innerRaw = body.slice(i + 1, close - 1);
            const innerTrim = innerRaw.trim();

            // skip empty / spread
            if (
                !innerTrim ||
                innerTrim.startsWith("...") ||
                isAlreadyThunk(innerTrim) ||
                isSkippedProp(lastPropName)
            ) {
                out += body.slice(i, close);
                i = close;
                lastPropName = "";
                continue;
            }

            if (isWrapableCallExpression(innerTrim)) {
                // preserve original inner spacing lightly
                const leading = innerRaw.match(/^\s*/)?.[0] ?? "";
                const trailing = innerRaw.match(/\s*$/)?.[0] ?? "";
                out += `{${leading}() => ${innerTrim}${trailing}}`;
                wrapped++;
            } else {
                out += body.slice(i, close);
            }

            i = close;
            lastPropName = "";
            continue;
        }

        out += body[i];
        i++;
    }

    return { code: out, wrapped };
}

/** True if expression is already () => ... or function ... */
function isAlreadyThunk(expr: string): boolean {
    const t = expr.trim();
    if (t.startsWith("function")) return true;
    // ( ... ) =>    or   async ( ... ) =>   or  id =>
    if (/^(async\s+)?\(/.test(t)) {
        // could be grouped call (value()) — check for => after balanced paren
        if (t[0] === "(" || t.startsWith("async")) {
            let idx = 0;
            if (t.startsWith("async")) {
                idx = t.slice(5).match(/^\s*/)?.[0].length ?? 0;
                idx += 5;
            }
            if (t[idx] === "(") {
                const end = skipBalanced(t, idx, "(", ")");
                if (end > 0) {
                    const rest = t.slice(end).trimStart();
                    if (rest.startsWith("=>")) return true;
                }
            }
        }
    }
    // x =>
    if (/^[A-Za-z_$][\w$]*\s*=>/.test(t)) return true;
    // async x =>
    if (/^async\s+[A-Za-z_$][\w$]*\s*=>/.test(t)) return true;
    return false;
}

function isSkippedProp(propName: string): boolean {
    if (!propName) return false;
    return SKIP_PROP_RE.test(propName);
}

/**
 * Accepts top-level call expressions only, e.g.:
 *   value()
 *   count( )
 *   user.name()
 *   store.user.name()
 * Optional simple args: value(1), value(x) — still a call to wrap.
 * Rejects: a + b, a ? b : c, a && b, arrays, objects, awaits, new, etc.
 */
function isWrapableCallExpression(expr: string): boolean {
    const t = expr.trim();
    if (!t) return false;

    // must look like  MemberOrIdent ( args )
    // scan ident.member* then (...)
    let i = 0;
    if (!isIdentStart(t[i])) return false;
    i = skipIdent(t, i);

    while (t[i] === "." || t[i] === "?.") {
        if (t[i] === "?" && t[i + 1] === ".") {
            i += 2;
        } else {
            i += 1;
        }
        i = skipWs(t, i);
        if (!isIdentStart(t[i])) return false;
        i = skipIdent(t, i);
    }

    i = skipWs(t, i);
    if (t[i] !== "(") return false;

    const afterCall = skipBalanced(t, i, "(", ")");
    if (afterCall < 0) return false;

    // nothing after the call (no trailing operators)
    const rest = t.slice(afterCall).trim();
    return rest.length === 0;
}

/* ========================= scan helpers ========================= */

function skipWs(code: string, i: number): number {
    while (i < code.length && /\s/.test(code[i])) i++;
    return i;
}

function isIdentStart(ch: string | undefined): boolean {
    return !!ch && /[A-Za-z_$/]/.test(ch);
}

function isIdentPart(ch: string | undefined): boolean {
    return !!ch && /[A-Za-z0-9_$/]/.test(ch);
}

function skipIdent(code: string, i: number): number {
    if (!isIdentStart(code[i])) return i;
    i++;
    while (isIdentPart(code[i])) i++;
    return i;
}

function matchKeyword(code: string, i: number, kw: string): boolean {
    if (!code.startsWith(kw, i)) return false;
    const next = code[i + kw.length];
    // word boundary
    return !next || !isIdentPart(next);
}

function skipString(code: string, i: number): number {
    const quote = code[i];
    i++;
    if (quote === "`") {
        while (i < code.length) {
            if (code[i] === "\\") {
                i += 2;
                continue;
            }
            if (code[i] === "`") return i + 1;
            // template expression ${ ... }
            if (code[i] === "$" && code[i + 1] === "{") {
                const end = skipBalanced(code, i + 1, "{", "}");
                i = end < 0 ? code.length : end;
                continue;
            }
            i++;
        }
        return code.length;
    }
    while (i < code.length) {
        if (code[i] === "\\") {
            i += 2;
            continue;
        }
        if (code[i] === quote) return i + 1;
        i++;
    }
    return code.length;
}

/** Returns index just past the closing delimiter, or -1. `openIdx` points at opener. */
function skipBalanced(
    code: string,
    openIdx: number,
    open: string,
    close: string,
): number {
    if (code[openIdx] !== open) return -1;
    let depth = 0;
    let i = openIdx;
    const len = code.length;

    while (i < len) {
        const ch = code[i];

        if (ch === "'" || ch === '"' || ch === "`") {
            i = skipString(code, i);
            continue;
        }
        if (ch === "/" && code[i + 1] === "/") {
            const nl = code.indexOf("\n", i);
            i = nl === -1 ? len : nl + 1;
            continue;
        }
        if (ch === "/" && code[i + 1] === "*") {
            const end = code.indexOf("*/", i + 2);
            i = end === -1 ? len : end + 2;
            continue;
        }

        if (ch === open) {
            depth++;
            i++;
            continue;
        }
        if (ch === close) {
            depth--;
            i++;
            if (depth === 0) return i;
            continue;
        }
        i++;
    }
    return -1;
}

/**
 * Skip a TypeScript type annotation roughly until `{`, `=>`, `=` or `;`
 * that ends the annotation context. Good enough for finding the body `{`.
 */
function skipTypeAnnotation(code: string, i: number): number {
    i = skipWs(code, i);
    let depthAngle = 0;
    let depthParen = 0;
    let depthBrace = 0;
    let depthBracket = 0;

    while (i < code.length) {
        const ch = code[i];

        if (ch === "'" || ch === '"' || ch === "`") {
            i = skipString(code, i);
            continue;
        }

        if (ch === "<") {
            depthAngle++;
            i++;
            continue;
        }
        if (ch === ">" && depthAngle > 0) {
            depthAngle--;
            i++;
            continue;
        }
        if (ch === "(") {
            depthParen++;
            i++;
            continue;
        }
        if (ch === ")" && depthParen > 0) {
            depthParen--;
            i++;
            continue;
        }
        if (ch === "{") {
            depthBrace++;
            i++;
            continue;
        }
        if (ch === "}" && depthBrace > 0) {
            depthBrace--;
            i++;
            continue;
        }
        if (ch === "[") {
            depthBracket++;
            i++;
            continue;
        }
        if (ch === "]" && depthBracket > 0) {
            depthBracket--;
            i++;
            continue;
        }

        if (
            depthAngle === 0 &&
            depthParen === 0 &&
            depthBrace === 0 &&
            depthBracket === 0
        ) {
            // end of annotation before body / arrow / assign
            if (ch === "{" || ch === ";" || ch === "," || ch === ")") break;
            if (ch === "=" && code[i + 1] === ">") break;
            if (ch === "=" && code[i + 1] !== ">") break;
        }
        i++;
    }
    return i;
}
