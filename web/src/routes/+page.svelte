<script lang="ts">
    import { onMount } from "svelte";
    import { writable } from 'svelte/store';
    import { resolve } from '$app/paths';
    import {
        fetchProviders,
        fetchProviderSettings,
        fetchModels,
        saveProviderSettings,
        sendChatMessage,
        type ChatMessagePayload
    } from '$lib/llm/client';
    import { defaultProvider } from '$lib/llm/providers';
    import type { ProviderConfig, ProviderId } from '$lib/llm/providers';
    import ChatSidebar from '$lib/components/chat/ChatSidebar.svelte';
    import ChatMessages from '$lib/components/chat/ChatMessages.svelte';
    import ChatProviderControls from '$lib/components/chat/ChatProviderControls.svelte';
    import ChatInput from '$lib/components/chat/ChatInput.svelte';
    import ModelPreviewPanel from '$lib/components/chat/ModelPreviewPanel.svelte';
    import type { ModelOption } from '$lib/chat/types';

    type Message = ChatMessagePayload;

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

    let previewIndex = 2; // start on HuoHuo (same as active index)

    function nextModel() {
        previewIndex = (previewIndex + 1) % demoModels.length;
    }

    function prevModel() {
        previewIndex = (previewIndex - 1 + demoModels.length) % demoModels.length;
    }

    function confirmModel() {
            selectModel(previewIndex);
     }
        

    const activeModelIndex = writable<number>(0);
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
            const list = await fetchProviders();
            providers = list;

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
            const serverSettings = await fetchProviderSettings();

            if (serverSettings && typeof serverSettings.provider === 'string') {
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
            const models = await fetchModels(provider);
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
            await saveProviderSettings(provider, model);
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
        const payload: ChatMessagePayload[] = nextMessages.map(({ sender, text }) => ({ sender, text }));

        messages = nextMessages;
        input = "";
        error = null;
        isSending = true;

        try {
            const reply = await sendChatMessage(selectedProviderId, selectedModel, payload);
            messages = [...nextMessages, { sender: 'bot', text: reply }];
        } catch (err) {
            error = err instanceof Error ? err.message : 'An unexpected error occurred';
            messages = nextMessages;
        } finally {
            isSending = false;
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
    <ChatSidebar
        {isCollapsed}
        settingsHref={resolve('/settings')}
        {isPersistingSettings}
        {settingsPersistError}
        on:newChat={startNewChat}
    />

    <div class="flex flex-col md:flex-row w-full h-full">
        <section class="chat-area relative w-full h-full">
            <ChatMessages {messages} />

            <div class="flex justify-center pb-10">
                <div class="flex flex-col md:flex-row md:items-end gap-6 w-full md:w-auto">
                    <ChatProviderControls
                        {providers}
                        {providersLoading}
                        {selectedProviderId}
                        {currentProvider}
                        {computedProvidersError}
                        {settingsLoadError}
                        {availableModels}
                        {selectedModel}
                        {isModelsLoading}
                        {currentModelError}
                        on:providerChange={({ detail }) => handleProviderChange(detail)}
                        on:modelChange={({ detail }) => (selectedModel = detail)}
                    />
                    <div class="composer-input-wrapper">
                        <ChatInput
                            bind:value={input}
                            {isSending}
                            isDisabled={isModelsLoading || !selectedModel}
                            on:send={sendMessage}
                        />
                    </div>
                </div>
            </div>

            {#if error}
                <p class="error-banner" role="alert">{error}</p>
            {/if}
        </section>

        <div class="flex w-1/3 h-full">
            <div class="absolute z-50 h-full right-0 w-1/3">
                <ModelPreviewPanel
                    models={demoModels}
                    {currentModel}
                    {previewIndex}
                    on:prev={prevModel}
                    on:next={nextModel}
                    on:confirm={confirmModel}
                />
            </div>
        </div>
    </div>
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


    .error-banner {
        margin: 8px 20px 20px;
        padding: 10px 12px;
        border-radius: 6px;
        background: #5c2830;
        color: #ffd8da;
        font-size: 0.85rem;
    }

    .composer-input-wrapper {
        width: min(720px, 100%);
    }

    .composer-input-wrapper :global(.input-bar) {
        width: 100%;
        border-radius: 24px;
    }
</style>
