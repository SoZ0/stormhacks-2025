<script lang="ts">
	import { fly } from 'svelte/transition';
	import { createEventDispatcher } from 'svelte';
	import { Navigation } from '@skeletonlabs/skeleton-svelte';

	const recentChats = ['General Inquiry', 'Support', 'Agent A'];

	export let isCollapsed = false;
	export let settingsHref = '#';
	export let isPersistingSettings = false;
	export let settingsPersistError: string | null = null;

	const dispatch = createEventDispatcher<{ newChat: void }>();

	const handleNewChat = () => {
		dispatch('newChat');
	};

	const sidebarId = 'sidebar';
</script>

{#snippet sidebarHeader()}
	<div class="flex w-full flex-col gap-4">
		<button
			type="button"
			class="btn btn-base preset-filled-primary-500 text-[color:var(--color-primary-contrast-500)] shadow-lg shadow-primary-500/20"
			on:click={handleNewChat}
		>
			<span class="text-sm font-semibold tracking-wide">New Chat</span>
		</button>
		<h3 class="text-xs font-semibold uppercase tracking-wide text-surface-400">Recent</h3>
	</div>
{/snippet}

{#snippet sidebarTiles()}
	<div class="flex w-full flex-col gap-4">
		{#each recentChats as label}
			<Navigation.Tile
				id={`${sidebarId}-${label}`}
				label={label}
				labelExpanded={label}
				background=""
				classes="w-full items-center justify-center"
				expandedClasses="w-full justify-start"
			expandedPadding="p-4"
				labelClasses="text-[0.65rem] text-surface-400"
				labelExpandedClasses="text-sm font-medium text-surface-100"
			/>
		{/each}
	</div>
{/snippet}

{#snippet sidebarFooter()}
	<div class="flex w-full flex-col gap-4 text-xs text-surface-400">
		<a
			href={settingsHref}
			class="font-semibold text-primary-300 transition hover:text-primary-200"
		>
			Open LLM settings
		</a>
		{#if isPersistingSettings}
			<span class="text-[color:var(--color-surface-300)]">Saving…</span>
		{:else if settingsPersistError}
			<span class="text-error-300">{settingsPersistError}</span>
		{/if}
	</div>
{/snippet}

<aside
	class={`fixed inset-y-0 left-0 z-30 h-full w-72 max-w-[80vw] transition-transform duration-300 ${
		isCollapsed ? '-translate-x-full lg:translate-x-0' : 'translate-x-0'
	} lg:static lg:w-72 xl:w-80`}
	aria-hidden={isCollapsed}
	transition:fly|local={{ x: -200, duration: 200 }}
>
	<Navigation.Rail
		value={sidebarId}
		header={sidebarHeader}
		tiles={sidebarTiles}
		footer={sidebarFooter}
		expanded={!isCollapsed}
		background="preset-filled-surface-950-900 border border-surface-800/40"
		padding="p-4"
		width="w-72"
		widthExpanded="w-80"
		classes="h-full overflow-y-auto text-surface-100"
		headerGap="gap-4"
		headerClasses="w-full"
		tilesGap="gap-4 w-full"
		footerClasses="w-full"
	/>
</aside>
