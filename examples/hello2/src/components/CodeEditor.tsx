"client";

import { useReactive, useRef, useClientEffect, useDOMEffect } from "@adaptive-js/web";
import * as monaco from "monaco-editor";

export type CodeEditorProps = {
    initialCode?: string;
    language?: string;
    onCodeChange?: (newCode: string) => void;
};

export function CodeEditor({
                               initialCode = "",
                               language = "typescript",
                               onCodeChange
                           }: CodeEditorProps) {
    // Teu tuplo nativo [getter, setter]
    const [code, setCode] = useReactive(initialCode);
    const editorRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    // 1. Disparo inicial puro e isolado (DOMContentLoaded / Mount único)
    // Graças ao motor novo, este bloco roda sem capturar subscrições reativas!

    useClientEffect(() => {

        console.log("carregando editor")
        console.log(code())



    },[])

    useDOMEffect(() => {
        if (!editorRef.current) return;

        // O useDOMEffect já executa em untrack(), então ler code() aqui é 100% seguro
        const editorInstance = monaco.editor.create(editorRef.current, {
            value: code(),
            language: language,
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false }, // Editor limpo e minimalista para o Lovable
            fontSize: 14,
            fontFamily: "Fira Code, monospace",
            lineHeight: 21,
            scrollbar: { vertical: "auto", horizontal: "auto" }
        });

        instanceRef.current = editorInstance;

        // Ouve as mudanças do Monaco de forma imperativa e atualiza o teu sinal do Adaptive
        const subscription = editorInstance.onDidChangeModelContent(() => {
            const currentVal = editorInstance.getValue();

            // Atualiza o estado atómico do teu framework (Fine-Grained)
            setCode(currentVal);

            if (onCodeChange) {
                onCodeChange(currentVal);
            }
        });

        // Limpeza total do motor se o componente for destruído ou mudar de ecrã
        return () => {
            subscription.dispose();
            editorInstance.dispose();
        };
    });

    // 2. Sincronização focada: Só altera se a linguagem mudar lá de fora (ex: mudar de aba na IDE)
    useClientEffect(() => {
        const editor = instanceRef.current;
        if (editor) {
            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, language);
            }
        }
    }, [language]);

    // Retorna apenas a div crua e limpa que o Monaco vai controlar autonomamente
    return (
        <div
            ref={editorRef}
            className="w-full h-60 text-left bg-[#1e1e1e]"
        />
    );
}