<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let isSending = false;
  export let isDisabled = false;

  const dispatch = createEventDispatcher<{ send: void; openSettings: void }>();

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
	<textarea
		bind:value
		rows="2"
		placeholder="Send a message..."
		on:keydown={handleKey}
		disabled={isSending || isDisabled}
		class="textarea w-full resize-none border-none bg-transparent text-sm text-surface-50 placeholder:text-surface-500 focus:outline-none"
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
