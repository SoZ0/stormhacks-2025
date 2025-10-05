<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import {
    defaultGenerationOptions,
    type LLMGenerationOptions
  } from '$lib/llm/settings';
  import PromptSettingsForm from './PromptSettingsForm.svelte';

  export let open = false;
  export let systemPrompt = '';
  export let options: LLMGenerationOptions = { ...defaultGenerationOptions };

  const dispatch = createEventDispatcher<{
    close: void;
    systemPromptChange: string;
    optionsChange: LLMGenerationOptions;
  }>();

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

  $: if (open) {
    tick().then(() => {
      dialogEl?.focus();
    });
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-[80] flex items-center justify-center bg-surface-950/80 px-4 py-8 backdrop-blur-sm"
    role="presentation"
    on:click={handleBackdropClick}
  >
    <div
      class="relative w-full max-w-2xl rounded-3xl border border-surface-800/60 bg-surface-950/95 p-6 shadow-2xl shadow-surface-950/40"
      role="dialog"
      aria-modal="true"
      aria-label="Prompt settings"
      tabindex="-1"
      bind:this={dialogEl}
      on:keydown={handleKeydown}
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-surface-50">Prompt Settings</h2>
          <p class="text-sm text-surface-400">Configure the system prompt and generation behaviour.</p>
        </div>
        <button
          type="button"
          class="btn btn-icon btn-icon-base border border-surface-800/60 bg-surface-950/60 text-surface-300 transition hover:text-surface-50"
          on:click={() => dispatch('close')}
          aria-label="Close prompt settings"
        >
          ✕
        </button>
      </div>
      <div class="mt-6">
        <PromptSettingsForm
          systemPrompt={systemPrompt}
          options={options}
          on:systemPromptChange={handleSystemPromptChange}
          on:optionsChange={handleOptionsChange}
        />
      </div>
    </div>
  </div>
{/if}
