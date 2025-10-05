<script lang="ts" context="module">
	import type {
		ProviderConfig as ProviderConfigType,
		ProviderId as ProviderIdType
	} from '$lib/llm/providers';

	export type ProviderSelectionState = {
		options: ProviderConfigType[];
		loading: boolean;
		selectedId: ProviderIdType | '';
		current: ProviderConfigType | null;
		error: string | null;
		settingsError: string | null;
	};

	export type ModelSelectionState = {
		options: string[];
		loading: boolean;
		selected: string;
		error: string | null;
	};
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import PromptSettingsForm from './PromptSettingsForm.svelte';
	import type { ProviderId } from '$lib/llm/providers';
	import {
		defaultGenerationOptions,
		type LLMGenerationOptions
	} from '$lib/llm/settings';

	const EMPTY_PROVIDER_STATE: ProviderSelectionState = {
		options: [],
		loading: false,
		selectedId: '' as ProviderId,
		current: null,
		error: null,
		settingsError: null
	};

	const EMPTY_MODEL_STATE: ModelSelectionState = {
		options: [],
		loading: false,
		selected: '',
		error: null
	};

	export let providerState: ProviderSelectionState = EMPTY_PROVIDER_STATE;
	export let modelState: ModelSelectionState = EMPTY_MODEL_STATE;
	export let systemPrompt = '';
	export let options: LLMGenerationOptions = { ...defaultGenerationOptions };
	export let showPromptSettings = true;

	const dispatch = createEventDispatcher<{
		providerChange: ProviderId;
		modelChange: string;
		systemPromptChange: string;
		optionsChange: LLMGenerationOptions;
	}>();

	const handleProviderChange = (event: Event) => {
		const value = (event.currentTarget as HTMLSelectElement).value as ProviderId;
		dispatch('providerChange', value);
	};

	const handleModelChange = (event: Event) => {
		const value = (event.currentTarget as HTMLSelectElement).value;
		dispatch('modelChange', value);
	};

	const handleSystemPromptChange = (event: CustomEvent<string>) => {
		const value = event.detail;
		systemPrompt = value;
		dispatch('systemPromptChange', value);
	};

	const handleOptionsChange = (event: CustomEvent<LLMGenerationOptions>) => {
		const nextOptions = event.detail;
		options = nextOptions;
		dispatch('optionsChange', nextOptions);
	};
</script>

<div class="grid gap-4 lg:grid-cols-2">
	<div class="flex flex-col gap-2">
		<label class="text-xs font-semibold uppercase tracking-wide text-surface-400">
			<span>Provider</span>
			<select
				value={providerState.selectedId}
				on:change={handleProviderChange}
				disabled={providerState.loading || !providerState.options.length}
				class="input bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
			>
				{#each providerState.options as option (option.id)}
					<option class="bg-surface-900" value={option.id}>{option.label}</option>
				{/each}
			</select>
		</label>
		{#if providerState.loading}
			<p class="text-xs text-surface-400">Loading providers…</p>
		{:else if providerState.error}
			<p class="text-xs text-error-300">{providerState.error}</p>
		{:else if providerState.current?.description}
			<p class="text-xs text-surface-400/90">{providerState.current.description}</p>
		{/if}
		{#if providerState.settingsError}
			<p class="text-xs text-error-300">{providerState.settingsError}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		<label class="text-xs font-semibold uppercase tracking-wide text-surface-400">
			<span>Model</span>
			<select
				value={modelState.selected}
				on:change={handleModelChange}
				disabled={modelState.loading || !modelState.options.length}
				class="input bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
			>
				{#each modelState.options as modelName (modelName)}
					<option class="bg-surface-900" value={modelName}>{modelName}</option>
				{/each}
			</select>
		</label>
		{#if modelState.loading}
			<p class="text-xs text-surface-400">Loading models…</p>
		{:else if modelState.error}
			<p class="text-xs text-error-300">{modelState.error}</p>
		{:else if !modelState.options.length}
			<p class="text-xs text-surface-400/90">No models available for this provider.</p>
		{/if}
	</div>

	{#if showPromptSettings}
		<div class="flex flex-col gap-4 lg:col-span-2">
			<PromptSettingsForm
				systemPrompt={systemPrompt}
				options={options}
				on:systemPromptChange={handleSystemPromptChange}
				on:optionsChange={handleOptionsChange}
			/>
		</div>
	{/if}
</div>
