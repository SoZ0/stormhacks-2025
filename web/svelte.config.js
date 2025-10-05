import adapterBun from 'svelte-adapter-bun';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations for more about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: process.env.TAURI_BUILD === '1'
			? adapterStatic({ fallback: 'index.html' })
			: adapterBun()
	}
};

export default config;
