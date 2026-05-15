/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */


/*
pages/index.tsx                 -> /
pages/client/index.tsx          -> /client
pages/client/[id]/index.tsx     -> /client/:id
pages/client/[id]/edit.tsx      -> /client/:id/edit
pages/docs/[...slug].tsx        -> /docs/*slug
pages/docs/[[...slug]].tsx      -> /docs/*slug?
pages/user/[[id]].tsx           -> /user/:id?

/client/10          params: { id: "10" }
/docs/a/b/c         params: { slug: "a/b/c" }
/docs               params: { slug: "" }
/user               params: {}
/user/55            params: { id: "55" }

pages/docs/a/b/c/index.tsx       -> /docs/a/b/c         params: {}
pages/docs/[...slug].tsx         -> /docs/*slug         params: { slug: "a/b/c" }
pages/docs/[...slug]/index.tsx   -> /docs/*slug         params: { slug: "a/b/c" }

* */

export function parseRoutePathServer(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");

  const pagesIndex = normalizedPath.indexOf("/pages/");
  let routePath =
      pagesIndex !== -1
          ? normalizedPath.substring(pagesIndex + "/pages/".length)
          : normalizedPath;

  routePath = routePath.replace(/\.(tsx|ts|jsx|js)$/, "");
  routePath = routePath.replace(/\/index$/, "");

  if (!routePath || routePath === "/" || routePath === "index") {
    return "/";
  }

  const segments = routePath.split("/").filter(Boolean);

  const convertedSegments = segments.map((segment) => {
    // [...slug] -> *slug
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      return `*${segment.slice(4, -1)}`;
    }

    // [[...slug]] -> *slug?
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      return `*${segment.slice(5, -2)}?`;
    }

    // [[id]] -> :id?
    if (segment.startsWith("[[") && segment.endsWith("]]")) {
      return `:${segment.slice(2, -2)}?`;
    }

    // [id] -> :id
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return `:${segment.slice(1, -1)}`;
    }

    return segment;
  });

  return `/${convertedSegments.join("/")}`;
}

export function matchRouteServer(
    routePath: string,
    pathname: string
): { matched: boolean; params?: Record<string, string> } {
  if (routePath === "/" && pathname === "/") {
    return { matched: true, params: {} };
  }

  const trim = (value: string) => value.replace(/^\/|\/$/g, "");
  const routeSegments = trim(routePath).split("/").filter(Boolean);
  const pathSegments = trim(pathname).split("/").filter(Boolean);

  const params: Record<string, string> = {};

  let routeIndex = 0;
  let pathIndex = 0;

  while (routeIndex < routeSegments.length) {
    const routeSegment = routeSegments[routeIndex];
    const pathSegment = pathSegments[pathIndex];

    // catch-all: *slug
    if (routeSegment.startsWith("*")) {
      const name = routeSegment.replace(/^\*/, "").replace(/\?$/, "");
      const optional = routeSegment.endsWith("?");

      const rest = pathSegments.slice(pathIndex);

      if (rest.length === 0 && !optional) {
        return { matched: false };
      }

      params[name] = rest.join("/");
      return { matched: true, params };
    }

    // optional param: :id?
    if (routeSegment.startsWith(":") && routeSegment.endsWith("?")) {
      const name = routeSegment.slice(1, -1);

      if (pathSegment !== undefined) {
        params[name] = pathSegment;
        pathIndex++;
      }

      routeIndex++;
      continue;
    }

    if (pathSegment === undefined) {
      return { matched: false };
    }

    // dynamic param: :id
    if (routeSegment.startsWith(":")) {
      params[routeSegment.slice(1)] = pathSegment;
      routeIndex++;
      pathIndex++;
      continue;
    }

    // static
    if (routeSegment !== pathSegment) {
      return { matched: false };
    }

    routeIndex++;
    pathIndex++;
  }

  if (pathIndex < pathSegments.length) {
    return { matched: false };
  }

  return { matched: true, params };
}

