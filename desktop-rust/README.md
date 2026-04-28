# @adaptivejs/desktop-rust

Base nativa do alvo desktop do `Adaptive` com `iced + tokio`.

## Direcao

- sem Tauri
- sem webview
- Rust puro como fundacao
- `iced` como toolkit de UI
- `tokio` como runtime assíncrono

## Estrutura atual

- `Cargo.toml`
  crate raiz do desktop
- `src/main.rs`
  app inicial em `iced`, com tarefa assíncrona usando `tokio`

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
```

Eles chamam diretamente:

- `cargo run`
- `cargo build`
- `cargo check`

## Status

- scaffold Tauri removido
- base nativa com `iced` criada
- `tokio` integrado
- proximo passo natural: mapear a IR declarativa do `Adaptive` para widgets e layout do `iced`
