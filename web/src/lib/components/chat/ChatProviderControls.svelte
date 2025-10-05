<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ProviderConfig, ProviderId } from '$lib/llm/providers';

  export let providers: ProviderConfig[] = [];
  export let providersLoading = false;
  export let selectedProviderId: ProviderId;
  export let currentProvider: ProviderConfig;
  export let computedProvidersError: string | null = null;
  export let settingsLoadError: string | null = null;
  export let availableModels: string[] = [];
  export let selectedModel = '';
  export let isModelsLoading = false;
  export let currentModelError: string | null = null;

  const dispatch = createEventDispatcher<{
    providerChange: ProviderId;
    modelChange: string;
  }>();

  const handleProviderChange = (event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement).value as ProviderId;
    selectedProviderId = value;
    dispatch('providerChange', value);
  };

  const handleModelChange = (event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    selectedModel = value;
    dispatch('modelChange', value);
  };
</script>

<div class="provider-controls">
  <div class="config-group">
    <label>
      <span>Provider</span>
      <select
        bind:value={selectedProviderId}
        on:change={handleProviderChange}
        disabled={providersLoading || !providers.length}
      >
        {#each providers as option (option.id)}
          <option value={option.id}>{option.label}</option>
        {/each}
      </select>
    </label>
    {#if providersLoading}
      <p class="config-hint">Loading providers…</p>
    {:else if computedProvidersError}
      <p class="config-error">{computedProvidersError}</p>
    {:else if currentProvider.description}
      <p class="config-hint">{currentProvider.description}</p>
    {/if}
    {#if settingsLoadError}
      <p class="config-error">{settingsLoadError}</p>
    {/if}
  </div>

  <div class="config-group">
    <label>
      <span>Model</span>
      <select
        bind:value={selectedModel}
        on:change={handleModelChange}
        disabled={isModelsLoading || !availableModels.length}
      >
        {#each availableModels as modelName (modelName)}
          <option value={modelName}>{modelName}</option>
        {/each}
      </select>
    </label>
    {#if isModelsLoading}
      <p class="config-hint">Loading models…</p>
    {:else if currentModelError}
      <p class="config-error">{currentModelError}</p>
    {:else if !availableModels.length}
      <p class="config-hint">No models available for this provider.</p>
    {/if}
  </div>
</div>

<style>
  .provider-controls {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 24px;
  }

  .config-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 180px;
  }

  .config-hint,
  .config-error {
    margin: 0;
    font-size: 0.75rem;
  }

  .config-hint {
    color: #8e8e8f;
  }

  .config-error {
    color: #ff9aa2;
  }
</style>
