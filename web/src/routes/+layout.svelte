<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.png';
	import { Toaster } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '$lib/stores/toaster';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/png" href={favicon} />
</svelte:head>

{@render children?.()}

<Toaster {toaster} classes="z-[100]" />
