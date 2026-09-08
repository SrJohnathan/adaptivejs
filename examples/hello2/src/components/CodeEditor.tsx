"client";

import {init, ref, signal} from "@adaptive-js/web";
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
    const [code, setCode] = signal(initialCode);
    const editorRef = ref<HTMLDivElement | null>(null);
    const instanceRef = ref<monaco.editor.IStandaloneCodeEditor | null>(null);



    // 2. Sincronização focada: Só altera se a linguagem mudar lá de fora (ex: mudar de aba na IDE)
    init(() => {
        const editor = instanceRef.current;
        if (editor) {
            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, language);
            }
        }



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

    // Retorna apenas a div crua e limpa que o Monaco vai controlar autonomamente
    return (
        <div
            ref={editorRef}
            className="w-full h-60 text-left bg-[#1e1e1e]"
        />
    );
}