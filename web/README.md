# StormHacks Web + Desktop

This directory contains the SvelteKit front-end used by both the web deployment and the Tauri-powered desktop application.

## Requirements

- [Bun](https://bun.sh/) (recommended for scripts and dependency management)
- [Rust](https://www.rust-lang.org/tools/install) toolchain with `cargo`
- Platform build requirements for [Tauri 1.x](https://tauri.app/start/prerequisites/)

## Scripts

- `bun run dev` – start the Vite/SvelteKit dev server
- `bun run build` – build the web bundle using the configured adapter
- `bun run tauri:dev` – launch the Tauri shell pointing at the dev server
- `bun run tauri:build` – create desktop bundles (Windows + Linux, including AppImage)

Tauri builds automatically rerun `bun run tauri:build:frontend` to produce a static SvelteKit build with the correct adapter and asset base path.

## Desktop Packaging Targets

The Tauri configuration (`src-tauri/tauri.conf.json`) enables the following bundles:

- Windows: `msi` and `nsis`
- Linux: `deb`, `rpm`, and `appimage`

When building on Linux, ensure the WebKitGTK stack (`libwebkit2gtk-4.1-0`, `libgtk-3-0`, `libayatana-appindicator3-1`) is available on the host system. On Windows, at least one of the WiX Toolset or NSIS should be present for their respective installers.

For cross-compilation guidance and additional target-specific prerequisites, see the [Tauri bundler docs](https://tauri.app/start/prerequisites/#bundler-prerequisites).

## Development Flow

1. Install dependencies with `bun install`
2. Run `bun run dev` for browser development, or `bun run tauri:dev` for the desktop shell
3. When ready to package, run `bun run tauri:build`

The desktop build outputs live under `src-tauri/target/release/bundle`.
