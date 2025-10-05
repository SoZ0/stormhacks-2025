<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ThinkingMode, ThinkingModeOption } from '$lib/chat/types';

  export let value = '';
  export let isSending = false;
  export let isDisabled = false;
  export let thinkingMode: ThinkingMode = 'auto';
  const DEFAULT_THINKING_MODE_OPTIONS: ThinkingModeOption[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'expanded', label: 'Expanded' },
    { value: 'collapsed', label: 'Collapsed' },
    { value: 'hidden', label: 'Hidden' }
  ];

  export let thinkingModeOptions: ThinkingModeOption[] = [];
  export let showThinkingModeControl = false;
  $: availableThinkingModeOptions = thinkingModeOptions.length
    ? thinkingModeOptions
    : DEFAULT_THINKING_MODE_OPTIONS;

  const dispatch = createEventDispatcher<{
    send: void;
    openSettings: void;
    thinkingModeChange: ThinkingMode;
  }>();

  const emitSend = () => {
    if (!isSending && !isDisabled) {
      dispatch('send');
    }
  };

  const emitOpenSettings = () => {
    dispatch('openSettings');
  };

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      emitSend();
    }
  };

  const handleThinkingModeChange = (event: Event) => {
    const target = event.currentTarget as HTMLSelectElement | null;
    const next = (target?.value ?? '') as ThinkingMode;
    dispatch('thinkingModeChange', next);
  };

  $: availableThinkingModeOptions = thinkingModeOptions.length
    ? thinkingModeOptions
    : DEFAULT_THINKING_MODE_OPTIONS;

</script>

<div class="flex items-center gap-3 rounded-2xl border border-surface-800/60 bg-surface-950/60 px-4 py-4 shadow-lg shadow-surface-950/20 ">
	<button
		type="button"
		class="btn btn-icon btn-icon-lg border border-primary-500 bg-primary-500 text-xl text-[color:var(--color-primary-contrast-500)]  transition hover:text-surface-50"
		on:click={emitOpenSettings}
		aria-label="Open prompt settings"
	>
		⚙
	</button>
	{#if showThinkingModeControl && availableThinkingModeOptions.length}
		<label class="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-surface-400">
			<span>Thinking</span>
			<select
				class="input min-w-[132px] bg-surface-950/60 ring-1 ring-surface-800/60 text-xs text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500"
				bind:value={thinkingMode}
				on:change={handleThinkingModeChange}
				disabled={isSending || isDisabled}
			>
				{#each availableThinkingModeOptions as option (option.value)}
					<option class="bg-surface-900" value={option.value} title={option.description ?? undefined}>
						{option.label}
					</option>
				{/each}
			</select>
		</label>
	{/if}
	<textarea
		bind:value
		rows="2"
		placeholder="Send a message..."
		on:keydown={handleKey}
		disabled={isSending || isDisabled}
		class="textarea flex-1 w-full resize-none border-none bg-transparent text-sm text-surface-50 placeholder:text-surface-500 focus:outline-none"
	></textarea>
	<button
		class="btn btn-icon btn-icon-lg bg-primary-500 text-[color:var(--color-primary-contrast-500)] text-xl transition disabled:opacity-60"
		type="button"
		on:click={emitSend}
		disabled={isSending || isDisabled}
		aria-busy={isSending}
	>
		{#if isSending}
			<span class="animate-pulse">…</span>
		{:else}
			<span>➤</span>
		{/if}
	</button>
</div>
