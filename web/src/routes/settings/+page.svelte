<script lang="ts">
  import { onMount } from "svelte";
  import {
    defaultProvider,
    providerTemplates,
    type ProviderConfig,
    type ProviderId,
    type ProviderKind,
    type ProviderTemplate
  } from '$lib/llm/providers';

  let providers: ProviderConfig[] = [defaultProvider];
  let providersLoading = false;
  let providersError: string | null = null;
  let computedProvidersError: string | null = null;

  let selectedProviderId: ProviderId = defaultProvider.id;
  let currentProvider: ProviderConfig = defaultProvider;
  let availableModels: string[] = [];
  let selectedModel = '';

  let modelsLoading = false;
  let modelsError: string | null = null;
  let loadError: string | null = null;
  let saveError: string | null = null;
  let saveStatus: 'idle' | 'saving' | 'saved' = 'idle';

  let newProviderKind: ProviderKind = providerTemplates[0]?.kind ?? 'ollama';
  let newProviderLabel = '';
  let newProviderDescription = '';
  let newProviderSettings: Record<string, string> = {};
  let createStatus: 'idle' | 'saving' | 'success' = 'idle';
  let createError: string | null = null;
  let removingProviderId: ProviderId | null = null;
  let removeStatus: 'idle' | 'removing' | 'success' = 'idle';
  let removeError: string | null = null;
  let ttsHasApiKey = false;
  let ttsInput = '';
  let ttsStatus: 'idle' | 'saving' | 'success' = 'idle';
  let ttsError: string | null = null;
  let ttsPendingAction: 'save' | 'clear' | null = null;

  const loadProviders = async () => {
    providersLoading = true;
    providersError = null;

    try {
      const response = await fetch('/api/providers');
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.error ?? `Unable to load providers (${response.status})`);
      }

      const list = Array.isArray(data.providers) ? (data.providers as ProviderConfig[]) : [];

      providers = list.length ? list : [defaultProvider];

      if (!providers.some((provider) => provider.id === selectedProviderId)) {
        selectedProviderId = providers[0]?.id ?? defaultProvider.id;
      }
    } catch (error) {
      providersError = error instanceof Error ? error.message : 'Unable to load providers';
      providers = [defaultProvider];
      selectedProviderId = defaultProvider.id;
    } finally {
      providersLoading = false;
    }
  };

  const loadSettings = async () => {
    loadError = null;

    try {
      const response = await fetch('/api/settings');
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.error ?? `Unable to load settings (${response.status})`);
      }

      const serverSettings = data.settings;
      ttsHasApiKey = false;
      if (serverSettings && typeof serverSettings === 'object') {
        if (typeof serverSettings.provider === 'string') {
          const providerExists = providers.some((provider) => provider.id === serverSettings.provider);
          selectedProviderId = providerExists
            ? serverSettings.provider
            : providers[0]?.id ?? defaultProvider.id;
        }
        if (typeof serverSettings.model === 'string') {
          selectedModel = serverSettings.model;
        }

        const speechSettings = (serverSettings as { tts?: unknown }).tts;
        if (speechSettings && typeof speechSettings === 'object') {
          ttsHasApiKey = Boolean(
            (speechSettings as { hasElevenLabsApiKey?: unknown }).hasElevenLabsApiKey
          );
        } else {
          ttsHasApiKey = false;
        }
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Unable to load saved settings';
      selectedProviderId = providers[0]?.id ?? defaultProvider.id;
      selectedModel = '';
      ttsHasApiKey = false;
    }
  };

  const loadModels = async (provider: ProviderId) => {
    modelsLoading = true;
    modelsError = null;

    try {
      const response = await fetch(`/api/models/${provider}`);
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.error ?? `Unable to load models (${response.status})`);
      }

      availableModels = Array.isArray(data.models)
        ? data.models.filter(
            (name: unknown): name is string => typeof name === 'string' && name.trim().length > 0
          )
        : [];
    } catch (error) {
      availableModels = [];
      modelsError = error instanceof Error ? error.message : 'Unable to load models';
    } finally {
      modelsLoading = false;
    }
  };

  const handleProviderChange = async (provider: ProviderId) => {
    selectedProviderId = provider;
    selectedModel = '';
    await loadModels(provider);
    selectedModel = availableModels[0] ?? '';
  };

  const handleSave = async () => {
    if (!selectedModel) {
      saveError = 'Select a model before saving.';
      return;
    }

    saveStatus = 'saving';
    saveError = null;

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProviderId, model: selectedModel })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(data?.error ?? `Unable to save settings (${response.status})`);
      }

      saveStatus = 'saved';
      setTimeout(() => {
        saveStatus = 'idle';
      }, 2000);
    } catch (error) {
      saveStatus = 'idle';
      saveError = error instanceof Error ? error.message : 'Unable to save settings';
    }
  };

  const handleTemplateChange = (kind: ProviderKind) => {
    newProviderKind = kind;
    newProviderLabel = '';
    newProviderDescription = '';
    newProviderSettings = {};
    createError = null;
    createStatus = 'idle';
  };

  const updateNewProviderSetting = (name: string, value: string) => {
    newProviderSettings = { ...newProviderSettings, [name]: value };
  };

  const handleCreateProvider = async () => {
    const template = providerTemplates.find((entry) => entry.kind === newProviderKind);
    if (!template) {
      createError = 'Choose a provider type.';
      return;
    }

    createStatus = 'saving';
    createError = null;

    const payloadSettings: Record<string, string> = {};
    for (const field of template.fields) {
      const value = (newProviderSettings[field.name] ?? '').trim();
      if (field.required && !value) {
        createStatus = 'idle';
        createError = `${field.label} is required.`;
        return;
      }
      if (value) {
        payloadSettings[field.name] = value;
      }
    }

    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: newProviderKind,
          label: newProviderLabel.trim() ? newProviderLabel.trim() : undefined,
          description: newProviderDescription.trim() ? newProviderDescription.trim() : undefined,
          settings: payloadSettings
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(data?.error ?? `Unable to create provider (${response.status})`);
      }

      const list = Array.isArray(data.providers) ? (data.providers as ProviderConfig[]) : [];

      if (list.length) {
        providers = list;
      }

      if (data?.provider?.id) {
        selectedProviderId = data.provider.id;
        await loadModels(selectedProviderId);
        selectedModel = availableModels[0] ?? '';
      }

      createStatus = 'success';
      newProviderLabel = '';
      newProviderDescription = '';
      newProviderSettings = {};
      setTimeout(() => {
        createStatus = 'idle';
      }, 2000);
    } catch (error) {
      createStatus = 'idle';
      createError = error instanceof Error ? error.message : 'Unable to create provider';
    }
  }
  const handleRemoveProvider = async (providerId: ProviderId) => {
    if (providerId === defaultProvider.id) {
      return;
    }

    removeError = null;
    removeStatus = 'removing';
    removingProviderId = providerId;

    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(providerId)}`, {
        method: 'DELETE'
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(data?.error ?? `Unable to remove provider (${response.status})`);
      }

      const list = Array.isArray(data.providers) ? (data.providers as ProviderConfig[]) : [];
      providers = list.length ? list : [defaultProvider];

      let shouldReloadModels = false;
      if (!providers.some((provider) => provider.id === selectedProviderId)) {
        selectedProviderId = providers[0]?.id ?? defaultProvider.id;
        shouldReloadModels = true;
      } else if (providerId === selectedProviderId) {
        shouldReloadModels = true;
      }

      if (shouldReloadModels && selectedProviderId) {
        selectedModel = '';
        await loadModels(selectedProviderId);
        selectedModel = availableModels[0] ?? '';
      }

      removeStatus = 'success';
      setTimeout(() => {
        removeStatus = 'idle';
      }, 2000);
    } catch (error) {
      removeStatus = 'idle';
      removeError = error instanceof Error ? error.message : 'Unable to remove provider';
    } finally {
      removingProviderId = null;
    }
  };

  const updateTtsKey = async (value: string, action: 'save' | 'clear') => {
    if (ttsStatus === 'saving') {
      return;
    }

    ttsError = null;
    ttsStatus = 'saving';
    ttsPendingAction = action;

    try {
      const response = await fetch('/api/settings/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: value })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(data?.error ?? `Unable to update ElevenLabs key (${response.status})`);
      }

      const hasKey = Boolean(data.settings?.hasElevenLabsApiKey);
      ttsHasApiKey = hasKey;
      ttsStatus = 'success';
      ttsInput = '';
      setTimeout(() => {
        ttsStatus = 'idle';
      }, 2000);
    } catch (error) {
      ttsStatus = 'idle';
      ttsError = error instanceof Error ? error.message : 'Unable to update ElevenLabs API key';
    } finally {
      ttsPendingAction = null;
    }
  };

  const handleSaveTtsKey = () => {
    if (!ttsInput.trim()) {
      return;
    }

    void updateTtsKey(ttsInput.trim(), 'save');
  };

  const handleClearTtsKey = () => {
    if (!ttsHasApiKey) {
      return;
    }

    void updateTtsKey('', 'clear');
  };

  onMount(async () => {
    await loadProviders();
    await loadSettings();
    await loadModels(selectedProviderId);

    if (!selectedModel || !availableModels.includes(selectedModel)) {
      selectedModel = availableModels[0] ?? '';
    }
  });

  $:
    currentProvider =
      providers.find((provider) => provider.id === selectedProviderId) ?? providers[0] ?? defaultProvider;

  $:
    computedProvidersError = providersError ?? (
      providers.length === 0 && !providersLoading
        ? 'No providers configured. Create one below to continue.'
        : null
    );

  let selectedProviderTemplate: ProviderTemplate | null = null;

  $:
    selectedProviderTemplate =
      providerTemplates.find((template) => template.kind === newProviderKind) ?? providerTemplates[0] ?? null;

  const resolveFieldInputType = (type: string) => {
    switch (type) {
      case 'password':
        return 'password';
      case 'number':
        return 'number';
      case 'url':
        return 'url';
      default:
        return 'text';
    }
  };
</script>

<main class="settings-layout">
  <section class="panel">
    <h1>LLM Settings</h1>
    <p class="intro">
      Choose the default provider and model for the chat experience. Configure additional providers below as
      needed.
    </p>

    {#if loadError}
      <p class="error">{loadError}</p>
    {/if}

    <form on:submit|preventDefault={handleSave} class="stack">
      <div class="field">
        <label for="provider">Provider</label>
        <select
          id="provider"
          bind:value={selectedProviderId}
          on:change={() => handleProviderChange(selectedProviderId)}
          disabled={providersLoading || !providers.length}
        >
          {#each providers as option (option.id)}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select>
        {#if providersLoading}
          <p class="hint">Loading providers…</p>
        {:else if computedProvidersError}
          <p class="error">{computedProvidersError}</p>
        {:else if currentProvider?.description}
          <p class="hint">{currentProvider.description}</p>
        {/if}
      </div>

      <div class="field">
        <label for="model">Model</label>
        <select
          id="model"
          bind:value={selectedModel}
          disabled={modelsLoading || !availableModels.length}
        >
          {#each availableModels as modelName (modelName)}
            <option value={modelName}>{modelName}</option>
          {/each}
        </select>
        {#if modelsLoading}
          <p class="hint">Loading models…</p>
        {:else if modelsError}
          <p class="error">{modelsError}</p>
        {:else if !availableModels.length}
          <p class="hint">No models found. Check your provider configuration.</p>
        {/if}
      </div>

      {#if saveError}
        <p class="error">{saveError}</p>
      {/if}

      <button type="submit" disabled={saveStatus === 'saving' || modelsLoading || providersLoading}>
        {#if saveStatus === 'saving'}
          Saving…
        {:else}
          Save Preferences
        {/if}
      </button>

      {#if saveStatus === 'saved'}
        <p class="success">Preferences saved.</p>
      {/if}
    </form>
  </section>

  <section class="panel">
    <h2>Speech Settings</h2>
    <p class="intro">
      Configure ElevenLabs text-to-speech by adding your API key. Keys are stored securely and never exposed in
      client-side code.
    </p>

    <form on:submit|preventDefault={handleSaveTtsKey} class="stack">
      <div class="field">
        <label for="elevenlabs-api-key">ElevenLabs API Key</label>
        <input
          id="elevenlabs-api-key"
          type="password"
          bind:value={ttsInput}
          placeholder={ttsHasApiKey ? 'Key stored. Enter a new key to replace it.' : 'sk_...'}
          autocomplete="off"
        />
        {#if ttsHasApiKey}
          <p class="hint">A key is stored. Enter a new key to replace it or clear it below.</p>
        {:else}
          <p class="hint">Provide an ElevenLabs API key to enable voice responses.</p>
        {/if}
      </div>

      {#if ttsError}
        <p class="error">{ttsError}</p>
      {/if}

      <div class="button-row">
        <button type="submit" disabled={ttsStatus === 'saving' || !ttsInput.trim()}>
          {#if ttsStatus === 'saving' && ttsPendingAction === 'save'}
            Saving…
          {:else}
            Save Key
          {/if}
        </button>
        <button
          type="button"
          class="secondary"
          on:click={handleClearTtsKey}
          disabled={ttsStatus === 'saving' || !ttsHasApiKey}
        >
          {#if ttsStatus === 'saving' && ttsPendingAction === 'clear'}
            Clearing…
          {:else}
            Clear Stored Key
          {/if}
        </button>
      </div>

      {#if ttsStatus === 'success'}
        <p class="success">Speech settings updated.</p>
      {/if}
    </form>
  </section>

  <section class="panel">
    <h2>Add Provider</h2>
    <p class="intro">
      Create additional provider connections. Required fields are specific to the provider type, such as base
      URLs for Ollama or API keys for Gemini.
    </p>

    <form on:submit|preventDefault={handleCreateProvider} class="stack">
      <div class="field">
        <label for="provider-kind">Provider Type</label>
        <select
          id="provider-kind"
          bind:value={newProviderKind}
          on:change={(event) => handleTemplateChange((event.currentTarget as HTMLSelectElement).value as ProviderKind)}
        >
          {#each providerTemplates as template (template.kind)}
            <option value={template.kind}>{template.label}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="provider-name">Display Name</label>
        <input
          id="provider-name"
          type="text"
          placeholder="My Provider"
          bind:value={newProviderLabel}
        />
      </div>

      <div class="field">
        <label for="provider-description">Description</label>
        <input
          id="provider-description"
          type="text"
          placeholder="Optional description"
          bind:value={newProviderDescription}
        />
      </div>

      {#if selectedProviderTemplate}
        {#each selectedProviderTemplate.fields as field (field.name)}
          <div class="field">
            <label for={`provider-field-${field.name}`}>{field.label}</label>
            <input
              id={`provider-field-${field.name}`}
              type={resolveFieldInputType(field.type)}
              placeholder={field.placeholder}
              value={newProviderSettings[field.name] ?? ''}
              on:input={(event) =>
                updateNewProviderSetting(field.name, (event.currentTarget as HTMLInputElement).value)
              }
            />
            {#if field.helperText}
              <p class="hint">{field.helperText}</p>
            {/if}
          </div>
        {/each}
      {/if}

      {#if createError}
        <p class="error">{createError}</p>
      {/if}

      <button type="submit" class="secondary" disabled={createStatus === 'saving'}>
        {#if createStatus === 'saving'}
          Adding…
        {:else}
          Add Provider
        {/if}
      </button>

      {#if createStatus === 'success'}
        <p class="success">Provider added.</p>
      {/if}
    </form>
  </section>

  <section class="panel">
    <h2>Configured Providers</h2>
    <p class="intro">Review the providers currently available to the chat experience.</p>

    {#if removeError}
      <p class="error">{removeError}</p>
    {:else if removeStatus === 'success'}
      <p class="success">Provider removed.</p>
    {/if}

    <ul class="provider-list">
      {#each providers as provider (provider.id)}
        <li>
          <div class="provider-header">
            <span class="provider-name">{provider.label}</span>
            <span class="provider-kind">{provider.kind}</span>
          </div>
          {#if provider.description}
            <p class="provider-description">{provider.description}</p>
          {/if}
          {#if Object.keys(provider.settings ?? {}).length}
            <dl>
              {#each Object.entries(provider.settings) as [key, value] (key)}
                <div class="provider-setting">
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              {/each}
            </dl>
          {:else}
            <p class="hint">No settings captured.</p>
          {/if}
          <div class="provider-actions">
            {#if provider.id === defaultProvider.id}
              <span class="hint">Default provider</span>
            {:else}
              <button
                type="button"
                class="remove-btn"
                on:click={() => handleRemoveProvider(provider.id)}
                disabled={removeStatus === 'removing'}
              >
                {removingProviderId === provider.id ? 'Removing…' : 'Remove'}
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>
</main>

<style>
  :global(body) {
    font-family: system-ui, sans-serif;
  }

  .settings-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem 1rem 4rem;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #e2e8f0;
  }

  .panel {
    background: rgba(15, 23, 42, 0.85);
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(148, 163, 184, 0.1);
    max-width: 640px;
    margin: 0 auto;
  }

  h1,
  h2 {
    margin-bottom: 0.5rem;
  }

  .intro {
    margin: 0 0 1.5rem;
    color: #94a3b8;
    line-height: 1.5;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 600;
    color: #cbd5f5;
  }

  select,
  input,
  button {
    font: inherit;
  }

  select,
  input {
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(148, 163, 184, 0.05);
    color: inherit;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  select:focus,
  input:focus {
    outline: none;
    border-color: rgba(96, 165, 250, 0.7);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
  }

  button {
    padding: 0.75rem 1.25rem;
    border-radius: 0.75rem;
    border: none;
    background: linear-gradient(135deg, #38bdf8, #818cf8);
    color: #0f172a;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(59, 130, 246, 0.35);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button.secondary {
    background: rgba(96, 165, 250, 0.1);
    color: #e2e8f0;
    border: 1px solid rgba(96, 165, 250, 0.4);
  }

  .hint {
    color: #94a3b8;
    font-size: 0.875rem;
  }

  .error {
    color: #fca5a5;
    font-size: 0.9rem;
  }

  .success {
    color: #34d399;
    font-size: 0.9rem;
  }

  .provider-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .provider-list li {
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    background: rgba(15, 23, 42, 0.6);
  }

  .provider-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .provider-name {
    font-weight: 600;
    color: #e2e8f0;
  }

  .provider-kind {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #38bdf8;
  }

  .provider-description {
    margin: 0 0 0.5rem;
    color: #94a3b8;
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 1rem;
    font-size: 0.9rem;
    color: #cbd5f5;
  }

  .provider-setting dt {
    font-weight: 500;
    text-transform: capitalize;
    color: #94a3b8;
  }

  .provider-actions {
    margin-top: 0.75rem;
    display: flex;
    justify-content: flex-end;
  }

  .remove-btn {
    background: rgba(248, 113, 113, 0.15);
    border: 1px solid rgba(248, 113, 113, 0.4);
    color: #fecaca;
    padding: 0.5rem 0.9rem;
  }

  .remove-btn:hover:not(:disabled) {
    box-shadow: 0 10px 20px rgba(248, 113, 113, 0.25);
  }

  .provider-setting dd {
    margin: 0;
    word-break: break-word;
  }

  @media (min-width: 900px) {
    .settings-layout {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      align-items: flex-start;
      gap: 2rem;
    }

    .panel {
      flex: 1 1 320px;
    }
  }
</style>
