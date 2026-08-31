/*
 * Copyright (c) 2026 Antonio Johnathan
 * Licensed under the MIT License.
 *
 * Live reload para `adaptive dev`:
 * - SSE em /_adaptive/livereload (push imediato após rebuild)
 * - fallback: poll em /_adaptive/build-meta.json
 * - script injetado no HTML de dev
 */

import type { ServerResponse } from "node:http";

export type LiveReloadPayload = {
    buildId: string;
    at: number;
};

/** Clientes SSE conectados (mesmo processo do dev server + watcher). */
const sseClients = new Set<ServerResponse>();

export function subscribeLiveReload(res: ServerResponse): void {
    console.log("[Adaptive LiveReload] client connected");
    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    res.write(`: adaptive live-reload connected\n\n`);
    sseClients.add(res);

    const keepAlive = setInterval(() => {
        if (res.writableEnded) {
            clearInterval(keepAlive);
            return;
        }
        try {
            res.write(`: ping\n\n`);
        } catch {
            clearInterval(keepAlive);
            sseClients.delete(res);
        }
    }, 15000);

    res.on("close", () => {
        clearInterval(keepAlive);
        sseClients.delete(res);
    });
}

/** Chamado após rebuild bem-sucedido. */
export function notifyLiveReload(buildId: string): void {
    console.log(
        "[Adaptive LiveReload] notify:",
        buildId,
        "clients:",
        sseClients.size,
    );

    const payload: LiveReloadPayload = {
        buildId,
        at: Date.now(),
    };

    const data =
        `event: reload\n` +
        `data: ${JSON.stringify(payload)}\n\n`;

    for (const res of [...sseClients]) {
        try {
            if (res.writableEnded) {
                sseClients.delete(res);
                continue;
            }

            console.log("[Adaptive LiveReload] sending reload");

            res.write(data);
        } catch {
            sseClients.delete(res);
        }
    }
}

export function liveReloadClientCount(): number {
    return sseClients.size;
}

/**
 * Script injetado no HTML de desenvolvimento.
 * Preferência: EventSource → fallback poll em build-meta.json.
 */
export function createDevLiveReloadScript(assetVersion: string | null): string {
    const initial = JSON.stringify(assetVersion ?? null);

    return `<script data-adaptive-live-reload>
(() => {
  let currentBuildId = ${initial};
  let disposed = false;
  let reloading = false;

  function triggerReload(nextId, reason) {
    if (disposed || reloading) return;
    if (nextId && currentBuildId && nextId === currentBuildId) return;

    // primeira meta conhecida: só memoriza
    if (nextId && currentBuildId == null) {
      currentBuildId = nextId;
      return;
    }

    if (!nextId || nextId === currentBuildId) return;

    reloading = true;
    disposed = true;
    try {
      console.info("[adaptive] live reload (" + reason + ")", currentBuildId, "→", nextId);
    } catch {}
    // reload "duro" evita bfcache com HTML/JS velhos
    window.location.reload();
  }

  // --- SSE (principal) ---
  try {
    const es = new EventSource("/_adaptive/livereload");
    es.addEventListener("reload", (ev) => {
      try {
        const data = JSON.parse(ev.data);
        triggerReload(data && data.buildId, "sse");
      } catch {}
    });
    es.onerror = () => {
      // browser reconecta sozinho; poll cobre o intervalo
    };
    window.addEventListener("beforeunload", () => {
      disposed = true;
      try { es.close(); } catch {}
    }, { once: true });
  } catch {}

  // --- Poll (fallback) ---
  async function poll() {
    if (disposed || reloading) return;
    try {
      const res = await fetch("/_adaptive/build-meta.json?ts=" + Date.now(), {
        cache: "no-store",
        headers: { "cache-control": "no-store" },
      });
      if (!res.ok) return;
      const meta = await res.json();
      triggerReload(meta && meta.buildId, "poll");
    } catch {}
  }

  const interval = window.setInterval(poll, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });
  window.addEventListener("beforeunload", () => {
    disposed = true;
    window.clearInterval(interval);
  }, { once: true });

  // primeira checagem rápida
  poll();
})();
</script>`;
}
