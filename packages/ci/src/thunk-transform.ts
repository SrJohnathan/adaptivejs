/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 *
 * Opt-in JSX thunk transform for AdaptiveJS.
 *
 * Mark a component with JSDoc `@thunk` (or `// @thunk` / block comment).
 * Inside that component, JSX value expressions that need reactivity are wrapped:
 *
 *   {value()}                           → {() => value()}
 *   {count() > 0 ? <A/> : <B/>}         → {() => (count() > 0 ? <A/> : <B/>)}
 *   {open() && <Panel/>}                → {() => (open() && <Panel/>)}
 *   {items().map(i => <Row item={i}/>)} → {() => items().map(i => <Row item={i}/>)}
 *   {[a(), b()]}                        → {() => [a(), b()]}
 *   <Input value={count()} />           → <Input value={() => count()} />
 *
 * Not transformed:
 *   - already an arrow/function: {() => ...}
 *   - event props: onClick={...}, on:click={...}
 *   - pure static literals: {"hi"}, {42}, {true}
 *   - components without @thunk
 */

export type ThunkTransformResult = {
    code: string;
    wrapped: number;
    scopes: number;
};

const THUNK_TAG_RE = /@thunk\b/;

const SKIP_PROP_RE =
    /^(on[A-Z].*|on:.*|ref|ref:.*|bind:.*)$/;

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

    let result = code;
    let wrapped = 0;

    for (let i = scopes.length - 1; i >= 0; i--) {
        const scope = scopes[i];
        const body = result.slice(scope.bodyStart, scope.bodyEnd);
        const transformed = transformJsxExpressionsInBody(body);
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
    bodyStart: number;
    bodyEnd: number;
};

function findThunkScopes(code: string): ThunkScope[] {
    const scopes: ThunkScope[] = [];
    const len = code.length;
    let i = 0;

    while (i < len) {
        if (code[i] === "/" && code[i + 1] === "*") {
            const end = code.indexOf("*/", i + 2);
            if (end === -1) break;
            if (THUNK_TAG_RE.test(code.slice(i, end + 2))) {
                const scope = tryParseDeclarationBody(code, skipWs(code, end + 2));
                if (scope) scopes.push(scope);
            }
            i = end + 2;
            continue;
        }

        if (code[i] === "/" && code[i + 1] === "/") {
            const end = code.indexOf("\n", i + 2);
            const lineEnd = end === -1 ? len : end;
            if (THUNK_TAG_RE.test(code.slice(i, lineEnd))) {
                const scope = tryParseDeclarationBody(
                    code,
                    skipWs(code, lineEnd + (end === -1 ? 0 : 1)),
                );
                if (scope) scopes.push(scope);
            }
            i = lineEnd + 1;
            continue;
        }

        if (code[i] === "'" || code[i] === '"' || code[i] === "`") {
            i = skipString(code, i);
            continue;
        }

        i++;
    }

    return scopes;
}

function tryParseDeclarationBody(code: string, pos: number): ThunkScope | null {
    let i = skipWs(code, pos);

    if (matchKeyword(code, i, "export")) {
        i = skipWs(code, i + 6);
        if (matchKeyword(code, i, "default")) i = skipWs(code, i + 7);
    }

    if (matchKeyword(code, i, "async")) i = skipWs(code, i + 5);

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

    if (
        matchKeyword(code, i, "const") ||
        matchKeyword(code, i, "let") ||
        matchKeyword(code, i, "var")
    ) {
        const kwLen = code.startsWith("const", i) ? 5 : 3;
        i = skipWs(code, i + kwLen);
        i = skipIdent(code, i);
        i = skipWs(code, i);
        if (code[i] === ":") {
            i = skipTypeAnnotation(code, i + 1);
            i = skipWs(code, i);
        }
        if (code[i] !== "=") return null;
        i = skipWs(code, i + 1);

        if (matchKeyword(code, i, "async")) i = skipWs(code, i + 5);

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
        if (code[i] !== "{") return null;
        const bodyStart = i + 1;
        const bodyEnd = skipBalanced(code, i, "{", "}");
        if (bodyEnd < 0) return null;
        return { bodyStart, bodyEnd: bodyEnd - 1 };
    }

    return null;
}

/* ========================= JSX expression wrapping ========================= */

function transformJsxExpressionsInBody(body: string): {
    code: string;
    wrapped: number;
} {
    let out = "";
    let wrapped = 0;
    let i = 0;
    const len = body.length;
    let lastPropName = "";

    while (i < len) {
        if (body[i] === "'" || body[i] === '"' || body[i] === "`") {
            const end = skipString(body, i);
            out += body.slice(i, end);
            i = end;
            continue;
        }

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

        if (isIdentStart(body[i])) {
            const start = i;
            i = skipIdent(body, i);
            const ident = body.slice(start, i);
            const after = skipWs(body, i);
            if (body[after] === "=") lastPropName = ident;
            out += ident;
            continue;
        }

        if (body[i] === "{") {
            const close = skipBalanced(body, i, "{", "}");
            if (close < 0) {
                out += body[i];
                i++;
                continue;
            }

            const innerRaw = body.slice(i + 1, close - 1);
            const innerTrim = innerRaw.trim();

            if (
                !innerTrim ||
                innerTrim.startsWith("...") ||
                isAlreadyThunk(innerTrim) ||
                isSkippedProp(lastPropName) ||
                isStaticLiteral(innerTrim)
            ) {
                out += body.slice(i, close);
                i = close;
                lastPropName = "";
                continue;
            }

            if (shouldWrapJsxExpression(innerTrim)) {
                const leading = innerRaw.match(/^\s*/)?.[0] ?? "";
                const trailing = innerRaw.match(/\s*$/)?.[0] ?? "";
                const core = needsParentheses(innerTrim)
                    ? `(${innerTrim})`
                    : innerTrim;
                out += `{${leading}() => ${core}${trailing}}`;
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

function isSkippedProp(propName: string): boolean {
    return Boolean(propName) && SKIP_PROP_RE.test(propName);
}

function isAlreadyThunk(expr: string): boolean {
    const t = expr.trim();
    if (t.startsWith("function")) return true;

    if (/^(async\s+)?\(/.test(t)) {
        let idx = 0;
        if (t.startsWith("async")) {
            idx = 5 + (t.slice(5).match(/^\s*/)?.[0].length ?? 0);
        }
        if (t[idx] === "(") {
            const end = skipBalanced(t, idx, "(", ")");
            if (end > 0 && t.slice(end).trimStart().startsWith("=>")) return true;
        }
    }

    if (/^[A-Za-z_$][\w$]*\s*=>/.test(t)) return true;
    if (/^async\s+[A-Za-z_$][\w$]*\s*=>/.test(t)) return true;
    return false;
}

function isStaticLiteral(expr: string): boolean {
    const t = expr.trim();
    if (t === "true" || t === "false" || t === "null" || t === "undefined") {
        return true;
    }
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return true;
    if (
        (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'")) ||
        (t.startsWith("`") && t.endsWith("`") && !t.includes("${"))
    ) {
        return true;
    }
    return false;
}

/**
 * Wrap when expression needs reactivity:
 *  - call: value(), store.x()
 *  - call chain: items().map(...)
 *  - ternary / && / ||
 *  - array literal
 *  - any expression containing a call
 */
function shouldWrapJsxExpression(expr: string): boolean {
    const t = expr.trim();
    if (!t || isAlreadyThunk(t) || isStaticLiteral(t)) return false;

    if (isWrapableCallExpression(t)) return true;
    if (hasTopLevelTernary(t)) return true;
    if (hasTopLevelLogical(t)) return true;
    if (t.startsWith("[") && t.endsWith("]")) return true;
    if (hasArrayMethodChain(t)) return true;
    if (containsCallExpression(t)) return true;

    return false;
}

function needsParentheses(expr: string): boolean {
    const t = expr.trim();
    return hasTopLevelTernary(t) || hasTopLevelComma(t);
}

function isWrapableCallExpression(expr: string): boolean {
    const t = expr.trim();
    if (!t || !isIdentStart(t[0])) return false;

    let i = skipIdent(t, 0);

    while (t[i] === "." || (t[i] === "?" && t[i + 1] === ".")) {
        if (t[i] === "?" && t[i + 1] === ".") i += 2;
        else i += 1;
        i = skipWs(t, i);
        if (!isIdentStart(t[i])) return false;
        i = skipIdent(t, i);
    }

    i = skipWs(t, i);
    if (t[i] !== "(") return false;

    const afterCall = skipBalanced(t, i, "(", ")");
    if (afterCall < 0) return false;

    // allow .map(...) chain after the call
    let rest = t.slice(afterCall).trim();
    while (rest.startsWith(".") || rest.startsWith("?.")) {
        const member = rest.match(/^\??\.([A-Za-z_$][\w$]*)/);
        if (!member) break;
        rest = rest.slice(member[0].length).trimStart();
        if (rest.startsWith("(")) {
            const end = skipBalanced(rest, 0, "(", ")");
            if (end < 0) return false;
            rest = rest.slice(end).trimStart();
            continue;
        }
        break;
    }

    return rest.length === 0;
}

function hasArrayMethodChain(expr: string): boolean {
    return /\.\s*(map|filter|flatMap|reduce|forEach|find|some|every|slice|concat)\s*\(/.test(
        expr,
    );
}

function containsCallExpression(expr: string): boolean {
    let i = 0;
    while (i < expr.length) {
        if (expr[i] === "'" || expr[i] === '"' || expr[i] === "`") {
            i = skipString(expr, i);
            continue;
        }
        if (isIdentStart(expr[i])) {
            i = skipIdent(expr, i);
            const after = skipWs(expr, i);
            if (expr[after] === "(") return true;
            continue;
        }
        i++;
    }
    return false;
}

function hasTopLevelTernary(expr: string): boolean {
    return findTopLevelChar(expr, "?") >= 0;
}

function hasTopLevelLogical(expr: string): boolean {
    return (
        findTopLevelOperator(expr, "&&") >= 0 ||
        findTopLevelOperator(expr, "||") >= 0
    );
}

function hasTopLevelComma(expr: string): boolean {
    return findTopLevelChar(expr, ",") >= 0;
}

function findTopLevelChar(expr: string, ch: string): number {
    let depthParen = 0;
    let depthBrace = 0;
    let depthBracket = 0;

    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (c === "'" || c === '"' || c === "`") {
            i = skipString(expr, i) - 1;
            continue;
        }
        if (c === "(") depthParen++;
        else if (c === ")") depthParen--;
        else if (c === "{") depthBrace++;
        else if (c === "}") depthBrace--;
        else if (c === "[") depthBracket++;
        else if (c === "]") depthBracket--;
        else if (
            c === ch &&
            depthParen === 0 &&
            depthBrace === 0 &&
            depthBracket === 0
        ) {
            if (ch === "?" && (expr[i + 1] === "?" || expr[i + 1] === ".")) {
                i++;
                continue;
            }
            return i;
        }
    }
    return -1;
}

function findTopLevelOperator(expr: string, op: string): number {
    let depthParen = 0;
    let depthBrace = 0;
    let depthBracket = 0;

    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (c === "'" || c === '"' || c === "`") {
            i = skipString(expr, i) - 1;
            continue;
        }
        if (c === "(") depthParen++;
        else if (c === ")") depthParen--;
        else if (c === "{") depthBrace++;
        else if (c === "}") depthBrace--;
        else if (c === "[") depthBracket++;
        else if (c === "]") depthBracket--;
        else if (
            depthParen === 0 &&
            depthBrace === 0 &&
            depthBracket === 0 &&
            expr.startsWith(op, i)
        ) {
            return i;
        }
    }
    return -1;
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
            if (ch === "{" || ch === ";" || ch === "," || ch === ")") break;
            if (ch === "=") break;
        }
        i++;
    }
    return i;
}