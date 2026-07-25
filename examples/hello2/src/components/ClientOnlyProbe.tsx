"client";

import EditorJS from "@editorjs/editorjs";
import { useClientEffect, useRef } from "@adaptive-js/web";

const browserUserAgent = window.navigator.userAgent;
const browserLanguage = window.navigator.language;
const browserViewport = `${window.innerWidth}x${window.innerHeight}`;

export function ClientOnlyProbe() {
    const editorRootRef = useRef<HTMLDivElement | null>(null);
    const editorInstanceRef = useRef<EditorJS | null>(null);

    useClientEffect(() => {
        if (!editorRootRef.current || editorInstanceRef.current) {
            return;
        }

        const editor = new EditorJS({
            holder: editorRootRef.current,
            placeholder: "EditorJS carregado apenas no cliente"
        });

        editorInstanceRef.current = editor;

        return () => {
            const instance = editorInstanceRef.current;
            editorInstanceRef.current = null;
            void instance?.destroy?.();
        };
    }, []);

    return (
        <section className="grid gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5 text-amber-50">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Teste de client puro</h2>
                <span className="rounded-full bg-amber-300/20 px-3 py-1 text-xs font-medium text-amber-100">
                    client
                </span>
            </div>

            <p className="max-w-2xl text-sm leading-7 text-amber-100/90">
                Este componente acessa <code className="rounded bg-black/20 px-2 py-1">window</code> e carrega
                <code className="ml-1 rounded bg-black/20 px-2 py-1">@editorjs/editorjs</code> so no cliente.
                Se ainda passasse pelo SSR, a pagina quebraria no servidor.
            </p>

            <div className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-200">
                <p><strong className="text-white">language:</strong> {browserLanguage}</p>
                <p><strong className="text-white">viewport:</strong> {browserViewport}</p>
                <p className="break-all"><strong className="text-white">userAgent:</strong> {browserUserAgent}</p>
            </div>

            <div
                ref={editorRootRef}
                className="min-h-40 rounded-xl border border-white/10 bg-white/90 p-4 text-slate-900"
            />
        </section>
    );
}
