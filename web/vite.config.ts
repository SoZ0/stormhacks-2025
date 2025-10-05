import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(() => {
	const isTauri = Boolean(
		process.env.TAURI_PLATFORM ||
		process.env.TAURI_ARCH ||
		process.env.TAURI_FAMILY ||
		process.env.TAURI_ENV_PLATFORM ||
		process.env.TAURI_BUILD
	);

	const tauriDevHost = process.env.TAURI_DEV_HOST || '127.0.0.1';
	const tauriDevPort = Number(process.env.TAURI_DEV_PORT ?? 1420);
	const tauriHmrPort = Number(process.env.TAURI_DEV_HMR_PORT ?? tauriDevPort + 1);

	return {
		plugins: [tailwindcss(), sveltekit()],
		base: isTauri ? './' : undefined,
		clearScreen: false,
		server: isTauri
			? {
				host: tauriDevHost,
				port: tauriDevPort,
				strictPort: true,
				watch: {
					ignored: ['**/src-tauri/**']
				},
				hmr: process.env.TAURI_DEV_HOST
					? {
						protocol: 'ws',
						host: process.env.TAURI_DEV_HOST,
						port: tauriHmrPort
					}
					: undefined
			}
			: {
				host: true,
				port: 5173,
				strictPort: true
			},
		preview: isTauri
			? {
				host: tauriDevHost,
				port: 4173,
				strictPort: true
			}
			: {
				host: true,
				port: 4173,
				strictPort: true
			},
		build: {
			target: isTauri ? ['es2021', 'chrome105', 'safari13'] : undefined,
			minify: isTauri ? false : 'esbuild',
			sourcemap: isTauri
		}
	};
});
