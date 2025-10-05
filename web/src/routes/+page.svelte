<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
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
    import PromptSettingsModal from '$lib/components/chat/PromptSettingsModal.svelte';
    import ModelPreviewPanel, { type ModelPreviewState } from '$lib/components/chat/ModelPreviewPanel.svelte';
    import type { ModelOption } from '$lib/chat/types';
    import Live2DModelManager from '$lib/components/live2d/Live2DModelManager.svelte';
    import { listLive2DModels } from '$lib/live2d/client';
    import {
        defaultGenerationOptions,
        normalizeGenerationOptions,
        type LLMGenerationOptions
    } from '$lib/llm/settings';

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

    const createChatId = () => {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return `chat-${Math.random().toString(36).slice(2)}`;
    };

    interface ChatSummary {
        id: string;
        title: string;
        createdAt: number;
        updatedAt: number;
    }

    const DEFAULT_CHAT_TITLE = 'New Chat';
    const CHAT_STORAGE_KEY = 'stormhacks.chatState.v1';

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

    interface ChatConfig {
        systemPrompt: string;
        generationOptions: LLMGenerationOptions;
    }

    interface PersistedChatConfig {
        systemPrompt?: string | null;
        generationOptions?: unknown;
    }

    interface PersistedChatState {
        activeChatId: string;
        chats: ChatSummary[];
        history: Record<string, Message[]>;
        configurations?: Record<string, PersistedChatConfig>;
    }

    const cloneGenerationOptions = (options: LLMGenerationOptions): LLMGenerationOptions => ({
        temperature: options.temperature ?? null,
        topP: options.topP ?? null,
        topK: options.topK ?? null,
        maxInputTokens: options.maxInputTokens ?? null,
        maxOutputTokens: options.maxOutputTokens ?? null
    });

    const areGenerationOptionsEqual = (a: LLMGenerationOptions, b: LLMGenerationOptions): boolean =>
        (a.temperature ?? null) === (b.temperature ?? null) &&
        (a.topP ?? null) === (b.topP ?? null) &&
        (a.topK ?? null) === (b.topK ?? null) &&
        (a.maxInputTokens ?? null) === (b.maxInputTokens ?? null) &&
        (a.maxOutputTokens ?? null) === (b.maxOutputTokens ?? null);

    const cloneChatConfig = (config: ChatConfig): ChatConfig => ({
        systemPrompt: config.systemPrompt ?? '',
        generationOptions: cloneGenerationOptions(config.generationOptions)
    });

    let chats: ChatSummary[] = [];
    let chatHistory: Record<string, Message[]> = {};
    let chatConfigurations: Record<string, ChatConfig> = {};
    let baseChatConfig: ChatConfig = {
        systemPrompt: '',
        generationOptions: { ...defaultGenerationOptions }
    };
    let activeChatId = '';
    let pendingChatIds: string[] = [];

    const sanitizeMessageForStore = (message: Message): Message => ({
        ...message,
        id: message.id ?? createMessageId(),
        streaming: false,
        thinkingOpen: message.hasThinking ? Boolean(message.thinkingOpen) : undefined
    });

    const sanitizeMessagesForStore = (list: Message[]): Message[] =>
        list.map((message) => sanitizeMessageForStore(message));

    const cloneMessagesFromStore = (list: Message[]): Message[] =>
        list.map((message) => ({ ...sanitizeMessageForStore(message) }));

    const deriveChatTitle = (list: Message[]): string => {
        const firstUser = list.find((msg) => msg.sender === 'user' && (msg.text ?? msg.raw)?.trim());
        if (!firstUser) return DEFAULT_CHAT_TITLE;
        const source = (firstUser.text ?? firstUser.raw ?? '').trim();
        if (!source) return DEFAULT_CHAT_TITLE;
        return source.length > 60 ? `${source.slice(0, 57)}…` : source;
    };

    const addPendingChat = (id: string) => {
        if (!id || pendingChatIds.includes(id)) return;
        pendingChatIds = [...pendingChatIds, id];
    };

    const removePendingChat = (id: string) => {
        if (!id) return;
        if (!pendingChatIds.includes(id)) return;
        pendingChatIds = pendingChatIds.filter((pendingId) => pendingId !== id);
        const { [id]: _removedConfig, ...restConfigs } = chatConfigurations;
        chatConfigurations = restConfigs;
    };

    const updateChatSummary = (
        id: string,
        updater: (chat: ChatSummary) => ChatSummary,
        options?: { moveToTop?: boolean }
    ) => {
        const index = chats.findIndex((chat) => chat.id === id);
        if (index === -1) return;
        const updated = updater(chats[index]);
        const moveToTop = options?.moveToTop ?? true;
        if (moveToTop) {
            const others = chats.filter((chat) => chat.id !== id);
            chats = [updated, ...others];
        } else {
            const next = [...chats];
            next[index] = updated;
            chats = next;
        }
    };

    function applyChatConfig(id: string) {
        const stored = chatConfigurations[id];
        if (stored) {
            systemPrompt = stored.systemPrompt ?? '';
            generationOptions = cloneGenerationOptions(stored.generationOptions);
            return;
        }

        const fallback = cloneChatConfig(baseChatConfig);
        chatConfigurations = { ...chatConfigurations, [id]: fallback };
        systemPrompt = fallback.systemPrompt ?? '';
        generationOptions = cloneGenerationOptions(fallback.generationOptions);
    }

    function persistActiveChatConfig(options?: { save?: boolean }) {
        if (!activeChatId) return;
        const nextConfig: ChatConfig = {
            systemPrompt,
            generationOptions: cloneGenerationOptions(generationOptions)
        };
        chatConfigurations = { ...chatConfigurations, [activeChatId]: nextConfig };
        if (options?.save ?? true) {
            saveChatState();
        }
    }

    function applyBaseGenerationOptions(options: LLMGenerationOptions) {
        const shouldUpdateActive = areGenerationOptionsEqual(
            generationOptions,
            baseChatConfig.generationOptions
        );
        baseChatConfig = {
            ...baseChatConfig,
            generationOptions: cloneGenerationOptions(options)
        };
        if (shouldUpdateActive && activeChatId) {
            generationOptions = cloneGenerationOptions(options);
            persistActiveChatConfig({ save: false });
        }
    }

    const ensureActiveChatConfigSaved = () => {
        if (!activeChatId) return;
        const currentConfig: ChatConfig = {
            systemPrompt,
            generationOptions: cloneGenerationOptions(generationOptions)
        };
        const existing = chatConfigurations[activeChatId];
        if (!existing || existing.systemPrompt !== currentConfig.systemPrompt || !areGenerationOptionsEqual(existing.generationOptions, currentConfig.generationOptions)) {
            chatConfigurations = { ...chatConfigurations, [activeChatId]: currentConfig };
        }
    };

    const saveChatState = () => {
        if (!browser) return;
        try {
            ensureActiveChatConfigSaved();
            const history = Object.fromEntries(
                Object.entries(chatHistory).map(([id, list]) => [id, sanitizeMessagesForStore(list)])
            );
            const configurations = Object.fromEntries(
                Object.entries(chatConfigurations).map(([id, config]) => [
                    id,
                    {
                        systemPrompt: config.systemPrompt ?? '',
                        generationOptions: cloneGenerationOptions(config.generationOptions)
                    }
                ])
            );
            const payload: PersistedChatState = {
                activeChatId,
                chats,
                history,
                configurations
            };
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error('Failed to save chat state', err);
        }
    };

    const ensureActiveChatMessagesSaved = () => {
        if (!activeChatId) return;
        chatHistory = {
            ...chatHistory,
            [activeChatId]: sanitizeMessagesForStore(messages)
        };
    };

    const persistActiveChatMessages = (options?: { updateTimestamp?: boolean }) => {
        if (!activeChatId) return;
        const updateTimestamp = options?.updateTimestamp ?? true;
        ensureActiveChatMessagesSaved();
        if (updateTimestamp) {
            updateChatSummary(activeChatId, (chat) => ({ ...chat, updatedAt: Date.now() }));
        }
        saveChatState();
    };

    const loadChatState = (): boolean => {
        if (!browser) return false;
        try {
            const raw = localStorage.getItem(CHAT_STORAGE_KEY);
            if (!raw) return false;
            const parsed = JSON.parse(raw) as PersistedChatState | null;
            if (!parsed || !Array.isArray(parsed.chats)) return false;

            chats = parsed.chats.map((chat) => ({
                id: String(chat.id ?? createChatId()),
                title:
                    typeof chat.title === 'string' && chat.title.trim()
                        ? chat.title.trim()
                        : DEFAULT_CHAT_TITLE,
                createdAt: Number(chat.createdAt) || Date.now(),
                updatedAt: Number(chat.updatedAt) || Number(chat.createdAt) || Date.now()
            }));

            const nextHistory: Record<string, Message[]> = {};
            const entries = Object.entries(parsed.history ?? {});
            for (const [id, list] of entries) {
                if (Array.isArray(list)) {
                    nextHistory[id] = cloneMessagesFromStore(list as Message[]);
                }
            }
            chatHistory = nextHistory;
            const nextConfigurations: Record<string, ChatConfig> = {};
            const configEntries = Object.entries(parsed.configurations ?? {});
            for (const [id, rawConfig] of configEntries) {
                if (!id) continue;
                const persistedConfig = (rawConfig ?? null) as PersistedChatConfig | null;
                const system =
                    persistedConfig && typeof persistedConfig.systemPrompt === 'string'
                        ? persistedConfig.systemPrompt
                        : '';
                const options = normalizeGenerationOptions(persistedConfig?.generationOptions);
                nextConfigurations[id] = {
                    systemPrompt: system,
                    generationOptions: cloneGenerationOptions(options)
                };
            }
            chatConfigurations = nextConfigurations;

            const candidateId = parsed.activeChatId;
            activeChatId = candidateId && chatHistory[candidateId] ? candidateId : '';

            return true;
        } catch (err) {
            console.error('Failed to load chat state', err);
            return false;
        }
    };

    const createAndActivateChat = (options?: { preserveCurrent?: boolean }) => {
        const preserveCurrent = options?.preserveCurrent ?? true;
        if (preserveCurrent) {
            ensureActiveChatMessagesSaved();
            saveChatState();
        }

        const id = createChatId();
        const now = Date.now();
        const initialMessages = sanitizeMessagesForStore([createInitialBotMessage()]);
        chatHistory = { ...chatHistory, [id]: initialMessages };
        const summary: ChatSummary = {
            id,
            title: DEFAULT_CHAT_TITLE,
            createdAt: now,
            updatedAt: now
        };
        chats = [summary, ...chats.filter((chat) => chat.id !== id)];
        activeChatId = id;
        messages = cloneMessagesFromStore(initialMessages);
        applyChatConfig(id);
        saveChatState();
        return id;
    };

    const setActiveChat = (id: string, options?: { preserveCurrent?: boolean }) => {
        if (!id || id === activeChatId) return;
        const preserveCurrent = options?.preserveCurrent ?? true;
        if (preserveCurrent) {
            ensureActiveChatMessagesSaved();
            saveChatState();
        }

        const stored = chatHistory[id];
        if (!stored) {
            const initialMessages = sanitizeMessagesForStore([createInitialBotMessage()]);
            chatHistory = { ...chatHistory, [id]: initialMessages };
            messages = cloneMessagesFromStore(initialMessages);
        } else {
            messages = cloneMessagesFromStore(stored);
        }

        activeChatId = id;
        input = '';
        error = null;
        isSending = false;
        applyChatConfig(id);
        saveChatState();
    };

    const renameChat = (id: string, title: string) => {
        const trimmed = title?.trim();
        const nextTitle = trimmed ? trimmed : DEFAULT_CHAT_TITLE;
        updateChatSummary(
            id,
            (chat) => ({
                ...chat,
                title: nextTitle
            }),
            { moveToTop: false }
        );
        saveChatState();
    };

    const deleteChat = (id: string) => {
        if (!id || !chats.some((chat) => chat.id === id)) return;

        chats = chats.filter((chat) => chat.id !== id);
        const { [id]: _removed, ...restHistory } = chatHistory;
        chatHistory = restHistory;
        pendingChatIds = pendingChatIds.filter((pendingId) => pendingId !== id);

        const wasActive = activeChatId === id;
        if (wasActive) {
            activeChatId = '';
            const nextId = chats[0]?.id;
            if (nextId) {
                setActiveChat(nextId, { preserveCurrent: false });
            } else {
                createAndActivateChat({ preserveCurrent: false });
            }
        } else {
            saveChatState();
        }
    };

    let live2dModels: ModelOption[] = [];
    let live2dModelsLoading = false;
    let live2dModelsError: string | null = null;
    let previewIndex = 0;
    let activeModelIndex = 0;
    let activeModelId: string | null = null;
    let modelPreviewState: ModelPreviewState = { models: [], index: 0, current: null };
    const live2dDraftOriginals = new Map<string, ModelOption>();

    const setActiveIndex = (index: number) => {
        if (!live2dModels.length) {
            activeModelIndex = 0;
            activeModelId = null;
            return;
        }

        const count = live2dModels.length;
        const normalized = ((index % count) + count) % count;
        activeModelIndex = normalized;
        activeModelId = live2dModels[normalized]?.id ?? null;
    };

    function nextModel() {
        if (!live2dModels.length) return;
        const count = live2dModels.length;
        previewIndex = (previewIndex + 1) % count;
    }

    function prevModel() {
        if (!live2dModels.length) return;
        const count = live2dModels.length;
        previewIndex = (previewIndex - 1 + count) % count;
    }

    const FALLBACK_LIVE2D_MODEL_IDS = ['builtin-huohuo', 'builtin-hiyori', 'builtin-miku'];
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
    let currentModel: ModelOption | null = null;
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
    let isModelManagerOpen = false;

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

    const openModelManager = () => {
        isModelManagerOpen = true;
    };

    const handleModelManagerClose = () => {
        isModelManagerOpen = false;
    };

    const handleModelManagerSelect = (event: CustomEvent<string>) => {
        const id = event.detail;
        const index = live2dModels.findIndex((model) => model.id === id);
        if (index !== -1) {
            selectModel(index);
        }
    };

    const restoreDraftOriginals = () => {
        if (!live2dDraftOriginals.size) return;
        const nextModels = live2dModels.map((model) => {
            const original = live2dDraftOriginals.get(model.id);
            return original ?? model;
        });
        live2dDraftOriginals.clear();
        live2dModels = nextModels;
        if (activeModelId) {
            const nextIndex = live2dModels.findIndex((model) => model.id === activeModelId);
            if (nextIndex !== -1) {
                setActiveIndex(nextIndex);
            }
        }
    };

    const handleModelManagerCreated = async (event: CustomEvent<ModelOption>) => {
        const model = event.detail;
        activeModelId = model.id;
        await loadLive2DModels();
    };

    const handleModelManagerUpdated = async (event: CustomEvent<ModelOption>) => {
        const model = event.detail;
        if (activeModelId === model.id) {
            activeModelId = model.id;
        }
        await loadLive2DModels();
    };

    const handleModelManagerDeleted = async (event: CustomEvent<string>) => {
        const id = event.detail;
        if (activeModelId === id) {
            activeModelId = null;
        }
        await loadLive2DModels();
    };

    const handleModelManagerDraft = (event: CustomEvent<ModelOption | null>) => {
        const draft = event.detail;
        if (!draft) {
            restoreDraftOriginals();
            return;
        }

        const index = live2dModels.findIndex((model) => model.id === draft.id);
        if (index === -1) return;

        if (!live2dDraftOriginals.has(draft.id)) {
            live2dDraftOriginals.set(draft.id, live2dModels[index]);
        }

        const nextModel: ModelOption = {
            ...live2dModels[index],
            label: draft.label,
            modelPath: draft.modelPath,
            cubismCorePath: draft.cubismCorePath,
            anchor: draft.anchor,
            position: draft.position,
            scaleMultiplier: draft.scaleMultiplier,
            targetHeightRatio: draft.targetHeightRatio,
            updatedAt: draft.updatedAt
        };

        live2dModels = live2dModels.map((model, modelIndex) =>
            modelIndex === index ? nextModel : model
        );

        if (activeModelId === draft.id) {
            setActiveIndex(index);
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
    let systemPrompt = '';
    let generationOptions: LLMGenerationOptions = { ...defaultGenerationOptions };
    let isPromptSettingsOpen = false;

    const updateSystemPrompt = (value: string) => {
        systemPrompt = value;
        persistActiveChatConfig();
    };

    const updateGenerationOptions = (value: LLMGenerationOptions) => {
        generationOptions = cloneGenerationOptions(normalizeGenerationOptions(value));
        persistActiveChatConfig();
    };

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
                const normalizedOptions = normalizeGenerationOptions(serverSettings.options);
                applyBaseGenerationOptions(normalizedOptions);
            } else {
                applyBaseGenerationOptions({ ...defaultGenerationOptions });
            }
        } catch (err) {
            settingsLoadError =
                err instanceof Error ? err.message : 'Unable to load provider settings';
            selectedProviderId = providers[0]?.id ?? defaultProvider.id;
            selectedModel = '';
            applyBaseGenerationOptions({ ...defaultGenerationOptions });
        } finally {
            saveChatState();
        }
    };

    const selectModel = (index: number) => {
        if (!live2dModels.length) return;
        const count = live2dModels.length;
        const normalized = ((index % count) + count) % count;
        setActiveIndex(normalized);
        previewIndex = normalized;
    };

    const toggleSidebar = () => {
        isCollapsed = !isCollapsed;
    };

    const openPromptSettings = () => {
        isPromptSettingsOpen = true;
    };

    const closePromptSettings = () => {
        isPromptSettingsOpen = false;
    };

    const startNewChat = () => {
        const id = createAndActivateChat();
        error = null;
        input = '';
        isSending = false;
        removePendingChat(id);
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

    const loadLive2DModels = async () => {
        live2dModelsLoading = true;
        live2dModelsError = null;

        try {
            const models = await listLive2DModels();
            live2dModels = models;
            live2dDraftOriginals.clear();

            if (!models.length) {
                setActiveIndex(0);
                previewIndex = 0;
                return;
            }

            let nextIndex = -1;

            if (activeModelId) {
                nextIndex = models.findIndex((model) => model.id === activeModelId);
            }

            if (nextIndex === -1) {
                for (const candidate of FALLBACK_LIVE2D_MODEL_IDS) {
                    const candidateIndex = models.findIndex((model) => model.id === candidate);
                    if (candidateIndex !== -1) {
                        nextIndex = candidateIndex;
                        break;
                    }
                }
            }

            if (nextIndex === -1) {
                nextIndex = 0;
            }

            setActiveIndex(nextIndex);
            previewIndex = nextIndex;
        } catch (err) {
            live2dModels = [];
            activeModelIndex = 0;
            activeModelId = null;
            previewIndex = 0;
            live2dModelsError = err instanceof Error ? err.message : 'Unable to load Live2D models';
        } finally {
            live2dModelsLoading = false;
        }
    };

    const serializeOptions = (options: LLMGenerationOptions) =>
        JSON.stringify({
            temperature: options.temperature ?? null,
            topP: options.topP ?? null,
            topK: options.topK ?? null,
            maxInputTokens: options.maxInputTokens ?? null,
            maxOutputTokens: options.maxOutputTokens ?? null
        });

    const persistSettings = async (provider: ProviderId, model: string, options: LLMGenerationOptions) => {
        if (!model) return;

        isPersistingSettings = true;
        settingsPersistError = null;

        try {
            await saveProviderSettings(provider, model, options);
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
        updateGenerationOptions({ ...defaultGenerationOptions });
        await ensureModels(provider);
    };

    const sendMessage = async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) return;
        if (!selectedModel) {
            error = 'Select a model before sending a message.';
            return;
        }

        if (!activeChatId) {
            createAndActivateChat({ preserveCurrent: false });
        }
        const chatId = activeChatId || createAndActivateChat({ preserveCurrent: false });

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
            sender: sender === 'user' ? 'user' : 'bot',
            text: String(raw ?? text ?? '')
        }));

        messages = nextMessages;
        input = '';
        error = null;
        isSending = true;
        addPendingChat(chatId);

        const derivedTitle = deriveChatTitle(nextMessages);
        updateChatSummary(
            chatId,
            (chat) => ({
                ...chat,
                title: chat.title && chat.title !== DEFAULT_CHAT_TITLE ? chat.title : derivedTitle,
                updatedAt: Date.now()
            })
        );
        persistActiveChatMessages();

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

            await streamChatMessage(
                selectedProviderId,
                selectedModel,
                systemPrompt,
                payload,
                generationOptions,
                (event: ChatStreamEvent) => {
                    if (event.type === 'delta' && event.value) {
                        assistantMessage.raw = `${assistantMessage.raw ?? ''}${event.value}`;
                        const { text, thinking, hasThinking } = extractMessageParts(
                            assistantMessage.raw ?? ''
                        );
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
                        removePendingChat(chatId);
                        persistActiveChatMessages();
                        if (assistantMessage.text?.trim()) {
                            speakText(assistantMessage.text);
                        } else {
                            console.warn('Skipping TTS: empty text');
                        }
                    }

                    if (event.type === 'error') {
                        throw new Error(event.message ?? 'An unexpected error occurred');
                    }
                }
            );
        } catch (err) {
            error = err instanceof Error ? err.message : 'An unexpected error occurred';
            messages = nextMessages;
            persistActiveChatMessages();
        } finally {
            isSending = false;
            removePendingChat(chatId);
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

        if (browser) {
            const loaded = loadChatState();

            if (loaded) {
                const initialId = activeChatId && chatHistory[activeChatId] ? activeChatId : chats[0]?.id;

                if (initialId) {
                    const storedMessages = chatHistory[initialId];

                    if (storedMessages && storedMessages.length) {
                        activeChatId = initialId;
                        messages = cloneMessagesFromStore(storedMessages);
                        applyChatConfig(initialId);
                    } else {
                        const initialMessages = sanitizeMessagesForStore([createInitialBotMessage()]);
                        chatHistory = { ...chatHistory, [initialId]: initialMessages };
                        activeChatId = initialId;
                        messages = cloneMessagesFromStore(initialMessages);
                        applyChatConfig(initialId);
                        saveChatState();
                    }
                } else {
                    createAndActivateChat({ preserveCurrent: false });
                }
            } else {
                createAndActivateChat({ preserveCurrent: false });
            }
        }

        void (async () => {
            await loadProviders();
            await loadSettings();
            await ensureModels(selectedProviderId);
            await loadLive2DModels();
            allowPersist = true;
            latestPersistSignature = '';
        })();
    });

    $: if (!live2dModels.length) {
        activeModelIndex = 0;
        activeModelId = null;
        previewIndex = 0;
    }

    $: if (live2dModels.length && activeModelIndex >= live2dModels.length) {
        setActiveIndex(live2dModels.length - 1);
    }

    $: if (live2dModels.length && previewIndex >= live2dModels.length) {
        previewIndex = activeModelIndex;
    }

    $: currentModel = live2dModels[activeModelIndex] ?? live2dModels[0] ?? null;
    $: modelPreviewState = {
        models: live2dModels,
        index: live2dModels.length ? previewIndex : 0,
        current: live2dModels[previewIndex] ?? currentModel
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
        const signature = selectedModel
            ? `${selectedProviderId}::${selectedModel}::${serializeOptions(generationOptions)}`
            : '';
        if (signature && signature !== latestPersistSignature) {
            latestPersistSignature = signature;
            persistSettings(selectedProviderId, selectedModel, generationOptions);
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

<div class="flex h-screen min-h-0 flex-col overflow-hidden bg-gradient-to-br from-surface-950 via-surface-950/95 to-surface-900 text-surface-50">
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
            {chats}
            {activeChatId}
            {pendingChatIds}
            on:newChat={startNewChat}
            on:selectChat={({ detail }) => setActiveChat(detail)}
            on:renameChat={({ detail }) => renameChat(detail.id, detail.title)}
            on:deleteChat={({ detail }) => deleteChat(detail)}
        />

        <main class="relative z-10 flex-1 overflow-hidden min-h-0">
            <div class="flex h-full w-full flex-col gap-4 px-4 pb-8 pt-4 min-h-0 lg:px-8 lg:pb-12 2xl:px-12">
                <div class="flex h-full flex-col gap-4 min-h-0 xl:flex-row xl:items-stretch xl:gap-8">
                    <section class="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-surface-800/60 bg-surface-950/90 shadow-2xl shadow-surface-950/30 xl:flex-1">
                        <ChatMessages {messages} />

                        <div class="border-t border-surface-800/50 bg-surface-950/95 p-4">
                            <div class="flex flex-col gap-4">
                        <ChatProviderControls
                            providerState={providerSelectionState}
                            modelState={modelSelectionState}
                            systemPrompt={systemPrompt}
                            options={generationOptions}
                            showPromptSettings={false}
                            on:providerChange={({ detail }) => {
                                selectedProviderId = detail;
                                void handleProviderChange(detail);
                            }}
                            on:modelChange={({ detail }) => (selectedModel = detail)}
                            on:systemPromptChange={({ detail }) => updateSystemPrompt(detail)}
                            on:optionsChange={({ detail }) => updateGenerationOptions(detail)}
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
                                    on:openSettings={openPromptSettings}
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
                        <div class="mt-4 flex flex-col gap-2">
                            <button
                                type="button"
                                class="btn btn-base border border-surface-800/60 bg-surface-950/70 text-sm font-semibold text-surface-100 shadow-lg shadow-surface-950/20"
                                on:click={openModelManager}
                            >
                                Manage Models
                            </button>
                            {#if live2dModelsError}
                                <p class="rounded-2xl border border-error-500/40 bg-error-500/15 px-4 py-3 text-xs text-error-100">
                                    {live2dModelsError}
                                </p>
                            {/if}
                        </div>
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
                            <div class="mt-4 flex flex-col gap-2">
                                <button
                                    type="button"
                                    class="btn btn-base border border-surface-800/60 bg-surface-950/70 text-sm font-semibold text-surface-100 shadow-lg shadow-surface-950/20"
                                    on:click={() => {
                                        closePreviewDrawer();
                                        openModelManager();
                                    }}
                                >
                                    Manage Models
                                </button>
                                {#if live2dModelsError}
                                    <p class="rounded-2xl border border-error-500/40 bg-error-500/15 px-4 py-3 text-xs text-error-100">
                                        {live2dModelsError}
                                    </p>
                                {/if}
                            </div>
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

<Live2DModelManager
    open={isModelManagerOpen}
    models={live2dModels}
    loading={live2dModelsLoading}
    error={live2dModelsError}
    activeModelId={activeModelId}
    on:close={handleModelManagerClose}
    on:select={handleModelManagerSelect}
    on:created={handleModelManagerCreated}
    on:updated={handleModelManagerUpdated}
    on:deleted={handleModelManagerDeleted}
    on:draftChange={handleModelManagerDraft}
/>

<PromptSettingsModal
    open={isPromptSettingsOpen}
    systemPrompt={systemPrompt}
    options={generationOptions}
    on:close={closePromptSettings}
    on:systemPromptChange={({ detail }) => updateSystemPrompt(detail)}
    on:optionsChange={({ detail }) => updateGenerationOptions(detail)}
/>
