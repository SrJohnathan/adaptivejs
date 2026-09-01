# __APP_NAME__

Projeto AdaptiveJS — app web com SSR, hidratação DOM-first, reatividade fine-grained e roteamento por arquivos.

## Stack

- **Framework:** [AdaptiveJS](https://github.com/antonioweb/adaptivejs) (`@adaptive-js/*`)
- **Linguagem:** TypeScript + TSX
- **Runtime web:** `@adaptive-js/web`
- **Build / dev:** `@adaptive-js/ci`
- **Deploy SSR:** `@adaptive-js/adapter-nitro`

## Começar

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Outros scripts:

```bash
npm run build     # build de produção
npm run preview   # preview do build
npm run start     # sobe o server de produção
npm run typecheck
```

## Estrutura

```txt
__APP_NAME__/
  dependency.ts          # entry client global (libs, tema, side effects)
  index.html             # shell HTML
  public/
    styles.css           # CSS global (Tailwind / BeerCSS / plain)
  src/
    pages/
      index.tsx          # rota /
      404.tsx            # página HTTP 404 customizada
    components/          # componentes reutilizáveis (se gerados)
    auth.ts              # auth server-side (se extensão auth)
    i18n.ts              # i18n (se extensão i18n)
  language/              # JSON de idiomas (se extensão i18n)
  AGENTS.md              # guia para agentes / LLMs
```

### Rotas

Arquivos em `src/pages` viram rotas automaticamente:

| Arquivo | Rota |
|---|---|
| `src/pages/index.tsx` | `/` |
| `src/pages/about.tsx` | `/about` |
| `src/pages/dashboard/index.tsx` | `/dashboard` |
| `src/pages/404.tsx` | página 404 (não é rota normal) |

### Modos de execução

- **`server`** — lógica só no servidor (actions, helpers)
- **`hydrate`** — HTML no server + interatividade no client
- **`client`** — monta direto no browser

## Extensões (opcionais)

Se o scaffold incluiu extensões:

| Extensão | Pacote | Uso típico |
|---|---|---|
| auth | `@adaptive-js/extension-auth` | sessões, `protectPage`, CSRF |
| i18n | `@adaptive-js/extension-i18n` | traduções reativas |
| icons | `@adaptive-js/extension-lucide-animation-icons` | ícones animados |

## Documentação para agentes

- [`AGENTS.md`](./AGENTS.md) — primeiros passos e trilha de SaaS
- [`.cursor/skills/adaptivejs/SKILL.md`](./.cursor/skills/adaptivejs/SKILL.md) — APIs AdaptiveJS com exemplos de código


## Licença

MIT (herdada do AdaptiveJS, salvo indicação contrária no seu projeto).
