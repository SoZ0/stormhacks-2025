# StormHacks 2025

This repository contains the StormHacks 2025 client. The `web/` workspace holds the shared SvelteKit front end and the Tauri-powered desktop shell that compiles down to native binaries.

## Built Using

<p align="left">
    <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" />
    <img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" />
    <img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
    <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
    <img alt="Rust" src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" />
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" />
</p>

## Directory layout
- `web/` – SvelteKit app, build tooling, and the Tauri Rust crate
- `web/src-tauri/` – Rust sources and generated desktop bundles

## Prerequisites
- Node.js 20+ (or Bun 1.1+) for the SvelteKit toolchain
- Rust toolchain (1.78+) with `cargo`
- Platform-specific build dependencies for [Tauri 2.x](https://tauri.app/start/prerequisites/) (e.g. WebKitGTK + GTK3 on Linux, Xcode CLT on macOS, or Visual Studio Build Tools on Windows)

> Tip: If you prefer npm, replace the `bun` commands below with their `npm run` equivalents after running `npm install`. Bun is faster but not required.

## Install dependencies
```bash
cd web
bun install
```

## Compile the web build
Produces the static web bundle used for browser deployments and bundled into the desktop app.
```bash
bun run build
```
Artifacts live in `web/build/`.

## Build the combined static site
Packages the marketing page under the root URL and the Svelte app under `/demo`.
```bash
./build-sites.sh [output-directory]  # defaults to ./dist
```
The script selects Bun, pnpm, or npm automatically, builds the SvelteKit app with `TAURI_BUILD=1`, and copies the contents of `tech/` to the output root. The final layout looks like:
- `<output>/index.html` – the tech landing page
- `<output>/demo/` – the static SvelteKit build from `web/build/`

## Compile the desktop binaries
Runs the SvelteKit production build and compiles the Rust binary plus native installers for the host OS.
```bash
bun run tauri:build
```
Results are written to `web/src-tauri/target/release/bundle/`. Expect subdirectories like `appimage`, `deb`, `msi`, `nsis`, or `dmg` depending on your platform.

## Build for Android
Android support is configured with a pre-generated Gradle project under `web/src-tauri/gen/android`. You can open it in Android Studio or drive builds from the Tauri CLI.

### Prerequisites
- Android SDK (API 34+) with platform tools, cmdline-tools, and build tools
- Android NDK r26+ (needed for Rust targets)
- Export `ANDROID_HOME` and `NDK_HOME` so Gradle can locate the SDK/NDK
- Install Android Rust targets once via `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`

### Commands
```bash
# One-time project sync (already checked in, safe to re-run if the CLI updates)
bun run tauri:android:init

# Run on an attached/emulated device
bun run tauri:android:dev

# Produce release APK/AAB artefacts in gen/android/app/build/outputs
bun run tauri:android:build
```

## Build for iOS
iOS builds require macOS with Xcode and the iOS toolchain. The Tauri CLI will scaffold the Xcode project and drive dev/release workflows once those dependencies are available.

### Prerequisites
- macOS with the latest Xcode (including Command Line Tools)
- CocoaPods (if you plan to add native dependencies)

### Commands
```bash
# Run once to generate web/src-tauri/gen/ios (must be executed on macOS)
bun run tauri:ios:init

# Boot the app in the simulator or on a connected device
bun run tauri:ios:dev

# Produce an .ipa using Xcode's export pipeline
bun run tauri:ios:build
```
The iOS scaffold is not committed in this repository because it depends on macOS-only tooling. Run the `init` command above on a Mac and commit the generated `web/src-tauri/gen/ios` directory if you want it version controlled.

### Just the Rust binary
If you only need the executable without installers, build directly with Cargo:
```bash
cd web/src-tauri
cargo build --release
```
The binary will be located at `web/src-tauri/target/release/stormhacks_desktop` (with the appropriate extension on Windows).

## Helpful development commands
- `bun run dev` – Start the Vite dev server for web testing
- `bun run tauri:dev` – Launch the desktop shell pointing at the dev server
- `bun run check` – Type-check the Svelte + TypeScript sources
- `bun run lint` – Run static analysis and formatting checks

## Offline speech recognition
- Download a Vosk model archive (for English, grab `vosk-model-small-en-us-0.15.zip` from [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models)).
- Drop the zip directly into `web/static/models/` — no repackaging is required. The runtime converts it to the expected `tar.gz` layout on the fly.
- The desktop bundle (and dev server) will look for `web/static/models/vosk-model-small-en-us-0.15.zip` by default. Override the location by setting `VITE_VOSK_MODEL_PATH` in `web/.env` to point at a different archive (zip or tar.gz are both accepted).
- The first microphone activation may take a few seconds while the model is unpacked in WebAssembly. Subsequent sessions reuse the in-memory model—no network access is required once the archive is present.

## Troubleshooting
- Ensure the platform-specific dependencies from the Tauri docs are installed before running `bun run tauri:build`.
- Delete `web/src-tauri/target` if you encounter stale bundle artefacts, then rebuild.
- On Linux, export `WEBKIT_DISABLE_DMABUF_RENDERER=1` if WebKitGTK crashes while bundling.
