/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

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
