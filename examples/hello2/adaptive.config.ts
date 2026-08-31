import type { AdaptiveConfig } from "@adaptive-js/ci"; // se exportar o tipo
// ou sem tipo:

export default {
    client: {
        external: ["monaco-editor", /^monaco-editor\//],
    },
} satisfies AdaptiveConfig;