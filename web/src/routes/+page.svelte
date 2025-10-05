<script lang="ts">
    import { onMount } from "svelte";
    import { writable } from 'svelte/store';
    import { resolve } from '$app/paths';
    import {
        fetchProviders,
        fetchProviderSettings,
        fetchModels,
        saveProviderSettings,
        streamChatMessage,
        type ChatMessagePayload,
        type ChatStreamEvent
    } from '$lib/llm/client';
    import { defaultProvider } from '$lib/llm/providers';
    import type { ProviderConfig, ProviderId } from '$lib/llm/providers';
    import { AppBar } from '@skeletonlabs/skeleton-svelte';
    import ChatSidebar from '$lib/components/chat/ChatSidebar.svelte';
    import ChatMessages from '$lib/components/chat/ChatMessages.svelte';
    import ChatProviderControls, {
        type ProviderSelectionState,
        type ModelSelectionState
    } from '$lib/components/chat/ChatProviderControls.svelte';
    import ChatInput from '$lib/components/chat/ChatInput.svelte';
    import ModelPreviewPanel, { type ModelPreviewState } from '$lib/components/chat/ModelPreviewPanel.svelte';
    import type { ModelOption } from '$lib/chat/types';

    interface Message extends ChatMessagePayload {
        id: string;
        raw?: string;
        thinking?: string | null;
        hasThinking?: boolean;
        thinkingOpen?: boolean;
        streaming?: boolean;
    }

    const createMessageId = () => {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return Math.random().toString(36).slice(2);
    };

    const normalizeVisibleText = (value: string): string => value.replace(/^\s*\n?/, '').trimEnd();
    const stripThinkingTags = (value: string): string => value.replace(/<\/?think>/gi, '').trim();

    const extractMessageParts = (
        raw: string
    ): { text: string; thinking: string | null; hasThinking: boolean } => {
        const openTag = '<think>';
        const closeTag = '</think>';

        const openIndex = raw.indexOf(openTag);
        const closeIndex = raw.indexOf(closeTag);

        if (openIndex === -1) {
            return { text: normalizeVisibleText(raw), thinking: null, hasThinking: false };
        }

        if (closeIndex !== -1 && closeIndex > openIndex) {
            const thinking = raw.slice(openIndex + openTag.length, closeIndex).trim();
            const visibleBefore = raw.slice(0, openIndex);
            const visibleAfter = raw.slice(closeIndex + closeTag.length);
            const merged = normalizeVisibleText(`${visibleBefore}${visibleAfter}`);
            return { text: merged, thinking: thinking || null, hasThinking: true };
        }

        const partialThinking = raw.slice(openIndex + openTag.length).trimStart();
        const visible = normalizeVisibleText(raw.slice(0, openIndex));
        return { text: visible, thinking: partialThinking || null, hasThinking: true };
    };

    const demoModels: ModelOption[] = [
        {
            label: 'Hiyori',
            modelPath: '/models/hiyori/runtime/hiyori_pro_t11.model3.json',
            scaleMultiplier: 1,
            anchor: { x: 0.5, y: 0.4 },
            position: { x: 0.5, y: 0.4 }
        },
        {
            label: 'Miku',
            modelPath: '/models/miku/runtime/miku_sample_t04.model3.json',
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
    let modelPreviewState: ModelPreviewState = {
        models: demoModels,
        index: previewIndex,
        current: demoModels[previewIndex] ?? demoModels[0]
    };

    function nextModel() {
        previewIndex = (previewIndex + 1) % demoModels.length;
    }

    function prevModel() {
        previewIndex = (previewIndex - 1 + demoModels.length) % demoModels.length;
    }

    const activeModelIndex = writable<number>(previewIndex);
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
    let providerSelectionState: ProviderSelectionState = {
        options: providers,
        loading: providersLoading,
        selectedId: selectedProviderId,
        current: currentProvider,
        error: computedProvidersError,
        settingsError: null
    };
    let modelSelectionState: ModelSelectionState = {
        options: availableModels,
        loading: isModelsLoading,
        selected: selectedModel,
        error: null
    };

    let isCollapsed = false;
    let isSending = false;
    let isPersistingSettings = false;
    let error: string | null = null;
    let settingsLoadError: string | null = null;
    let settingsPersistError: string | null = null;
    let allowPersist = false;
    let latestPersistSignature = '';

    let isPreviewDrawerOpen = false;
    let previewDrawerEl: HTMLDivElement | null = null;

    const openPreviewDrawer = () => {
        isPreviewDrawerOpen = true;
    };

    const closePreviewDrawer = () => {
        isPreviewDrawerOpen = false;
    };

    const handlePreviewDrawerKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closePreviewDrawer();
        }
    };

    const createInitialBotMessage = (): Message => ({
        id: createMessageId(),
        sender: 'bot',
        text: 'Hi there! How can I help you today?',
        raw: 'Hi there! How can I help you today?',
        hasThinking: false,
        thinkingOpen: false
    });

    let messages: Message[] = [createInitialBotMessage()];
    let input = "";

    let expressionOptions: string[] = [];
    let selectedExpression = '';

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
        messages = [createInitialBotMessage()];
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

        const userMessage: Message = {
            id: createMessageId(),
            sender: 'user',
            text: trimmed,
            raw: trimmed,
            hasThinking: false,
            thinkingOpen: false
        };

        const nextMessages: Message[] = [...messages, userMessage];
        const payload: ChatMessagePayload[] = nextMessages.map(({ sender, raw, text }) => ({
            sender,
            text: raw ?? text
        }));

        messages = nextMessages;
        input = "";
        error = null;
        isSending = true;

        try {
            const assistantMessage: Message = {
                id: createMessageId(),
                sender: 'bot',
                text: '',
                raw: '',
                streaming: true,
                hasThinking: false,
                thinkingOpen: true
            };

            messages = [...nextMessages, assistantMessage];

            const updateAssistant = (updater: (current: Message) => Message) => {
                messages = messages.map((message) =>
                    message.id === assistantMessage.id ? updater(message) : message
                );
            };

            await streamChatMessage(selectedProviderId, selectedModel, payload, (event: ChatStreamEvent) => {
                if (event.type === 'delta' && event.value) {
                    assistantMessage.raw = `${assistantMessage.raw ?? ''}${event.value}`;
                    const { text, thinking, hasThinking } = extractMessageParts(assistantMessage.raw ?? '');
                    assistantMessage.text = text;
                    assistantMessage.thinking = thinking;
                    assistantMessage.hasThinking = hasThinking;
                    assistantMessage.thinkingOpen = hasThinking
                        ? assistantMessage.streaming !== false
                            ? assistantMessage.thinkingOpen ?? true
                            : assistantMessage.thinkingOpen ?? false
                        : false;
                    updateAssistant(() => ({ ...assistantMessage }));
                }

                if (event.type === 'done') {
                    if (event.value && (!assistantMessage.raw || assistantMessage.raw !== event.value)) {
                        assistantMessage.raw = event.value;
                    }

                    const finalRaw = assistantMessage.raw ?? event.value ?? '';
                    const { text, thinking, hasThinking } = extractMessageParts(finalRaw);
                    const fallbackVisible = text || (hasThinking ? stripThinkingTags(finalRaw) : finalRaw).trim();
                    assistantMessage.text = fallbackVisible;
                    assistantMessage.thinking = thinking;
                    assistantMessage.hasThinking = hasThinking;
                    assistantMessage.streaming = false;
                    assistantMessage.thinkingOpen = hasThinking ? false : undefined;
                    updateAssistant(() => ({ ...assistantMessage }));
                    if (assistantMessage.text?.trim()) {
                        speakText(assistantMessage.text);
                    } else {
                        console.warn('Skipping TTS: empty text');
                    }
                }

                if (event.type === 'error') {
                    throw new Error(event.message ?? 'An unexpected error occurred');
                }
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'An unexpected error occurred';
            messages = nextMessages;
        } finally {
            isSending = false;
        }
    };

    async function speakText(text: string) {
  const VOICE = 'JBFqnCBsd6RMkjVDRZzb';
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId: VOICE })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      console.error('TTS error', res.status, payload);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch (e) {
    console.error('speakText failed', e);
  }
    }

    onMount(() => {
        isPreviewDrawerOpen = false;

        if (typeof window !== 'undefined' && window.innerWidth <= 800) {
            isCollapsed = true;
        }

        void (async () => {
            await loadProviders();
            await loadSettings();
            await ensureModels(selectedProviderId);
            allowPersist = true;
            latestPersistSignature = '';
        })();
    });

    $: currentModel = demoModels[$activeModelIndex] ?? demoModels[0];
    $: modelPreviewState = {
        models: demoModels,
        index: previewIndex,
        current: currentModel
    };
    $: currentProvider = providers.find((provider) => provider.id === selectedProviderId) ?? defaultProvider;
    $: computedProvidersError = providersError ?? (providers.length === 0 && !providersLoading
            ? 'No providers found. Visit settings to add one.'
            : null);
    $: availableModels = modelsByProvider[selectedProviderId] ?? [];
    $: isModelsLoading = Boolean(modelsLoading[selectedProviderId]);
    $: currentModelError = modelsError[selectedProviderId] ?? null;
    $: providerSelectionState = {
        options: providers,
        loading: providersLoading,
        selectedId: selectedProviderId,
        current: currentProvider,
        error: computedProvidersError,
        settingsError: settingsLoadError
    };
    $: modelSelectionState = {
        options: availableModels,
        loading: isModelsLoading,
        selected: selectedModel,
        error: currentModelError
    };
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
		
	


{#snippet appBarLead()}
    <div class="flex items-center gap-4">
        <button
            type="button"
            class="btn btn-icon btn-icon-base border border-surface-800/50 bg-surface-950/60 text-lg text-surface-200 transition hover:text-surface-50 lg:hidden"
            on:click={toggleSidebar}
            aria-label="Toggle navigation"
        >
            ☰
        </button>
        <div class="flex flex-col">
            <span class="text-xs font-semibold uppercase tracking-[0.35em] text-primary-300">StormHacks</span>
            <span class="text-lg font-semibold text-surface-50">Agent Studio</span>
        </div>
    </div>
{/snippet}

{#snippet appBarTrail()}
    <button
        type="button"
        class="btn btn-base hidden bg-primary-500 text-[color:var(--color-primary-contrast-500)] font-semibold tracking-wide shadow-primary-500/30 lg:inline-flex"
        on:click={startNewChat}
    >
        New Conversation
    </button>
{/snippet}

<div class="flex min-h-screen flex-col bg-gradient-to-br from-surface-950 via-surface-950/95 to-surface-900 text-surface-50">
    <AppBar
        lead={appBarLead}
        trail={appBarTrail}
        background="bg-surface-950/70"
        border="border-b border-surface-800/50"
        shadow="shadow-lg shadow-surface-950/30"
        padding="px-4 py-4 lg:px-8"
        classes="sticky top-0 z-40 backdrop-blur-xl"
    >
        <p class="text-sm text-surface-400">Harness your favourite models, orchestrate agents, and ship faster.</p>
    </AppBar>

    <div class="relative flex flex-1 overflow-hidden">
        {#if !isCollapsed}
            <button
                type="button"
                class="fixed inset-0 z-20 bg-surface-950/60 backdrop-blur-sm transition lg:hidden"
                aria-label="Close sidebar"
                on:click={toggleSidebar}
            ></button>
        {/if}

        <ChatSidebar
            {isCollapsed}
            settingsHref={resolve('/settings')}
            {isPersistingSettings}
            {settingsPersistError}
            on:newChat={startNewChat}
        />

        <main class="relative z-10 flex-1 overflow-hidden">
            <div class="flex h-full w-full flex-col gap-4 px-4 pb-8 pt-4 lg:px-8 lg:pb-12 2xl:px-12">
                <div class="flex h-full flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-8">
                    <section class="relative flex h-full flex-col overflow-hidden rounded-3xl border border-surface-800/60 bg-surface-950/90 shadow-2xl shadow-surface-950/30 xl:flex-1">
                        <ChatMessages {messages} />

                        <div class="border-t border-surface-800/50 bg-surface-950/95 p-4">
                            <div class="flex flex-col gap-4">
                                <ChatProviderControls
                                    providerState={providerSelectionState}
                                    modelState={modelSelectionState}
                                    on:providerChange={({ detail }) => {
                                        selectedProviderId = detail;
                                        void handleProviderChange(detail);
                                    }}
                                    on:modelChange={({ detail }) => (selectedModel = detail)}
                                />
                                <div class="flex flex-col gap-2 sm:flex-row xl:hidden">
                                    <button
                                        type="button"
                                        class="btn btn-base flex-1 border border-surface-800/60 bg-surface-950/70 text-sm font-semibold text-surface-100 shadow-lg shadow-surface-950/20"
                                        on:click={startNewChat}
                                    >
                                        New Chat
                                    </button>
                                    <button
                                        type="button"
                                        class="btn btn-base flex-1 bg-primary-500 text-sm font-semibold text-[color:var(--color-primary-contrast-500)] shadow-lg shadow-primary-500/25"
                                        on:click={openPreviewDrawer}
                                    >
                                        View Model
                                    </button>
                                </div>
                                <ChatInput
                                    bind:value={input}
                                    {isSending}
                                    isDisabled={isModelsLoading || !selectedModel}
                                    on:send={sendMessage}
                                />
                                {#if error}
                                    <p
                                        class="rounded-2xl border border-error-500/40 bg-error-500/20 px-4 py-4 text-sm text-error-50"
                                        role="alert"
                                    >
                                        {error}
                                    </p>
                                {/if}
                            </div>
                        </div>
                    </section>

                    <aside class="hidden min-h-[420px] xl:block xl:w-[420px] xl:flex-none 2xl:w-[480px]">
                        <ModelPreviewPanel
                            state={modelPreviewState}
                            bind:expressionOptions
                            bind:selectedExpression
                            on:prev={prevModel}
                            on:next={nextModel}
                            on:confirm={({ detail }) => selectModel(detail ?? previewIndex)}
                        />
                    </aside>
                </div>
            </div>
        </main>
        {#if isPreviewDrawerOpen}
            <div
                class="fixed inset-0 z-50 flex flex-col bg-surface-950/80 backdrop-blur-sm xl:hidden"
                role="dialog"
                aria-modal="true"
                aria-label="Model preview"
                tabindex="-1"
                on:keydown={handlePreviewDrawerKeydown}
                bind:this={previewDrawerEl}
            >
                <button
                    type="button"
                    class="absolute inset-0 z-0 h-full w-full cursor-default bg-transparent"
                    on:click={closePreviewDrawer}
                    aria-label="Dismiss model preview"
                ></button>
                <div class="relative z-10 mt-auto w-full px-4 pb-6">
                    <div class="relative mx-auto max-h-[80vh] w-full max-w-lg overflow-hidden">
                        <div class="max-h-[80vh] min-h-[360px] overflow-y-auto rounded-3xl">
                            <ModelPreviewPanel
                                state={modelPreviewState}
                                bind:expressionOptions
                                bind:selectedExpression
                                on:prev={prevModel}
                                on:next={nextModel}
                                on:confirm={({ detail }) => {
                                    selectModel(detail ?? previewIndex);
                                    closePreviewDrawer();
                                }}
                            />
                        </div>
                        <button
                            type="button"
                            class="btn btn-icon btn-icon-base absolute right-5 top-5 bg-surface-950/80 text-lg text-surface-200 shadow-lg shadow-surface-950/40"
                            on:click={closePreviewDrawer}
                            aria-label="Close model preview"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
