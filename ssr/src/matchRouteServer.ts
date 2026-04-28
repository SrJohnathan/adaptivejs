export function parseRoutePathServer(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");

  const pagesIndex = normalizedPath.indexOf("/pages/");
  let routePath =
    pagesIndex !== -1
      ? normalizedPath.substring(pagesIndex + "/pages/".length)
      : normalizedPath;

  routePath = routePath.replace(/\.(tsx|ts|jsx|js)$/, "");
  routePath = routePath.replace(/\/index$/, "");

  if (!routePath || routePath === "/") {
    return "/";
  }

  const segments = routePath.split("/").filter(Boolean);
  const convertedSegments = segments.map((segment) => {
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return `:${segment.slice(1, -1)}`;
    }
    return segment;
  });

  return `/${convertedSegments.join("/").toLowerCase()}`;
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

  if (routeSegments.length !== pathSegments.length) {
    return { matched: false };
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < routeSegments.length; index++) {
    const routeSegment = routeSegments[index];
    const pathSegment = pathSegments[index];

    if (routeSegment.startsWith(":")) {
      params[routeSegment.slice(1)] = pathSegment;
      continue;
    }

    if (routeSegment !== pathSegment) {
      return { matched: false };
    }
  }

  return { matched: true, params };
}
