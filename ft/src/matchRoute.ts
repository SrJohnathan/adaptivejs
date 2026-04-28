export function parseRoutePath(filePath: string): string {
    // Remove o prefixo da pasta 'pages'
    let routePath = filePath.replace(/^.*\/pages/, "");
    // Remove a extensão .tsx
    routePath = routePath.replace(/\.tsx$/, "");
    // Remove "/index" somente se estiver no final do caminho
    routePath = routePath.replace(/\/index$/, "");

    // Se o caminho estiver vazio após as remoções, significa que é a raiz
    if (routePath === "" || routePath === "/") {
        return "/";
    }

    // Divide o caminho em segmentos
    const segments = routePath.split("/");
    // Converte segmentos que estejam entre colchetes para o formato de parâmetro (ex.: [id] -> :id)
    const convertedSegments = segments.map(segment => {
        if (segment.startsWith("[") && segment.endsWith("]")) {
            return ":" + segment.slice(1, -1);
        }
        return segment;
    });


  const  finalPath = "/" + convertedSegments.join("/").toLowerCase();

    // Junta os segmentos e garante que comece com '/'
    return finalPath
}

/*
console.log(parseRoutePath("../pages/index.tsx"));          // "/"
console.log(parseRoutePath("../pages/home.tsx"));             // "/home"
console.log(parseRoutePath("../pages/home/index.tsx"));       // "/home"
console.log(parseRoutePath("../pages/home/[id].tsx"));          // "/home/:id"
console.log(parseRoutePath("../pages/home/[id]/index.tsx"));    // "/home/:id"
console.log(parseRoutePath("../pages/blog/[slug].tsx"));        // "/blog/:slug"*/





/**
 * Compara uma rota definida (com parâmetros, ex.: "/home/:id")
 * com o pathname atual (ex.: "/home/123").
 * Retorna um objeto informando se houve match e os parâmetros extraídos.
 */
export function matchRoute(
    routePath: string,
    pathname: string
): { matched: boolean; params?: Record<string, string> } {



    // Caso especial: rota raiz
    if (routePath === "/" && pathname === "/") {
        return { matched: true, params: {} };
    }

    // Remove barras iniciais e finais e divide em segmentos
    const trim = (str: string) => str.replace(/^\/|\/$/g, "");
    const routeSegments = trim(routePath).split("/").filter(Boolean);
    const pathSegments = trim(pathname).split("/").filter(Boolean);

    // Se o número de segmentos for diferente, não há match
    if (routeSegments.length !== pathSegments.length) {
        return { matched: false };
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < routeSegments.length; i++) {
        const routeSegment = routeSegments[i];
        const pathSegment = pathSegments[i];

        if (routeSegment.startsWith(":")) {
            const paramName = routeSegment.slice(1);
            params[paramName] = pathSegment;

        } else if (routeSegment !== pathSegment) {
            return { matched: false };
        }
    }

    return { matched: true, params };
}
