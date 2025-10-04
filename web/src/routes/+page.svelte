<script lang="ts">
    import { onMount } from "svelte";
    import { fly } from "svelte/transition";
    import { Live2DPreview } from '$lib';
    import { writable } from 'svelte/store';
    import { resolve } from '$app/paths';
    import { defaultProvider } from '$lib/llm/providers';
    import type { ProviderConfig, ProviderId } from '$lib/llm/providers';

    interface ModelOption {
        label: string;
        modelPath: string;
        cubismCorePath?: string;
        anchor?: { x?: number; y?: number };
        position?: { x?: number; y?: number };
        scaleMultiplier?: number;
        targetHeightRatio?: number;
    }

	const demoModels: ModelOption[] = [
		{
			label: 'Hiyori',
			modelPath: '/models/hiyori/hiyori_free_t08.model3.json',
			scaleMultiplier: 1,
			anchor: { x: 0.5, y: 0.4 },
			position: { x: 0.5, y: 0.4 }
		},
		{
			label: 'Miku',
			modelPath: '/models/miku/runtime/miku.model3.json',
			scaleMultiplier: 0.85,
			anchor: { x: 0.5, y: 0.2 },
			position: { x: 0.5, y: 0.3 }
		},
        {
			label: 'HuoHuo',
			modelPath: '/models/huohuo/huohuo.model3.json',
			scaleMultiplier: 1,
			anchor: { x: 0.5, y: 0.4 },
			position: { x: 0.5, y: 0.4 }
		}
	];

	const activeModelIndex = writable<number>(2);
	let currentModel: ModelOption = demoModels[2];

	const selectModel = (index: number) => {
		const option = demoModels[index];
		if (!option) return;
		activeModelIndex.set(index);
	};

	$: currentModel = demoModels[$activeModelIndex] ?? demoModels[0];
    /**
    * messaging script or wtv in here
    * 
     */


    // message structure
    interface Message {
        sender: 'user' | 'bot';
        text: string;
    }

    let currentModel: ModelOption = demoModels[0];
    let providers: ProviderConfig[] = [defaultProvider];
    let providersLoading = false;
    let providersError: string | null = null;
    let computedProvidersError: string | null = null;
    let currentProvider: ProviderConfig = defaultProvider;
    let selectedProviderId: ProviderId = defaultProvider.id;
    let selectedModel = '';
    let modelsByProvider: Partial<Record<ProviderId, string[]>> = {};
    let modelsLoading: Partial<Record<ProviderId, boolean>> = {};
    let modelsError: Partial<Record<ProviderId, string>> = {};
    let availableModels: string[] = [];
    let isModelsLoading = false;
    let currentModelError: string | null = null;

    let isCollapsed = false;
    let isSending = false;
    let isPersistingSettings = false;
    let error: string | null = null;
    let settingsLoadError: string | null = null;
    let settingsPersistError: string | null = null;
    let allowPersist = false;
    let latestPersistSignature = '';

    const initialBotMessage: Message = {
        sender: 'bot',
        text: 'Hi there! How can I help you today?'
    };
    let messages: Message[] = [initialBotMessage];
    let input = "";

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
        } catch (err) {
            providersError = err instanceof Error ? err.message : 'Unable to load providers';
            providers = [defaultProvider];
            selectedProviderId = defaultProvider.id;
        } finally {
            providersLoading = false;
        }
    };

    const loadSettings = async () => {
        settingsLoadError = null;

        try {
            const response = await fetch('/api/settings');
            const data = await response.json().catch(() => null);

            if (!response.ok || !data) {
                throw new Error(data?.error ?? `Unable to load settings (${response.status})`);
            }

            const serverSettings = data.settings;
            if (
                serverSettings &&
                typeof serverSettings === 'object' &&
                typeof serverSettings.provider === 'string'
            ) {
                const providerExists = providers.some((provider) => provider.id === serverSettings.provider);
                selectedProviderId = providerExists
                    ? serverSettings.provider
                    : providers[0]?.id ?? defaultProvider.id;
                selectedModel =
                    providerExists && typeof serverSettings.model === 'string'
                        ? serverSettings.model
                        : '';
            }
        } catch (err) {
            settingsLoadError =
                err instanceof Error ? err.message : 'Unable to load provider settings';
            selectedProviderId = providers[0]?.id ?? defaultProvider.id;
            selectedModel = '';
        }
    };

    const selectModel = (index: number) => {
        const option = demoModels[index];
        if (!option) return;
        activeModelIndex.set(index);
    };

    const toggleSidebar = () => {
        isCollapsed = !isCollapsed;
    };

    const startNewChat = () => {
        messages = [initialBotMessage];
        error = null;
    };

    const ensureModels = async (provider: ProviderId) => {
        if (modelsLoading[provider]) return;
        if ((modelsByProvider[provider]?.length ?? 0) > 0) return;

        modelsLoading = { ...modelsLoading, [provider]: true };
        modelsError = { ...modelsError, [provider]: undefined };

        try {
            const response = await fetch(`/api/models/${provider}`);
            const data = await response.json().catch(() => null);

            if (!response.ok || !data) {
                throw new Error(data?.error ?? `Unable to load models (${response.status})`);
            }

            const models = Array.isArray(data.models)
                ? data.models.filter(
                        (name: unknown): name is string =>
                            typeof name === 'string' && name.trim().length > 0
                    )
                : [];

            modelsByProvider = { ...modelsByProvider, [provider]: models };
        } catch (err) {
            modelsError = {
                ...modelsError,
                [provider]: err instanceof Error ? err.message : 'Unable to load models'
            };
            modelsByProvider = { ...modelsByProvider, [provider]: [] };
        } finally {
            modelsLoading = { ...modelsLoading, [provider]: false };
        }
    };

    const persistSettings = async (provider: ProviderId, model: string) => {
        if (!model) return;

        isPersistingSettings = true;
        settingsPersistError = null;

        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, model })
            });

            const data = await response.json().catch(() => null);

            if (!response.ok || !data) {
                throw new Error(data?.error ?? `Unable to save settings (${response.status})`);
            }
        } catch (err) {
            settingsPersistError =
                err instanceof Error ? err.message : 'Unable to save provider settings';
        } finally {
            isPersistingSettings = false;
        }
    };

    const handleProviderChange = async (provider: ProviderId) => {
        selectedModel = '';
        settingsPersistError = null;
        latestPersistSignature = '';
        await ensureModels(provider);
    };

    const sendMessage = async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) return;
        if (!selectedModel) {
            error = 'Select a model before sending a message.';
            return;
        }

        const nextMessages: Message[] = [...messages, { sender: 'user', text: trimmed }];
        const payload = nextMessages.map(({ sender, text }) => ({ sender, text }));

        messages = nextMessages;
        input = "";
        error = null;
        isSending = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: selectedProviderId,
                    model: selectedModel,
                    messages: payload
                })
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
                throw new Error(data?.error ?? `Request failed (${response.status})`);
            }

            const reply: string | undefined = data?.reply;
            if (!reply) {
                throw new Error('Response did not include a reply message');
            }

            messages = [...nextMessages, { sender: 'bot', text: reply }];
        } catch (err) {
            error = err instanceof Error ? err.message : 'An unexpected error occurred';
            messages = nextMessages;
        } finally {
            isSending = false;
        }
    };

    const handleKey = (event: KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    };

    onMount(async () => {
        if (window.innerWidth <= 800) isCollapsed = true;

        await loadProviders();
        await loadSettings();
        await ensureModels(selectedProviderId);
        allowPersist = true;
        latestPersistSignature = '';
    });

    $: currentModel = demoModels[$activeModelIndex] ?? demoModels[0];
    $: currentProvider = providers.find((provider) => provider.id === selectedProviderId) ?? defaultProvider;
    $: computedProvidersError = providersError ?? (providers.length === 0 && !providersLoading
            ? 'No providers found. Visit settings to add one.'
            : null);
    $: availableModels = modelsByProvider[selectedProviderId] ?? [];
    $: isModelsLoading = Boolean(modelsLoading[selectedProviderId]);
    $: currentModelError = modelsError[selectedProviderId] ?? null;
    $: if (!isModelsLoading && availableModels.length > 0 && !availableModels.includes(selectedModel)) {
        selectedModel = availableModels[0];
    }
    $: if (allowPersist) {
        const signature = selectedModel ? `${selectedProviderId}::${selectedModel}` : '';
        if (signature && signature !== latestPersistSignature) {
            latestPersistSignature = signature;
            persistSettings(selectedProviderId, selectedModel);
        }
    }
</script>
		
	


<!-- markup -->
<button class="toggle-btn" on:click={toggleSidebar}>☰</button>

<div class="layout">
    <!-- sidebar -->
    <aside class="sidebar {isCollapsed ? 'collapsed' : ''}" transition:fly={{ x: -200, duration: 250 }}>
        <div class="pt-12">
            <button class="new-chat-btn" on:click={startNewChat}>+ New Chat</button>
        </div>
        <div class="chat-list">
        <h3>Recent Chats</h3>
        <ul>
            <li>General Inquiry</li>
            <li>Support</li>
            <li>Agent A</li>
        </ul>
        </div>
    </aside>
    

    <!-- chat area -->
    <section class="chat-area relative">
        <div class="absolute z-50 h-1/3 right-0 w-1/3">
            <Live2DPreview
                modelPath={currentModel.modelPath}
                cubismCorePath={currentModel.cubismCorePath}
                scaleMultiplier={currentModel.scaleMultiplier ?? 1}
                targetHeightRatio={currentModel.targetHeightRatio ?? 0.9}
                anchorX={currentModel.anchor?.x ?? 0.5}
                anchorY={currentModel.anchor?.y ?? 0.5}
                positionX={currentModel.position?.x ?? 0.5}
                positionY={currentModel.position?.y ?? 0.95}
            />

            <div role="group" aria-label="Choose a Live2D model">
                {#each demoModels as model, index (model.label)}
                    <button
                        type="button"
                        class:active={index === $activeModelIndex}
                        aria-pressed={index === $activeModelIndex}
                        on:click={() => selectModel(index)}
                    >
                        {model.label}
                    </button>
                {/each}
            </div>
        </div>

        <div class="chat-config">
        <div class="config-group">
            <label>
            <span>Provider</span>
            <select
                bind:value={selectedProviderId}
                on:change={() => handleProviderChange(selectedProviderId)}
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
        <div class="config-meta">
            <a class="settings-link" href={resolve('/settings')}>Open LLM settings</a>
            {#if isPersistingSettings}
            <span class="config-hint saving">Saving…</span>
            {:else if settingsPersistError}
            <span class="config-error">{settingsPersistError}</span>
            {/if}
        </div>
        </div>

        <div class="messages">
        {#each messages as msg, index (index)}
            <div class="message {msg.sender}" transition:fly={{ y: 10, duration: 150 }}>
            {msg.text}
            </div>
            
            <div class="flex justify-center pb-10">
                <div class="input-bar rounded-3xl w-5/6">
                    <textarea
                        bind:value={input}
                        rows="1"
                        placeholder="Send a message..."
                        on:keydown={handleKey}
                    ></textarea>
                    <button class="send-btn" on:click={sendMessage}>➤</button>
                </div>
            </div>
            
        </section>

        <div class="input-bar">
        <textarea
            bind:value={input}
            rows="1"
            placeholder="Send a message..."
            on:keydown={handleKey}
            disabled={isSending}
        ></textarea>
        <button
            class="send-btn"
            on:click={sendMessage}
            disabled={isSending || isModelsLoading || !selectedModel}
            aria-busy={isSending}
        >
            {#if isSending}
            ...
            {:else}
            ➤
            {/if}
        </button>
        </div>

        {#if error}
        <p class="error-banner" role="alert">{error}</p>
        {/if}
    </section>
</div>


<style>
    :global(body) {
        margin: 0;
        font-family: system-ui, sans-serif;
        background: #343541;
        color: #ececf1;
        overflow: hidden;
    }

    .layout {
        display: flex;
        height: 100vh;
    }

    /* sidebar */
    .sidebar {
        width: 260px;
        background: #202123;
        color: #ececf1;
        padding: 20px;
        box-sizing: border-box;
        transition: transform 0.3s ease;
        overflow-y: auto;
    }
    .sidebar.collapsed {
        transform: translateX(-100%);
    }

    .new-chat-btn {
        background: #10a37f;
        border: none;
        color: white;
        padding: 10px;
        width: 100%;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        margin-bottom: 20px;
    }
    .new-chat-btn:hover {
        background: #0d8c6c;
    }

    .chat-list h3 {
        font-size: 0.9rem;
        color: #8e8e8f;
        margin-bottom: 10px;
    }
    .chat-list li {
        background: #2a2b32;
        padding: 8px 10px;
        border-radius: 6px;
        margin-bottom: 8px;
        cursor: pointer;
    }
    .chat-list li:hover {
        background: #3b3c42;
    }

    /* toggle */
    .toggle-btn {
        position: fixed;
        top: 15px;
        left: 15px;
        background: #444654;
        color: white;
        border: none;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        z-index: 1001;
        font-size: 18px;
    }
    .toggle-btn:hover {
        background: #5c5e70;
    }

    /* chat main area */
    .chat-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: #343541;
        position: relative;
        transition: margin-left 0.3s ease;
    }

    .chat-config {
        display: flex;
        gap: 16px;
        padding: 16px 20px 0;
        flex-wrap: wrap;
    }

    .config-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 180px;
    }

    .chat-config label {
        display: flex;
        flex-direction: column;
        font-size: 0.8rem;
        gap: 6px;
        color: #8e8e8f;
    }

    .chat-config select {
        background: #202123;
        color: #ececf1;
        border: 1px solid #3f414c;
        border-radius: 6px;
        padding: 8px;
        font-size: 0.9rem;
    }

    .config-hint,
    .config-error {
        margin: 0;
        font-size: 0.75rem;
    }

    .config-hint {
        color: #8e8e8f;
    }

    .config-hint.saving {
        color: #cfcfd3;
    }

    .config-error {
        color: #ff9aa2;
    }

    .config-meta {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 100%;
        font-size: 0.75rem;
        color: #8e8e8f;
    }

    .settings-link {
        color: #10a37f;
        text-decoration: none;
        font-weight: 600;
    }

    .settings-link:hover {
        text-decoration: underline;
    }

    .messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .message {
        max-width: 70%;
        padding: 12px 16px;
        border-radius: 10px;
        line-height: 1.4;
        word-wrap: break-word;
    }

    .bot {
        background: #444654;
        align-self: flex-start;
    }

    .user {
        background: #10a37f;
        align-self: flex-end;
    }

    /* input bar */
    .input-bar {
        position: sticky;
        bottom: 0;
        background: #40414f;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .input-bar textarea {
        flex: 1;
        resize: none;
        border: none;
        border-radius: 8px;
        padding: 10px;
        font-size: 1rem;
        background: #40414f;
        color: white;
        outline: none;
    }

    .send-btn {
        background: #10a37f;
        border: none;
        color: white;
        padding: 10px 14px;
        border-radius: 6px;
        cursor: pointer;
        min-width: 42px;
    }
    .send-btn:hover {
        background: #0d8c6c;
    }

    .send-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .error-banner {
        margin: 8px 20px 20px;
        padding: 10px 12px;
        border-radius: 6px;
        background: #5c2830;
        color: #ffd8da;
        font-size: 0.85rem;
    }

    @media (max-width: 800px) {
        .sidebar {
        position: fixed;
        height: 100%;
        top: 0;
        left: 0;
        z-index: 1000;
        }
        .chat-area {
        margin-left: 0 !important;
        }
    }
</style>
