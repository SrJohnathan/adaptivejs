/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */


import {RouteDefinition, matchRouteServer} from "@adaptive-js/shared";
import {AdaptiveObserver, isSSR} from "../reactive";
import {useClientEffect} from "../reactive/init.js";

/**
 * Representa um redirect no runtime do Adaptive
 */
export type AdaptiveRedirect = {
  __type: "redirect";
  location: string;
  status: number;
};

/**
 * Cria uma resposta de redirect (SSR-safe e agnóstico de adapter)
 */
export function redirect(location: string, status = 302): AdaptiveRedirect {
  return {
    __type: "redirect",
    location,
    status,
  };
}

export interface NavigateOptions {
  replace?: boolean;
  scroll?: boolean;
}

export interface Router {
  pathname: () => string;
  query: () => Record<string, string>;
  params: () => Record<string, string>;
  searchParams: () => URLSearchParams;
  hash: () => string;
  url: () => string;
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: Omit<NavigateOptions, "replace">) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => Promise<void> | void;
  init: () => void;
}

class RouterState implements Router {
  private pathnameObserver = new AdaptiveObserver<string>(this.getInitialPathname());
  private queryObserver = new AdaptiveObserver<Record<string, string>>(this.getInitialQuery());
  private paramsObserver = new AdaptiveObserver<Record<string, string>>(this.getInitialParams());
  private hashObserver = new AdaptiveObserver<string>(this.getInitialHash());
  private urlObserver = new AdaptiveObserver<string>(this.getInitialUrl());
  private initialized = false;

  private routes: RouteDefinition[] = []; // 👈 adicionar
  private loadedScripts = new Set<string>();

  private getInitialPathname(): string {
    if (isSSR()) return "/";
    return window.__ROUTE__ ?? window.location.pathname;
  }

  private getInitialQuery(): Record<string, string> {
    if (isSSR()) return {};
    if (window.__QUERYS__) return window.__QUERYS__;
    const query: Record<string, string> = {};
    const sp = new URLSearchParams(window.location.search);
    for (const [key, val] of sp.entries()) {
      query[key] = val;
    }
    return query;
  }

  private getInitialParams(): Record<string, string> {
    if (isSSR()) return {};
    return window.__PARAMS__ ?? {};
  }

  private getInitialHash(): string {
    if (isSSR()) return "";
    return window.location.hash;
  }

  private getInitialUrl(): string {
    if (isSSR()) return "/";
    return window.location.pathname + window.location.search + window.location.hash;
  }

  public setRoutes(routes: RouteDefinition[]) {
    this.routes = routes;
    this.sync();
  }

  public getRoutes(): RouteDefinition[] {
    return this.routes;
  }

  public init() {
    if (isSSR() || this.initialized) return;
    this.initialized = true;

    // Registra os scripts de módulo já presentes na página inicial,
    // para não reimportá-los durante navegações SPA.
    document.querySelectorAll<HTMLScriptElement>("script[type=module][src]").forEach((script) => {
      try {
        this.loadedScripts.add(new URL(script.src, window.location.href).toString());
      } catch {
        // ignore
      }
    });

    // Sincroniza o estado inicial
    this.sync();

    window.addEventListener("popstate", () => {
      // Sincroniza imediatamente o estado reativo (pathname/query/params/url),
      // para que componentes que consomem useRouter() já reajam à nova URL
      // mesmo antes do conteúdo ser trocado.
      this.sync();

      const target = window.location.pathname + window.location.search + window.location.hash;
      void this.loadAndRenderRoute(target).then((applied) => {
        if (!applied) {
          // Fallback: recarrega a página atual (sem alterar o histórico, já que a
          // URL já está correta) para garantir que o conteúdo acompanhe a URL.
          window.location.reload();
          return;
        }
        this.sync();
      });
    });

    window.addEventListener("hashchange", () => {
      this.sync();
    });

    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");

      if (
        link &&
        link.href &&
        (!link.target || link.target === "_self") &&
        !e.defaultPrevented &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        link.origin === window.location.origin &&
        !link.hasAttribute("download") &&
        link.getAttribute("rel") !== "external"
      ) {
        const href = link.getAttribute("href");
        if (href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
          e.preventDefault();
          this.push(href);
        }
      }
    });
  }

  public sync() {
    if (isSSR()) return;
    const pathname = window.location.pathname;
    const search = window.location.search;
    const hash = window.location.hash;

    // Atualiza o __ROUTE__ para compatibilidade com o sistema de hidratação
    (window as any).__ROUTE__ = pathname;

    const query: Record<string, string> = {};
    const sp = new URLSearchParams(search);
    for (const [key, val] of sp.entries()) {
      query[key] = val;
    }

    const params = this.matchParams(pathname); // 👈 recalcula

    this.pathnameObserver.set(pathname);
    this.queryObserver.set(query);
    if (params) this.paramsObserver.set(params);
    this.hashObserver.set(hash);
    this.urlObserver.set(pathname + search + hash);

    // Dispara evento customizado para notificar mudança de rota globalmente
    window.dispatchEvent(new CustomEvent("adaptive:routechange", {
      detail: { pathname, search, hash, url: pathname + search + hash }
    }));
  }

  /**
   * Busca o HTML renderizado no servidor para a rota informada e substitui
   * o conteúdo de #root, permitindo navegação SPA real (sem full reload).
   * Retorna `true` se a troca de conteúdo foi aplicada com sucesso.
   */
  private async loadAndRenderRoute(href: string): Promise<boolean> {
    if (isSSR()) return false;

    try {
      const targetUrl = new URL(href, window.location.href);
      if (targetUrl.origin !== window.location.origin) return false;

      const response = await fetch(targetUrl.toString(), {
        headers: { "X-Adaptive-Navigation": "1" },
        credentials: "same-origin",
      });

      if (!response.ok) return false;

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) return false;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      const newRoot = doc.getElementById("root");
      const currentRoot = document.getElementById("root");
      if (!newRoot || !currentRoot) return false;

      currentRoot.innerHTML = newRoot.innerHTML;

      if (doc.title) {
        document.title = doc.title;
      }

      // Reaplica os scripts inline responsáveis por definir __ROUTE__/__PARAMS__/__QUERYS__.
      doc.querySelectorAll("script:not([src])").forEach((script) => {
        const content = script.textContent ?? "";
        if (/__ROUTE__|__PARAMS__|__QUERYS__/.test(content)) {
          try {
            new Function(content)();
          } catch {
            // ignore
          }
        }
      });

      const scriptSrcs = Array.from(
          doc.querySelectorAll<HTMLScriptElement>("script[type=module][src]")
      ).map((script) => new URL(script.getAttribute("src")!, targetUrl).toString());

      for (const src of scriptSrcs) {
        if (this.loadedScripts.has(src)) continue;
        this.loadedScripts.add(src);
        try {
          await import(/* webpackIgnore: true */ src);
        } catch (err) {
          console.warn("[Adaptive Router] Falha ao importar módulo da rota:", src, err);
        }
      }

      return true;
    } catch (err) {
      console.warn("[Adaptive Router] Falha na navegação SPA, usando fallback:", err);
      return false;
    }
  }

  private matchParams(pathname: string): Record<string, string> | undefined {
    for (const route of this.routes) {
      const { matched, params } = matchRouteServer(route.path, pathname); // matcher client-side
      if (matched) return params;
    }
    return {};
  }

  public pathname = (): string => {
    return this.pathnameObserver.get();
  };

  public query = (): Record<string, string> => {
    return this.queryObserver.get();
  };

  public params = (): Record<string, string> => {
    return this.paramsObserver.get();
  };

  public hash = (): string => {
    return this.hashObserver.get();
  };

  public url = (): string => {
    return this.urlObserver.get();
  };

  public searchParams = (): URLSearchParams => {
    this.urlObserver.get();
    if (isSSR()) return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  };

  public push = (href: string, options: NavigateOptions = {}): void => {
    if (isSSR()) return;
    const replace = options.replace ?? false;
    const scroll = options.scroll ?? true;

    if (replace) {
      window.history.replaceState(null, "", href);
    } else {
      window.history.pushState(null, "", href);
    }

    this.sync();

    if (scroll) {
      window.scrollTo(0, 0);
    }

    void this.loadAndRenderRoute(href).then((applied) => {
      if (!applied) {
        // Fallback: navegação real caso não seja possível trocar o conteúdo via fetch.
        window.location.href = href;
        return;
      }
      this.sync();
    });
  };

  public replace = (href: string, options: Omit<NavigateOptions, "replace"> = {}): void => {
    this.push(href, { ...options, replace: true });
  };

  public back = (): void => {
    if (isSSR()) return;
    window.history.back();
  };

  public forward = (): void => {
    if (isSSR()) return;
    window.history.forward();
  };

  public refresh = (): void => {
    if (isSSR()) return;
    window.location.reload();
  };

  public prefetch = (_href: string): void => {
    // Prefetch hook
  };
}

let globalRouter: RouterState | null = null;

function getGlobalRouter(): RouterState {
  if (!globalRouter) {
    globalRouter = new RouterState();
  }
  return globalRouter;
}

/**
 * Define as rotas disponíveis no roteador do cliente.
 */
export function setClientRoutes(routes: RouteDefinition[]) {
  getGlobalRouter().setRoutes(routes);
}

/**
 * Retorna as rotas definidas no cliente.
 */
export function getClientRoutes(): RouteDefinition[] {
  return getGlobalRouter().getRoutes();
}

/**
 * Hook de navegação reativa do AdaptiveJS.
 *
 * Fornece getters reativos (pathname, query, params, searchParams, hash, url)
 * e métodos de navegação (push, replace, back, forward, refresh).
 */
export function useRouter(): Router {
  const router = getGlobalRouter();
  useClientEffect(() => {
    router.init();
  }, []);
  return router;
}
