<script lang="ts" context="module">
	import type { ModelOption as ModelOptionType } from '$lib/chat/types';

	export type ModelPreviewState = {
		models: ModelOptionType[];
		index: number;
		current: ModelOptionType | null;
	};
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Live2DPreview, type Live2DPreviewConfig } from '$lib';
	import type { ModelOption } from '$lib/chat/types';

	const DEFAULT_MODEL: ModelOption = {
		id: 'placeholder-model',
		label: 'Model preview unavailable',
		modelPath: '/models/hiyori/runtime/hiyori_pro_t11.model3.json',
		availableModelFiles: ['/models/hiyori/runtime/hiyori_pro_t11.model3.json'],
		cubismCorePath: '/vendor/live2d/live2dcubismcore.min.js',
		anchor: { x: 0.5, y: 0.5 },
		position: { x: 0.5, y: 0.95 },
		scaleMultiplier: 1,
		targetHeightRatio: 0.9,
		createdAt: 0,
		updatedAt: 0,
		isCustom: false,
		editable: false,
		removable: false,
		storage: 'builtin'
	};

	export let state: ModelPreviewState = { models: [], index: 0, current: null };
	export let expressionOptions: string[] = [];
	export let selectedExpression = '';
	export let autoGenerateAudio = false;

	const dispatch = createEventDispatcher<{
		prev: void;
		next: void;
		confirm: number;
		autoGenerateAudioChange: boolean;
	}>();

	const handlePrev = () => dispatch('prev');
	const handleNext = () => dispatch('next');
	const handleConfirm = () => dispatch('confirm', state.index);
	const handleAutoAudioToggle = () => {
		const next = !autoGenerateAudio;
		dispatch('autoGenerateAudioChange', next);
	};

	let isSettingsOpen = false;
	let settingsButton: HTMLButtonElement | null = null;
	let settingsMenu: HTMLDivElement | null = null;

	const closeSettings = () => {
		isSettingsOpen = false;
	};

	const toggleSettings = () => {
		isSettingsOpen = !isSettingsOpen;
	};

	const handleWindowClick = (event: MouseEvent) => {
		if (!isSettingsOpen) return;
		const target = event.target as Node;
		if (settingsMenu?.contains(target) || settingsButton?.contains(target)) return;
		closeSettings();
	};

	const handleWindowKeydown = (event: KeyboardEvent) => {
		if (!isSettingsOpen) return;
		if (event.key === 'Escape') {
			closeSettings();
			settingsButton?.focus();
		}
	};

	let activeModel: ModelOption = DEFAULT_MODEL;
	let previewConfig: Live2DPreviewConfig = { modelPath: DEFAULT_MODEL.modelPath };
	let isPreviewLoading = false;
	type Live2DPreviewHandle = { setExpression: (name: string) => void };
	let live2dRef: Live2DPreviewHandle | null = null;

	$: hasExpressions = expressionOptions.length > 0;
	$: if (!hasExpressions && selectedExpression) {
		selectedExpression = '';
	}
	$: if (hasExpressions && (!selectedExpression || !expressionOptions.includes(selectedExpression))) {
		selectedExpression = expressionOptions[0];
	}
	$: if (selectedExpression && live2dRef) {
		void expressionOptions;
		live2dRef.setExpression(selectedExpression);
	}

	const handleExpressionChange = (event: Event) => {
		const target = event.target as HTMLSelectElement;
		const value = target?.value ?? '';
		selectedExpression = value;
		if (value && live2dRef) {
			live2dRef.setExpression(value);
		}
	};

	$: activeModel = state.current ?? state.models[state.index] ?? DEFAULT_MODEL;
	$: previewConfig = {
		modelPath: activeModel.modelPath,
		cubismCorePath: activeModel.cubismCorePath,
		scaleMultiplier: activeModel.scaleMultiplier,
		targetHeightRatio: activeModel.targetHeightRatio,
		anchor: activeModel.anchor,
		position: activeModel.position,
		storage: activeModel.storage,
		localModelId: activeModel.storage === 'local' ? activeModel.id : null
	};
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} />

<div
	class="flex h-full flex-col gap-4 overflow-hidden rounded-3xl border border-surface-800/60 bg-gradient-to-b from-surface-950/80 via-surface-950/60 to-surface-950/30 p-4 shadow-xl shadow-surface-950/30"
>
	<header class="flex flex-col gap-4">
		<div class="flex items-start justify-between gap-3">
			<div class="flex flex-col gap-2">
				<p class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-500">Model Preview</p>
				<h2 class="text-lg font-semibold text-surface-50">{activeModel.label}</h2>
			</div>
			<div class="relative">
				<button
					type="button"
					class="btn btn-icon btn-icon-base border border-surface-800/60 bg-surface-950/60 text-sm text-surface-300 transition hover:text-surface-50"
					aria-label={isSettingsOpen ? 'Close model settings' : 'Open model settings'}
					aria-expanded={isSettingsOpen}
					aria-haspopup="dialog"
					on:click|stopPropagation={toggleSettings}
					bind:this={settingsButton}
				>
					<span aria-hidden="true">⚙</span>
				</button>
				{#if isSettingsOpen}
					<div
						class="absolute right-0 top-11 z-20 w-64 rounded-2xl border border-surface-800/60 bg-surface-950/95 p-4 shadow-xl shadow-surface-950/50"
						role="dialog"
						tabindex="-1"
						on:click|stopPropagation
						on:keydown|stopPropagation
						bind:this={settingsMenu}
					>
						<div class="flex flex-col gap-3">
							<div class="flex flex-col gap-2">
								<span class="text-[10px] font-semibold uppercase tracking-[0.2em] text-surface-500">Model Settings</span>
								<div class="flex items-center justify-between gap-3">
									<div class="flex flex-col">
										<span class="text-sm font-semibold text-surface-100">Auto-generate audio</span>
										<span class="text-xs text-surface-400">Create TTS for new replies automatically.</span>
									</div>
									<button
										type="button"
										class={`relative inline-flex h-6 w-12 items-center rounded-full border transition ${
											autoGenerateAudio
												? 'border-primary-400 bg-primary-500/80'
												: 'border-surface-700 bg-surface-900/80'
										}`}
										role="switch"
										aria-checked={autoGenerateAudio}
										aria-label="Toggle automatic audio generation"
										on:click|stopPropagation={handleAutoAudioToggle}
									>
										<span
											class={`pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-surface-950 shadow-sm shadow-surface-950/60 transition-transform duration-150 ease-out ${
												autoGenerateAudio ? 'translate-x-5' : ''
											}`}
										></span>
									</button>
								</div>
							</div>
							<p class="text-xs text-surface-400">
								When off, use the Generate audio button on responses whenever you need TTS.
							</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</header>
	<div class="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-surface-800/40 bg-surface-950/40">
		<Live2DPreview
			config={previewConfig}
			bind:loading={isPreviewLoading}
			bind:expressions={expressionOptions}
			bind:this={live2dRef}
		/>
		{#if isPreviewLoading}
			<div class="absolute inset-0 z-20 flex items-center justify-center bg-surface-950/60 backdrop-blur-sm">
				<div class="h-10 w-10 animate-spin rounded-full border-2 border-primary-400/80 border-t-transparent" aria-hidden="true"></div>
				<span class="sr-only">Loading model preview…</span>
			</div>
		{/if}
		{#if expressionOptions.length}
			<div class="pointer-events-auto absolute left-4 top-4 flex flex-col gap-1 rounded-2xl border border-surface-800/50 bg-surface-950/80 px-3 py-2 text-xs text-surface-200 shadow-lg shadow-surface-950/40">
				<span class="font-semibold uppercase tracking-[0.2em] text-surface-400">Expression</span>
				<select
					class="w-40 rounded-xl border border-surface-700/60 bg-surface-950/80 px-3 py-2 text-sm text-surface-100 focus:border-primary-400 focus:outline-none"
					bind:value={selectedExpression}
					aria-label="Select expression"
					on:change={handleExpressionChange}
				>
					{#each expressionOptions as name}
						<option value={name}>{name}</option>
					{/each}
				</select>
			</div>
		{/if}
		<div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface-950/80 to-transparent"></div>
	</div>
	<div class="flex items-center justify-between gap-4 rounded-full border border-surface-800/40 bg-surface-950/70 px-4 py-4">
		<button
			type="button"
			class="btn btn-icon btn-icon-base text-lg text-surface-200 transition hover:text-surface-50"
			on:click={handlePrev}
		>
			⟨
		</button>
		<button
			type="button"
			class="btn btn-base bg-primary-500 text-[color:var(--color-primary-contrast-500)] font-semibold tracking-wide"
			on:click={handleConfirm}
		>
			{state.models[state.index]?.label ?? 'Select'}
		</button>
		<button
			type="button"
			class="btn btn-icon btn-icon-base text-lg text-surface-200 transition hover:text-surface-50"
			on:click={handleNext}
		>
			⟩
		</button>
	</div>
</div>
