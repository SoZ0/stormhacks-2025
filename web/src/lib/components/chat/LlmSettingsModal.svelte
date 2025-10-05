<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import LlmSettingsPanel from '$lib/components/settings/LlmSettingsPanel.svelte';

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  let dialogEl: HTMLDivElement | null = null;

  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      dispatch('close');
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch('close');
    }
  };

  $: if (open) {
    tick().then(() => {
      dialogEl?.focus();
    });
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-[90] flex items-center justify-center bg-surface-950/80 px-4 py-8 backdrop-blur-sm"
    role="presentation"
    on:click={handleBackdropClick}
  >
    <div
      class="settings-modal relative w-full max-w-5xl overflow-hidden rounded-3xl border border-surface-800/60 bg-surface-950/95 shadow-2xl shadow-surface-950/40"
      role="dialog"
      aria-modal="true"
      aria-label="LLM settings"
      tabindex="-1"
      bind:this={dialogEl}
      on:keydown={handleKeydown}
    >
      <button
        type="button"
        class="btn btn-icon btn-icon-base absolute right-4 top-4 border border-surface-800/60 bg-surface-950/60 text-surface-300 transition hover:text-surface-50"
        on:click={() => dispatch('close')}
        aria-label="Close LLM settings"
      >
        ✕
      </button>
      <div class="settings-modal__content">
        <LlmSettingsPanel variant="modal" />
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-modal {
    max-height: min(92vh, 960px);
  }

  .settings-modal__content {
    height: 100%;
    overflow-y: auto;
  }
</style>
