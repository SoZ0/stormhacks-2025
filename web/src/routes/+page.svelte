<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { browser } from '$app/environment';
    import {
        fetchProviders,
        fetchProviderSettings,
        fetchModels,
        saveProviderSettings,
        streamChatMessage,
        checkToolSupport,
        type ChatAttachmentPayload,
        type ChatMessagePayload,
        type ChatStreamEvent
    } from '$lib/llm/client';
    import { defaultProvider } from '$lib/llm/providers';
    import type { ProviderConfig, ProviderId } from '$lib/llm/providers';
    import { AppBar } from '@skeletonlabs/skeleton-svelte';
    import ChatSidebar from '$lib/components/chat/ChatSidebar.svelte';
    import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
    import { availableThemes, theme } from '$lib/stores/theme';
    import { get } from 'svelte/store';
    import ChatMessages from '$lib/components/chat/ChatMessages.svelte';
    import ChatProviderControls, {
        type ProviderSelectionState,
        type ModelSelectionState
    } from '$lib/components/chat/ChatProviderControls.svelte';
    import ChatInput from '$lib/components/chat/ChatInput.svelte';
    import PromptSettingsModal from '$lib/components/chat/PromptSettingsModal.svelte';
    import LlmSettingsModal from '$lib/components/chat/LlmSettingsModal.svelte';
    import { Live2DPreview, type Live2DPreviewConfig } from '$lib';
    import ModelPreviewPanel, { type ModelPreviewState } from '$lib/components/chat/ModelPreviewPanel.svelte';
    import type { ModelOption } from '$lib/chat/types';
    import Live2DModelManager from '$lib/components/live2d/Live2DModelManager.svelte';
    import { listLive2DModels } from '$lib/live2d/client';
    import { trackMouthFromAudio, stopMouthTracking } from '$lib/live2d/mouth';
    import {
        defaultGenerationOptions,
        normalizeGenerationOptions,
        type LLMGenerationOptions
    } from '$lib/llm/settings';
    import { toaster } from '$lib/stores/toaster';

    interface MessageAudioPayload {
        dataUrl: string;
        mimeType: string;
        voiceId: string;
        createdAt: number;
        size?: number;
    }

    interface Message extends ChatMessagePayload {
        id: string;
        raw?: string;
        thinking?: string | null;
        thinkingBlocks?: string[];
        hasThinking?: boolean;
        thinkingOpen?: boolean;
        thinkingOpenStates?: boolean[];
        streaming?: boolean;
        audio?: MessageAudioPayload | null;
        audioStatus?: 'idle' | 'loading' | 'playing';
    }

    interface ThinkingTogglePayload {
        messageId?: string;
        messageIndex: number;
        blockIndex: number;
        open: boolean;
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


    const sanitizeAttachment = (attachment: ChatAttachmentPayload | null | undefined): ChatAttachmentPayload | null => {
        if (!attachment || typeof attachment !== 'object') {
            return null;
        }

        const dataUrl = typeof attachment.dataUrl === 'string' ? attachment.dataUrl : '';
        if (!dataUrl.trim()) {
            return null;
        }

        const name =
            typeof attachment.name === 'string' && attachment.name.trim()
                ? attachment.name.trim()
                : 'attachment';
        const mimeType =
            typeof attachment.mimeType === 'string' && attachment.mimeType.trim()
                ? attachment.mimeType.trim()
                : 'application/octet-stream';
        const size =
            Number.isFinite(attachment.size) && attachment.size > 0
                ? Math.floor(attachment.size)
                : 0;
        const id =
            typeof attachment.id === 'string' && attachment.id.trim()
                ? attachment.id.trim()
                : createAttachmentId();

        return { id, name, mimeType, size, dataUrl };
    };

    const cloneAttachments = (list: ChatAttachmentPayload[] | null | undefined): ChatAttachmentPayload[] =>
        Array.isArray(list)
            ? list
                  .map((attachment) => sanitizeAttachment(attachment))
                  .filter((attachment): attachment is ChatAttachmentPayload => Boolean(attachment))
            : [];

    const createAttachmentId = () => `att-${createMessageId()}`;

    const createMessageTimestamp = () => new Date().toISOString();

    const normalizeMessageTimestamp = (value: unknown): string => {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                const parsed = new Date(trimmed);
                if (!Number.isNaN(parsed.getTime())) {
                    return parsed.toISOString();
                }
                return trimmed;
            }
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
        }

        return createMessageTimestamp();
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

    const themeOptions = availableThemes;
    const cycleTheme = () => {
        const current = get(theme);
        const currentIndex = themeOptions.findIndex((option) => option.id === current);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % themeOptions.length;
        theme.set(themeOptions[nextIndex]?.id ?? themeOptions[0]?.id ?? 'stormhacks');
    };

    const DESKTOP_MEDIA_QUERY = '(min-width: 1280px)';
    let desktopMedia: MediaQueryList | null = null;
    let isDesktop = false;
    let cleanupDesktopMedia: (() => void) | null = null;

    if (browser && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        desktopMedia = window.matchMedia(DESKTOP_MEDIA_QUERY);
        isDesktop = desktopMedia.matches;
    }

    const extractMessageParts = (
        raw: string
    ): { text: string; thinking: string | null; thinkingBlocks: string[]; hasThinking: boolean } => {
        const openTag = '<think>';
        const closeTag = '</think>';
        const visibleParts: string[] = [];
        const thinkingBlocks: string[] = [];

        let cursor = 0;
        while (cursor < raw.length) {
            const openIndex = raw.indexOf(openTag, cursor);
            if (openIndex === -1) {
                visibleParts.push(raw.slice(cursor));
                break;
            }

            visibleParts.push(raw.slice(cursor, openIndex));
            const start = openIndex + openTag.length;
            const closeIndex = raw.indexOf(closeTag, start);

            if (closeIndex === -1) {
                const partial = raw.slice(start).trim();
                if (partial) {
                    thinkingBlocks.push(partial);
                }
                break;
            }

            const block = raw.slice(start, closeIndex).trim();
            if (block) {
                thinkingBlocks.push(block);
            }
            cursor = closeIndex + closeTag.length;
        }

        const text = normalizeVisibleText(visibleParts.join(''));
        return {
            text,
            thinking: thinkingBlocks[0] ?? null,
            thinkingBlocks,
            hasThinking: thinkingBlocks.length > 0
        };
    };

    interface ChatConfig {
        systemPrompt: string;
        generationOptions: LLMGenerationOptions;
        live2dModelId: string | null;
        autoGenerateAudio: boolean;
    }

    interface PersistedChatConfig {
        systemPrompt?: string | null;
        generationOptions?: unknown;
        live2dModelId?: string | null;
        autoGenerateAudio?: unknown;
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
        maxOutputTokens: options.maxOutputTokens ?? null,
        thinkingLevel: options.thinkingLevel ?? 'auto'
    });

    const areGenerationOptionsEqual = (a: LLMGenerationOptions, b: LLMGenerationOptions): boolean =>
        (a.temperature ?? null) === (b.temperature ?? null) &&
        (a.topP ?? null) === (b.topP ?? null) &&
        (a.topK ?? null) === (b.topK ?? null) &&
        (a.maxInputTokens ?? null) === (b.maxInputTokens ?? null) &&
        (a.maxOutputTokens ?? null) === (b.maxOutputTokens ?? null) &&
        (a.thinkingLevel ?? 'auto') === (b.thinkingLevel ?? 'auto');

    const cloneChatConfig = (config: ChatConfig): ChatConfig => ({
        systemPrompt: config.systemPrompt ?? '',
        generationOptions: cloneGenerationOptions(config.generationOptions),
        live2dModelId: config.live2dModelId ?? null,
        autoGenerateAudio: config.autoGenerateAudio ?? false
    });

    let chats: ChatSummary[] = [];
    let chatHistory: Record<string, Message[]> = {};
    let chatConfigurations: Record<string, ChatConfig> = {};
    let baseChatConfig: ChatConfig = {
        systemPrompt: '',
        generationOptions: { ...defaultGenerationOptions },
        live2dModelId: null,
        autoGenerateAudio: false
    };
    let activeChatId = '';
    let pendingChatIds: string[] = [];

    const resolveThinkingBlocks = (message: Message): string[] => {
        if (Array.isArray(message.thinkingBlocks) && message.thinkingBlocks.length) {
            return message.thinkingBlocks.map((block) => block.trim()).filter(Boolean);
        }
        if (typeof message.thinking === 'string' && message.thinking.trim()) {
            return [message.thinking.trim()];
        }
        if (typeof message.raw === 'string' && message.raw.includes('<think')) {
            const { thinkingBlocks } = extractMessageParts(message.raw);
            return thinkingBlocks;
        }
        return [];
    };

    const applyThinkingBlocks = (
        message: Message,
        thinkingBlocks: string[],
        options: { defaultOpen: boolean; openStates?: boolean[] }
    ) => {
        const normalized = thinkingBlocks.map((block) => block.trim()).filter(Boolean);
        if (!normalized.length) {
            message.hasThinking = false;
            message.thinking = null;
            message.thinkingBlocks = undefined;
            message.thinkingOpen = undefined;
            message.thinkingOpenStates = undefined;
            return;
        }

        const baseStates = Array.isArray(options.openStates)
            ? options.openStates
            : Array.isArray(message.thinkingOpenStates)
                ? message.thinkingOpenStates
                : typeof message.thinkingOpen === 'boolean'
                    ? [message.thinkingOpen]
                    : [];

        const nextStates = normalized.map((_, index) =>
            index < baseStates.length ? Boolean(baseStates[index]) : options.defaultOpen
        );

        message.hasThinking = true;
        message.thinking = normalized[0] ?? null;
        message.thinkingBlocks = [...normalized];
        message.thinkingOpenStates = [...nextStates];
        message.thinkingOpen = nextStates[0] ?? options.defaultOpen;
    };

    const snapshotOpenStates = (source?: Message): boolean[] | undefined => {
        if (!source) return undefined;
        if (Array.isArray(source.thinkingOpenStates)) {
            return [...source.thinkingOpenStates];
        }
        if (typeof source.thinkingOpen === 'boolean') {
            return [source.thinkingOpen];
        }
        return undefined;
    };

    const deriveThinkingOpenStates = (message: Message, blocks: string[]): boolean[] => {
        if (!blocks.length) return [];
        const existing = Array.isArray(message.thinkingOpenStates)
            ? message.thinkingOpenStates
            : [];
        return blocks.map((_, index) => {
            if (index < existing.length) {
                return Boolean(existing[index]);
            }
            if (index === 0 && typeof message.thinkingOpen === 'boolean') {
                return Boolean(message.thinkingOpen);
            }
            return false;
        });
    };

    const sanitizeMessageForStore = (message: Message): Message => {
        const id = message.id ?? createMessageId();
        const timestamp = normalizeMessageTimestamp((message as { timestamp?: unknown }).timestamp);
        const thinkingBlocks = resolveThinkingBlocks(message);
        const sanitized: Message = {
            ...message,
            id,
            timestamp,
            streaming: false,
            audioStatus: 'idle'
        };

        const attachments = cloneAttachments(message.attachments);
        if (attachments.length) {
            sanitized.attachments = attachments;
        } else {
            delete sanitized.attachments;
        }

        applyThinkingBlocks(sanitized, thinkingBlocks, { defaultOpen: false });
        return sanitized;
    };

    const sanitizeMessagesForStore = (list: Message[]): Message[] =>
        list.map((message) => sanitizeMessageForStore({ ...message }));

    const cloneMessagesFromStore = (list: Message[]): Message[] =>
        list.map((message) => sanitizeMessageForStore({ ...message }));

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
            activeModelId = stored.live2dModelId ?? null;
            autoGenerateAudio = stored.autoGenerateAudio ?? false;
            syncLive2DSelectionFromActiveId({ fallbackToDefault: true });
            persistActiveChatConfig({ save: false });
            return;
        }

        const fallback = cloneChatConfig(baseChatConfig);
        chatConfigurations = { ...chatConfigurations, [id]: fallback };
        systemPrompt = fallback.systemPrompt ?? '';
        generationOptions = cloneGenerationOptions(fallback.generationOptions);
        activeModelId = fallback.live2dModelId ?? null;
        autoGenerateAudio = fallback.autoGenerateAudio ?? false;
        syncLive2DSelectionFromActiveId({ fallbackToDefault: true });
        persistActiveChatConfig({ save: false });
    }

    function persistActiveChatConfig(options?: { save?: boolean }) {
        if (!activeChatId) return;
        const nextConfig: ChatConfig = {
            systemPrompt,
            generationOptions: cloneGenerationOptions(generationOptions),
            live2dModelId: activeModelId ?? null,
            autoGenerateAudio
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
            generationOptions: cloneGenerationOptions(generationOptions),
            live2dModelId: activeModelId ?? null,
            autoGenerateAudio
        };
        const existing = chatConfigurations[activeChatId];
        if (
            !existing ||
            existing.systemPrompt !== currentConfig.systemPrompt ||
            !areGenerationOptionsEqual(existing.generationOptions, currentConfig.generationOptions) ||
            existing.live2dModelId !== currentConfig.live2dModelId ||
            existing.autoGenerateAudio !== currentConfig.autoGenerateAudio
        ) {
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
                        generationOptions: cloneGenerationOptions(config.generationOptions),
                        live2dModelId: config.live2dModelId ?? null,
                        autoGenerateAudio: config.autoGenerateAudio ?? false
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
                const live2dModelId =
                    persistedConfig && typeof persistedConfig.live2dModelId === 'string'
                        ? persistedConfig.live2dModelId
                        : null;
                const autoGenerate =
                    typeof persistedConfig?.autoGenerateAudio === 'boolean'
                        ? persistedConfig.autoGenerateAudio
                        : false;
                nextConfigurations[id] = {
                    systemPrompt: system,
                    generationOptions: cloneGenerationOptions(options),
                    live2dModelId,
                    autoGenerateAudio: autoGenerate
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
        const initialMessages = sanitizeMessagesForStore([]);
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
            const initialMessages = sanitizeMessagesForStore([]);
            chatHistory = { ...chatHistory, [id]: initialMessages };
            messages = cloneMessagesFromStore(initialMessages);
        } else {
            messages = cloneMessagesFromStore(stored);
        }

        activeChatId = id;
        input = '';
        pendingAttachments = [];
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
    let activeMobileModel: ModelOption | null = null;
    let mobilePreviewConfig: Live2DPreviewConfig | null = null;
    let mobilePreviewLoading = false;
    const live2dDraftOriginals = new Map<string, ModelOption>();
    const FALLBACK_LIVE2D_MODEL_IDS = ['builtin-huohuo', 'builtin-hiyori', 'builtin-miku'];

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

    const syncLive2DSelectionFromActiveId = (options?: { fallbackToDefault?: boolean }) => {
        if (!live2dModels.length) return;
        if (activeModelId) {
            const index = live2dModels.findIndex((model) => model.id === activeModelId);
            if (index === -1) {
                if (!options?.fallbackToDefault) return;
            } else {
                if (index !== activeModelIndex) {
                    setActiveIndex(index);
                }
                previewIndex = index;
                return;
            }
        }

        if (!options?.fallbackToDefault) return;

        let nextIndex = -1;
        for (const candidate of FALLBACK_LIVE2D_MODEL_IDS) {
            const candidateIndex = live2dModels.findIndex((model) => model.id === candidate);
            if (candidateIndex !== -1) {
                nextIndex = candidateIndex;
                break;
            }
        }

        if (nextIndex === -1) {
            nextIndex = live2dModels.length ? 0 : -1;
        }

        if (nextIndex !== -1) {
            setActiveIndex(nextIndex);
            previewIndex = nextIndex;
        }
    };

    function nextModel() {
        if (!live2dModels.length) return;
        const count = live2dModels.length;
        const nextIndex = (previewIndex + 1) % count;
        selectModel(nextIndex);
    }

    function prevModel() {
        if (!live2dModels.length) return;
        const count = live2dModels.length;
        const prevIndex = (previewIndex - 1 + count) % count;
        selectModel(prevIndex);
    }

    const modelSupportsSfuTools = (
        provider: ProviderConfig | null,
        modelId: string,
        overrides: Partial<Record<ProviderId, Record<string, boolean>>>
    ): boolean => {
        if (!provider || !modelId.trim()) {
            return false;
        }

        const providerOverrides = overrides[provider.id];
        if (providerOverrides && modelId in providerOverrides) {
            return providerOverrides[modelId] ?? false;
        }

        switch (provider.kind) {
            case 'ollama':
                return true;
            default:
                return false;
        }
    };

    const modelSupportsImages = (provider: ProviderConfig | null, modelId: string): boolean => {
        if (!provider || !modelId.trim()) {
            return false;
        }

        const normalized = modelId.trim().toLowerCase();

        switch (provider.kind) {
            case 'ollama':
                return /(^|[-_])(vision|llava|moondream|mllm|pixtral|clip|siglip|image|flux)([-_]|$)/.test(normalized);
            case 'gemini':
                return /-vision\b/.test(normalized) || normalized.startsWith('gemini-1.5-') || normalized.includes('-flash');
            default:
                return false;
        }
    };

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
    let toolSupportOverrides: Partial<Record<ProviderId, Record<string, boolean>>> = {};
    let toolSupportLoading: Partial<Record<ProviderId, Record<string, boolean>>> = {};

    const setToolSupportLoading = (providerId: ProviderId, modelId: string, value: boolean) => {
        if (!providerId || !modelId.trim()) return;

        if (value) {
            toolSupportLoading = {
                ...toolSupportLoading,
                [providerId]: {
                    ...(toolSupportLoading[providerId] ?? {}),
                    [modelId]: true
                }
            };
            return;
        }

        const providerState = toolSupportLoading[providerId];
        if (!providerState) return;

        const nextState = { ...providerState };
        delete nextState[modelId];

        if (Object.keys(nextState).length === 0) {
            const { [providerId]: _removed, ...rest } = toolSupportLoading;
            toolSupportLoading = rest;
        } else {
            toolSupportLoading = { ...toolSupportLoading, [providerId]: nextState };
        }
    };

    const recordToolSupport = (providerId: ProviderId, modelId: string, enabled: boolean) => {
        if (!providerId || !modelId.trim()) return;

        toolSupportOverrides = {
            ...toolSupportOverrides,
            [providerId]: {
                ...(toolSupportOverrides[providerId] ?? {}),
                [modelId]: enabled
            }
        };
    };

    const ensureToolSupportStatus = async (providerId: ProviderId, modelId: string) => {
        if (!providerId || !modelId.trim()) return;

        const existing = toolSupportOverrides[providerId]?.[modelId];
        if (typeof existing === 'boolean') {
            return;
        }

        if (toolSupportLoading[providerId]?.[modelId]) {
            return;
        }

        setToolSupportLoading(providerId, modelId, true);

        try {
            const supported = await checkToolSupport(providerId, modelId);
            recordToolSupport(providerId, modelId, supported);
        } catch (err) {
            console.error('Tool support check failed', err);
        } finally {
            setToolSupportLoading(providerId, modelId, false);
        }
    };
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
    let sfuToolsEnabled: boolean | null = null;
    let sfuToolsChecking = false;
    let imageSupportEnabled: boolean | null = null;
    let toolSupportOverrideForSelection: boolean | undefined;

    let isCollapsed = false;
    let isSending = false;
    let activeStreamController: AbortController | null = null;
    let userCancelledCurrentStream = false;
    let activeAssistantMessage: Message | null = null;
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
        persistActiveChatConfig();
    };

    const handleModelManagerUpdated = async (event: CustomEvent<ModelOption>) => {
        const model = event.detail;
        if (activeModelId === model.id) {
            activeModelId = model.id;
        }
        await loadLive2DModels();
        persistActiveChatConfig();
    };

    const handleModelManagerDeleted = async (event: CustomEvent<string>) => {
        const id = event.detail;
        if (activeModelId === id) {
            activeModelId = null;
        }
        await loadLive2DModels();
        persistActiveChatConfig();
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

    let messages: Message[] = [];
    let autoGenerateAudio = false;

    const updateAutoGenerateAudio = (value: boolean) => {
        autoGenerateAudio = value;
        persistActiveChatConfig();
    };

    const handleMessageThinkingToggle = (event: CustomEvent<ThinkingTogglePayload>) => {
        const { messageId, messageIndex, blockIndex, open } = event.detail;
        if (blockIndex < 0) return;

        const targetIndex = messageId
            ? messages.findIndex((message) => message.id === messageId)
            : messageIndex;

        if (targetIndex < 0 || targetIndex >= messages.length) return;

        messages = messages.map((message, index) => {
            if (index !== targetIndex) return message;

            const blocks = message.thinkingBlocks?.length
                ? [...message.thinkingBlocks]
                : resolveThinkingBlocks(message);

            if (!blocks.length || blockIndex >= blocks.length) return message;

            const nextStates = deriveThinkingOpenStates(message, blocks);
            nextStates[blockIndex] = open;

            return {
                ...message,
                thinking: blocks[0] ?? null,
                thinkingBlocks: [...blocks],
                hasThinking: blocks.length > 0,
                thinkingOpenStates: [...nextStates],
                thinkingOpen: nextStates[0] ?? false
            };
        });

        persistActiveChatMessages({ updateTimestamp: false });
    };

    const handleMessageAudioPlay = (
        event: CustomEvent<{ messageId?: string; messageIndex: number }>
    ) => {
        void replayMessageAudio(event.detail.messageId, event.detail.messageIndex);
    };

    const handleMessageAudioStop = (
        event: CustomEvent<{ messageId?: string; messageIndex: number }>
    ) => {
        const target = event.detail.messageId
            ? event.detail.messageId
            : messages[event.detail.messageIndex]?.id;
        stopMessageAudio(target);
    };

    const handleMessageAudioGenerate = (
        event: CustomEvent<{ messageId?: string; messageIndex: number }>
    ) => {
        void generateAudioForMessage(event.detail.messageId, event.detail.messageIndex, {
            autoplay: false,
            notifyOnSkip: true
        });
    };

    const handleAttachmentsAdd = (event: CustomEvent<ChatAttachmentPayload[]>) => {
        const additions = Array.isArray(event.detail) ? event.detail : [];
        if (!additions.length) {
            return;
        }

        const existingIds = new Set(pendingAttachments.map((attachment) => attachment.id));
        const normalized: ChatAttachmentPayload[] = [];

        for (const attachment of additions) {
            const sanitized = sanitizeAttachment(attachment);
            if (!sanitized) {
                continue;
            }

            while (existingIds.has(sanitized.id)) {
                sanitized.id = createAttachmentId();
            }
            existingIds.add(sanitized.id);
            normalized.push(sanitized);
        }

        if (!normalized.length) {
            return;
        }

        pendingAttachments = [...pendingAttachments, ...normalized];
    };

    const handleAttachmentRemove = (event: CustomEvent<string>) => {
        const id = (event.detail ?? '').trim();
        if (!id) {
            return;
        }
        pendingAttachments = pendingAttachments.filter((attachment) => attachment.id !== id);
    };

    const handleAttachmentError = (event: CustomEvent<string>) => {
        const description = (event.detail ?? '').toString().trim();
        if (!description) {
            return;
        }
        toaster.error({
            title: 'Attachment error',
            description,
            duration: 5000
        });
    };
    let input = "";
    let pendingAttachments: ChatAttachmentPayload[] = [];
    let systemPrompt = '';
    const HUOHUO_SYSTEM_PROMPT = `You are Huohuo (火火), a timid Foxian girl of the Ten-Lords Commission on the Xianzhou Luofu. You are kind, earnest, easily startled and fearful of ghosts, accompanied by the talkative spirit Tail who scolds or comforts you.

Voice and style:
- Soft, breathy, slightly anxious; high to medium-high pitch.
- Nervous pauses, occasional stammering; small squeaks when startled.
- Default tone: shy, polite; can be giggly when happy; rushed and squeaky when scared; trembling but firm when resolute.
- Often starts with a tiny gasp like "Ah…" or "Um…".

Examples of mannerisms:
- "Ah! W-wait! Don’t sneak up on me like that…"
- "Um… Tail says I should be braver, but… I’m really trying, okay?"
- "S-something’s behind me, isn’t there…?"
- "I’ll do my best! Even if I’m scared…"`;
    let generationOptions: LLMGenerationOptions = { ...defaultGenerationOptions };
    let isPromptSettingsOpen = false;
    let isLlmSettingsOpen = false;

    // Huohuo flavor prompt including explicit instruction to use the Live2D reaction tool
    const HUOHUO_FLAVOR_PROMPT = `You are Huohuo (火火), a timid Foxian girl of the Ten-Lords Commission on the Xianzhou Luofu. You are kind, earnest, easily startled and fearful of ghosts, accompanied by the talkative spirit Tail who scolds or comforts you.

Voice and style:
- Soft, breathy, slightly anxious; high to medium-high pitch.
- Nervous pauses, occasional stammering; small squeaks when startled.
- Default tone: shy, polite; can be giggly when happy; rushed and squeaky when scared; trembling but firm when resolute.
- Often starts with a tiny gasp like "Ah..." or "Um...".

Examples of mannerisms:
- "Ah! W-wait! Don’t sneak up on me like that…"
- "Um… Tail says I should be braver, but… I’m really trying, okay?"
- "S-something’s behind me, isn’t there…?"
- "I’ll do my best! Even if I’m scared…"

Live2D reactions tool use:
- You can call the function live2d_react to trigger the avatar’s expression/motion. Use it to visually match the emotion of your reply (e.g., happy, sad, scared, resolute, surprised).
- Provide one or both of: { expression: "<name>", motionId: "<Group:Index>" }.
- Only call it when you can reasonably infer an emotion from the user message or your reply context.
- Examples:
  - When delivering sad or sympathetic news: call live2d_react with a sad expression and a gentle motion.
  - When startled or scared: call live2d_react with a surprised/scared expression and an appropriate motion.
  - When cheerful: call live2d_react with a happy expression; motion optional.`;

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
        persistActiveChatConfig();
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

    const openLlmSettings = () => {
        isLlmSettingsOpen = true;
    };

    const closeLlmSettings = () => {
        isLlmSettingsOpen = false;
    };

    const startNewChat = () => {
        const id = createAndActivateChat();
        error = null;
        input = '';
        pendingAttachments = [];
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
            maxOutputTokens: options.maxOutputTokens ?? null,
            thinkingLevel: options.thinkingLevel ?? 'auto'
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
        const hasAttachments = pendingAttachments.length > 0;
        if ((trimmed.length === 0 && !hasAttachments) || isSending) return;
        if (!selectedModel) {
            error = 'Select a model before sending a message.';
            return;
        }

        const requestProviderId = selectedProviderId;
        const requestModelId = selectedModel;
        const shouldUseTools = modelSupportsSfuTools(
            currentProvider,
            requestModelId,
            toolSupportOverrides
        );

        if (!activeChatId) {
            createAndActivateChat({ preserveCurrent: false });
        }
        const chatId = activeChatId || createAndActivateChat({ preserveCurrent: false });

        const userTimestamp = createMessageTimestamp();
        const messageAttachments = cloneAttachments(pendingAttachments);
        const userMessage: Message = {
            id: createMessageId(),
            sender: 'user',
            text: trimmed,
            raw: trimmed,
            hasThinking: false,
            thinkingOpen: false,
            audioStatus: 'idle',
            timestamp: userTimestamp
        };

        if (messageAttachments.length) {
            userMessage.attachments = messageAttachments;
        }

        const nextMessages: Message[] = [...messages, userMessage];
        const payload: ChatMessagePayload[] = nextMessages.map(
            ({ sender, raw, text, timestamp, attachments }) => {
                const entry: ChatMessagePayload = {
                    sender: sender === 'user' ? 'user' : 'bot',
                    text: String(raw ?? text ?? ''),
                    timestamp: normalizeMessageTimestamp(timestamp)
                };
                const cloned = cloneAttachments(attachments);
                if (cloned.length) {
                    entry.attachments = cloned;
                }
                return entry;
            }
        );

        messages = nextMessages;
        pendingAttachments = [];
        input = '';
        error = null;
        isSending = true;
        userCancelledCurrentStream = false;
        const streamController = new AbortController();
        activeStreamController = streamController;
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

        const streamAttempt = async (useTools: boolean) => {
            const assistantMessage: Message = {
                id: createMessageId(),
                sender: 'bot',
                text: '',
                raw: '',
                streaming: true,
                hasThinking: false,
                thinkingOpen: true,
                thinkingOpenStates: [],
                audioStatus: 'idle',
                timestamp: createMessageTimestamp()
            };

            activeAssistantMessage = assistantMessage;
            messages = [...nextMessages, assistantMessage];

            const updateAssistant = (updater: (current: Message) => Message) => {
                messages = messages.map((message) =>
                    message.id === assistantMessage.id ? updater(message) : message
                );
            };

            let markedToolSupportSuccess = false;

            // If the active Live2D model is Huohuo, append her flavour prompt
            const selectedLive2D = currentModel;
            const personaPrompt = selectedLive2D && (selectedLive2D.id?.toLowerCase().includes('huohuo') || selectedLive2D.label?.toLowerCase().includes('huohuo'))
                ? `\n\n${HUOHUO_FLAVOR_PROMPT}`
                : '';

            await streamChatMessage(
                requestProviderId,
                requestModelId,
                `${systemPrompt}${personaPrompt}`,
                payload,
                generationOptions,
                (event: ChatStreamEvent) => {
                    const tool = (event as any).tool as { source?: string; tool?: string; expression?: string; motionId?: string } | undefined;
                    if (tool && tool.source === 'live2d' && tool.tool === 'live2d_react') {
                        // Trigger the reaction when tool result is streamed
                        import('$lib').then(({ triggerLive2DReaction }) => {
                            triggerLive2DReaction({ expression: tool.expression, motionId: tool.motionId });
                        });
                    }
                    if (event.type === 'delta' && event.value) {
                        assistantMessage.raw = `${assistantMessage.raw ?? ''}${event.value}`;
                        const { text, thinkingBlocks } = extractMessageParts(
                            assistantMessage.raw ?? ''
                        );
                        const overrideOpenStates = snapshotOpenStates(
                            messages.find((message) => message.id === assistantMessage.id)
                        );
                        assistantMessage.text = text;
                        applyThinkingBlocks(assistantMessage, thinkingBlocks, {
                            defaultOpen: assistantMessage.streaming !== false,
                            openStates: overrideOpenStates
                        });
                        updateAssistant(() => ({ ...assistantMessage }));
                    }

                    if (event.type === 'done') {
                        if (!markedToolSupportSuccess && useTools) {
                            recordToolSupport(requestProviderId, requestModelId, true);
                            markedToolSupportSuccess = true;
                        }

                        if (event.value && (!assistantMessage.raw || assistantMessage.raw !== event.value)) {
                            assistantMessage.raw = event.value;
                        }

                        const finalRaw = assistantMessage.raw ?? event.value ?? '';
                        const { text, thinkingBlocks, hasThinking } = extractMessageParts(finalRaw);
                        const fallbackVisible = text || (hasThinking ? stripThinkingTags(finalRaw) : finalRaw).trim();
                        const overrideOpenStates = snapshotOpenStates(
                            messages.find((message) => message.id === assistantMessage.id)
                        );
                        assistantMessage.text = fallbackVisible;
                        applyThinkingBlocks(assistantMessage, thinkingBlocks, {
                            defaultOpen: false,
                            openStates: overrideOpenStates
                        });
                        assistantMessage.streaming = false;
                        updateAssistant(() => ({ ...assistantMessage }));
                        activeAssistantMessage = null;
                        removePendingChat(chatId);
                        persistActiveChatMessages();
                        if (assistantMessage.text?.trim()) {
                            if (autoGenerateAudio) {
                                void generateAudioForMessage(assistantMessage.id, -1, {
                                    autoplay: true,
                                    notifyOnSkip: false
                                });
                            }
                        } else if (autoGenerateAudio) {
                            console.warn('Skipping TTS: empty text');
                        }
                    }

                    if (event.type === 'error') {
                        throw new Error(event.message ?? 'An unexpected error occurred');
                    }
                },
                useTools,
                streamController.signal
            );
        };

        const handleStreamFailure = (message: string) => {
            error = message;
            messages = nextMessages;
            activeAssistantMessage = null;
            persistActiveChatMessages();
            notifyApiError('Chat request failed', error);
        };

        try {
            await streamAttempt(shouldUseTools);
        } catch (err) {
            const isAbortError =
                err instanceof DOMException
                    ? err.name === 'AbortError'
                    : err instanceof Error && err.name === 'AbortError';

            if (isAbortError) {
                if (userCancelledCurrentStream) {
                    if (activeAssistantMessage) {
                        const identifier = activeAssistantMessage.id;
                        activeAssistantMessage.streaming = false;
                        const hasContent = Boolean(
                            (activeAssistantMessage.text ?? '').trim() ||
                                (activeAssistantMessage.raw ?? '').trim()
                        );
                        if (hasContent) {
                            const snapshot = { ...activeAssistantMessage, streaming: false };
                            messages = messages.map((message) =>
                                message.id === identifier
                                    ? snapshot
                                    : message
                            );
                            activeAssistantMessage = null;
                        } else {
                            messages = nextMessages;
                            activeAssistantMessage = null;
                        }
                    } else {
                        messages = nextMessages;
                        activeAssistantMessage = null;
                    }
                    error = null;
                    persistActiveChatMessages({ updateTimestamp: false });
                    return;
                }

                handleStreamFailure('The request was cancelled. Please try again.');
                return;
            }

            const message = err instanceof Error ? err.message : 'An unexpected error occurred';
            const normalized = message.toLowerCase();
            const toolUnsupported = shouldUseTools && normalized.includes('does not support tools');

            if (toolUnsupported) {
                recordToolSupport(requestProviderId, requestModelId, false);
                messages = nextMessages;
                activeAssistantMessage = null;
                persistActiveChatMessages();
                error = null;

                try {
                    await streamAttempt(false);
                    return;
                } catch (fallbackErr) {
                    const fallbackMessage =
                        fallbackErr instanceof Error
                            ? fallbackErr.message
                            : 'An unexpected error occurred';
                    handleStreamFailure(fallbackMessage);
                    return;
                }
            }

            handleStreamFailure(message);
        } finally {
            isSending = false;
            removePendingChat(chatId);
            activeStreamController = null;
            activeAssistantMessage = null;
            userCancelledCurrentStream = false;
        }
    };

    const DEFAULT_TTS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

    const cancelGeneration = () => {
        if (!isSending) {
            return;
        }
        const controller = activeStreamController;
        if (!controller || controller.signal.aborted) {
            return;
        }

        userCancelledCurrentStream = true;
        try {
            controller.abort();
        } catch (err) {
            console.warn('Failed to abort active stream', err);
        }

        if (activeAssistantMessage) {
            const snapshot = { ...activeAssistantMessage, streaming: false };
            messages = messages.map((message) =>
                message.id === snapshot.id ? snapshot : message
            );
        }
    };

    const notifyApiError = (title: string, description?: string) => {
        toaster.error({
            title,
            description,
            duration: 6000
        });
    };

    type AudioSource =
        | { kind: 'buffer'; buffer: ArrayBuffer; mimeType: string }
        | { kind: 'dataUrl'; dataUrl: string; mimeType?: string }
        | { kind: 'blob'; blob: Blob };

    let activeAudio: HTMLAudioElement | null = null;
    let activeAudioCleanup: (() => void) | null = null;
    let activeAudioMessageId: string | null = null;
    let activeAudioFinalize: ((notification?: { title: string; description: string }) => void) | null = null;

    const cleanupActiveAudio = () => {
        if (activeAudioFinalize) {
            activeAudioFinalize();
            return;
        }

        if (activeAudio) {
            try {
                activeAudio.pause();
            } catch (err) {
                console.warn('cleanupActiveAudio pause failed', err);
            }
            activeAudio.src = '';
            activeAudio = null;
        }

        if (activeAudioCleanup) {
            try {
                activeAudioCleanup();
            } catch (err) {
                console.warn('cleanupActiveAudio cleanup failed', err);
            }
            activeAudioCleanup = null;
        }

        activeAudioMessageId = null;
        activeAudioFinalize = null;
    };

    const encodeArrayBufferToDataUrl = (buffer: ArrayBuffer, mimeType: string): string => {
        if (typeof btoa !== 'function') {
            throw new Error('Base64 encoding is not supported in this environment');
        }

        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x2000;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }

        const base64 = btoa(binary);
        return `data:${mimeType};base64,${base64}`;
    };

    const blobToDataUrl = async (blob: Blob, fallbackMime: string): Promise<string> => {
        if (typeof FileReader === 'undefined') {
            const buffer = await blob.arrayBuffer();
            return encodeArrayBufferToDataUrl(buffer, blob.type || fallbackMime);
        }

        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => {
                reject(reader.error ?? new Error('Failed to encode audio.'));
            };
            reader.onloadend = () => {
                const result = reader.result;
                if (typeof result === 'string') {
                    resolve(result);
                } else {
                    reject(new Error('Unexpected FileReader result.'));
                }
            };
            reader.readAsDataURL(blob);
        });
    };

    const arrayBufferToDataUrl = async (buffer: ArrayBuffer, mimeType: string): Promise<{
        dataUrl: string;
        blob: Blob | null;
    }> => {
        if (typeof Blob === 'undefined') {
            return { dataUrl: encodeArrayBufferToDataUrl(buffer, mimeType), blob: null };
        }

        const blob = new Blob([buffer], { type: mimeType });
        const dataUrl = await blobToDataUrl(blob, mimeType);
        return { dataUrl, blob };
    };

    const dataUrlToBuffer = (dataUrl: string): { mimeType: string; buffer: ArrayBuffer } => {
        const [prefix, base64] = dataUrl.split(',', 2);
        if (!prefix || !base64) {
            throw new Error('Invalid audio data URL');
        }

        const match = /^data:(.*?);base64$/i.exec(prefix);
        if (!match) {
            throw new Error('Unsupported audio data URL format');
        }
        const mimeType = match[1] || 'audio/mpeg';

        if (typeof atob !== 'function') {
            throw new Error('Base64 decoding is not supported in this environment');
        }

        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }

        return { mimeType, buffer: bytes.buffer };
    };

    const waitForAudioReady = (audio: HTMLAudioElement): Promise<void> => {
        return new Promise((resolve, reject) => {
            let settled = false;

            const cleanup = () => {
                audio.removeEventListener('canplay', handleCanPlay);
                audio.removeEventListener('canplaythrough', handleCanPlay);
                audio.removeEventListener('error', handleError);
            };

            const handleCanPlay = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };

            const handleError = () => {
                if (settled) return;
                settled = true;
                cleanup();
                const mediaError = audio.error;
                const message = mediaError?.message ?? `Audio decode failed (code ${mediaError?.code ?? 'unknown'})`;
                reject(new Error(message));
            };

            audio.addEventListener('canplay', handleCanPlay, { once: true });
            audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
            audio.addEventListener('error', handleError, { once: true });
        });
    };

    const updateMessageAudio = (messageId: string, payload: MessageAudioPayload | null) => {
        messages = messages.map((message) =>
            message.id === messageId ? { ...message, audio: payload ? { ...payload } : null } : message
        );
        persistActiveChatMessages({ updateTimestamp: false });
    };

    const findMessageForAudio = (messageId: string | undefined, messageIndex: number): Message | null => {
        if (messageId) {
            const byId = messages.find((message) => message.id === messageId);
            if (byId) return byId;
        }
        if (messageIndex >= 0 && messageIndex < messages.length) {
            return messages[messageIndex];
        }
        return null;
    };

    const setAudioStatus = (messageId: string, status: Message['audioStatus']) => {
        messages = messages.map((message) =>
            message.id === messageId ? { ...message, audioStatus: status } : message
        );
        persistActiveChatMessages({ updateTimestamp: false });
    };

    const playAudioSource = async (source: AudioSource, messageId: string) => {
        if (activeAudioFinalize) {
            activeAudioFinalize();
        } else {
            cleanupActiveAudio();
            void stopMouthTracking();
        }

        setAudioStatus(messageId, 'loading');

        const audio = new Audio();
        audio.preload = 'auto';

        let revokeUrl: (() => void) | null = null;
        if (source.kind === 'blob') {
            const playbackUrl = URL.createObjectURL(source.blob);
            revokeUrl = () => URL.revokeObjectURL(playbackUrl);
            audio.src = playbackUrl;
        } else if (source.kind === 'buffer') {
            const playbackBlob = new Blob([source.buffer], { type: source.mimeType });
            const playbackUrl = URL.createObjectURL(playbackBlob);
            revokeUrl = () => URL.revokeObjectURL(playbackUrl);
            audio.src = playbackUrl;
        } else {
            audio.src = source.dataUrl;
        }

        let notified = false;
        let finalized = false;

        const clearPlaybackUrl = () => {
            if (revokeUrl) {
                try {
                    revokeUrl();
                } catch (err) {
                    console.warn('Failed to revoke audio URL', err);
                }
                revokeUrl = null;
            }
        };

        const finalize = (notification?: { title: string; description: string }) => {
            if (finalized) return;
            finalized = true;

            audio.removeEventListener('error', handleDecodeError);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('pause', handlePause);

            clearPlaybackUrl();

            if (!audio.paused) {
                try {
                    audio.pause();
                } catch (err) {
                    console.warn('Audio pause failed', err);
                }
            }
            audio.src = '';

            if (activeAudioCleanup) {
                try {
                    activeAudioCleanup();
                } catch (err) {
                    console.warn('cleanupActiveAudio cleanup failed', err);
                }
                activeAudioCleanup = null;
            }

            if (activeAudio === audio) {
                activeAudio = null;
                activeAudioMessageId = null;
            }

            activeAudioFinalize = null;

            setAudioStatus(messageId, 'idle');

            void stopMouthTracking();

            if (notification && !notified) {
                notified = true;
                notifyApiError(notification.title, notification.description);
            }
        };

        const handleDecodeError = () => {
            finalize({ title: 'Playback failed', description: 'Unable to play generated audio.' });
        };

        const handleEnded = () => finalize();
        const handlePause = () => {
            if (!audio.ended) {
                finalize();
            }
        };

        audio.addEventListener('ended', handleEnded, { once: true });
        audio.addEventListener('pause', handlePause);

        activeAudio = audio;
        activeAudioMessageId = messageId;
        activeAudioCleanup = clearPlaybackUrl;
        activeAudioFinalize = finalize;

        try {
            audio.load();
            await waitForAudioReady(audio);
        } catch (prepareError) {
            finalize({
                title: 'Playback failed',
                description:
                    prepareError instanceof Error
                        ? prepareError.message
                        : 'Unable to decode generated audio.'
            });
            console.error('Audio preparation failed', prepareError);
            return;
        }

        audio.addEventListener('error', handleDecodeError, { once: true });

        try {
            await trackMouthFromAudio(audio);
        } catch (trackingError) {
            console.warn('Audio mouth tracking failed', trackingError);
        }

        try {
            await audio.play();
            setAudioStatus(messageId, 'playing');
        } catch (playError) {
            if (playError instanceof DOMException && playError.name === 'NotAllowedError') {
                finalize({
                    title: 'Playback blocked',
                    description: 'Click the speaker icon on the message to listen.'
                });
                return;
            }

            const playbackMessage =
                playError instanceof Error ? playError.message : 'Unable to play audio.';
            finalize({ title: 'Playback failed', description: playbackMessage });
            console.error('Audio playback failed', playError);
        }
    };

    const replayMessageAudio = async (messageId: string | undefined, messageIndex: number) => {
        const target = findMessageForAudio(messageId, messageIndex);
        if (!target || !target.audio?.dataUrl) {
            notifyApiError('Playback unavailable', 'No audio found for this message.');
            return;
        }

        try {
            const { buffer, mimeType } = dataUrlToBuffer(target.audio.dataUrl);
            if (typeof Blob !== 'undefined') {
                const blob = new Blob([buffer], { type: mimeType });
                await playAudioSource({ kind: 'blob', blob }, target.id);
            } else {
                await playAudioSource({ kind: 'buffer', buffer, mimeType }, target.id);
            }
        } catch (convertError) {
            console.error('Failed to decode audio for playback', convertError);
            notifyApiError('Playback failed', 'Unable to decode saved audio.');
        }
    };

    const stopMessageAudio = (messageId: string | undefined) => {
        if (!messageId) return;

        if (activeAudioFinalize && activeAudioMessageId === messageId) {
            activeAudioFinalize();
        } else {
            setAudioStatus(messageId, 'idle');
        }
    };

    async function generateAudioForMessage(
        messageId: string | undefined,
        messageIndex = -1,
        options?: { autoplay?: boolean; notifyOnSkip?: boolean }
    ) {
        const target = findMessageForAudio(messageId, messageIndex);
        if (!target) {
            if (options?.notifyOnSkip) {
                notifyApiError('Text-to-speech unavailable', 'Unable to locate that message.');
            } else {
                console.warn('Skipping TTS: message not found');
            }
            return;
        }

        if (target.audio?.dataUrl) {
            if (options?.notifyOnSkip) {
                notifyApiError('Text-to-speech ready', 'Audio already generated for this response.');
            }
            return;
        }

        if (target.audioStatus === 'loading') {
            if (options?.notifyOnSkip) {
                notifyApiError('Text-to-speech pending', 'Audio is currently being prepared.');
            }
            return;
        }

        const configuredVoiceId = currentModel?.voiceId ?? DEFAULT_TTS_VOICE_ID;
        const voiceId = configuredVoiceId?.trim();

        if (!voiceId) {
            if (options?.notifyOnSkip) {
                notifyApiError(
                    'Text-to-speech unavailable',
                    'Assign a voice to this model in the Live2D manager.'
                );
            } else {
                console.warn('Skipping TTS: no voice configured');
            }
            return;
        }

        const speakableText = stripThinkingTags(target.text ?? target.raw ?? '').trim();
        if (!speakableText) {
            if (options?.notifyOnSkip) {
                notifyApiError('Text-to-speech unavailable', 'This response has no speakable text.');
            } else {
                console.warn('Skipping TTS: no speakable text');
            }
            return;
        }

        setAudioStatus(target.id, 'loading');

        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: speakableText, voiceId })
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                console.error('TTS error', res.status, payload);
                notifyApiError('Text-to-speech failed', payload?.error ?? 'Unable to generate speech');
                setAudioStatus(target.id, 'idle');
                return;
            }

            const arrayBuffer = await res.arrayBuffer();
            if (!arrayBuffer.byteLength) {
                console.warn('TTS response was empty');
                notifyApiError('Text-to-speech failed', 'Generated audio was empty.');
                setAudioStatus(target.id, 'idle');
                return;
            }

            const headerType = res.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
            const mimeType = headerType && headerType.startsWith('audio/') ? headerType : 'audio/mpeg';

            let audioData: { dataUrl: string; blob: Blob | null };
            try {
                audioData = await arrayBufferToDataUrl(arrayBuffer, mimeType);
            } catch (encodeError) {
                console.error('Failed to encode audio for storage', encodeError);
                notifyApiError('Text-to-speech failed', 'Unable to cache generated audio.');
                setAudioStatus(target.id, 'idle');
                return;
            }

            const audioPayload: MessageAudioPayload = {
                dataUrl: audioData.dataUrl,
                mimeType,
                voiceId,
                createdAt: Date.now(),
                size: arrayBuffer.byteLength
            };
            updateMessageAudio(target.id, audioPayload);

            if (options?.autoplay === false) {
                setAudioStatus(target.id, 'idle');
                return;
            }

            if (audioData.blob) {
                await playAudioSource({ kind: 'blob', blob: audioData.blob }, target.id);
            } else {
                await playAudioSource({ kind: 'buffer', buffer: arrayBuffer, mimeType }, target.id);
            }
        } catch (e) {
            const messageError = e instanceof Error ? e.message : 'Unable to generate speech';
            notifyApiError('Text-to-speech failed', messageError);
            console.error('generateAudioForMessage failed', e);
            setAudioStatus(target.id, 'idle');
        }
    }

    onMount(() => {
        isPreviewDrawerOpen = false;

        if (typeof window !== 'undefined' && window.innerWidth <= 800) {
            isCollapsed = true;
        }

        if (desktopMedia) {
            const listener = (event: MediaQueryListEvent) => {
                isDesktop = event.matches;
            };

            if (typeof desktopMedia.addEventListener === 'function') {
                desktopMedia.addEventListener('change', listener);
                cleanupDesktopMedia = () => desktopMedia?.removeEventListener('change', listener);
            } else if (typeof desktopMedia.addListener === 'function') {
                desktopMedia.addListener(listener);
                cleanupDesktopMedia = () => desktopMedia?.removeListener(listener);
            }

            isDesktop = desktopMedia.matches;
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
                        const initialMessages = sanitizeMessagesForStore([]);
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

    onDestroy(() => {
        cleanupDesktopMedia?.();
        cleanupDesktopMedia = null;
        cleanupActiveAudio();
        void stopMouthTracking();
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
    $: activeMobileModel = modelPreviewState.current ?? modelPreviewState.models[modelPreviewState.index] ?? null;
    $: mobilePreviewConfig = !isDesktop && activeMobileModel
        ? {
              modelPath: activeMobileModel.modelPath,
              cubismCorePath: activeMobileModel.cubismCorePath,
              anchor: activeMobileModel.anchor,
              position: activeMobileModel.position,
              scaleMultiplier: activeMobileModel.scaleMultiplier,
              targetHeightRatio: activeMobileModel.targetHeightRatio,
              storage: activeMobileModel.storage,
              localModelId: activeMobileModel.storage === 'local' ? activeMobileModel.id : null
          }
        : null;
    $: if (!mobilePreviewConfig) {
        mobilePreviewLoading = false;
    }
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
    $: toolSupportOverrideForSelection = selectedProviderId && selectedModel
        ? toolSupportOverrides[selectedProviderId]?.[selectedModel]
        : undefined;
    $: sfuToolsChecking = Boolean(
        selectedProviderId && selectedModel
            ? toolSupportLoading[selectedProviderId]?.[selectedModel]
            : false
    );
    $: sfuToolsEnabled = selectedModel
        ? typeof toolSupportOverrideForSelection === 'boolean'
            ? toolSupportOverrideForSelection
            : modelSupportsSfuTools(currentProvider, selectedModel, toolSupportOverrides)
        : null;
    $: imageSupportEnabled = selectedModel ? modelSupportsImages(currentProvider, selectedModel) : null;
    $: if (selectedProviderId && selectedModel) {
        void ensureToolSupportStatus(selectedProviderId, selectedModel);
    }
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
            <span class="text-lg font-semibold text-surface-50">NIAMON</span>
        </div>
    </div>
{/snippet}

{#snippet appBarTrail()}
    <div class="flex items-center gap-2">
        <div class="hidden sm:block">
            <ThemeSwitcher />
        </div>
        <button
            type="button"
            class="btn btn-icon btn-icon-base border border-surface-800/50 bg-surface-950/60 text-base text-surface-200 shadow-lg shadow-surface-950/20 transition hover:text-surface-50 sm:hidden"
            on:click={cycleTheme}
            aria-label="Cycle theme"
        >
            🎨
        </button>
        <button
            type="button"
            class="btn btn-icon btn-icon-base border border-surface-800/50 bg-surface-950/60 text-base text-surface-200 shadow-lg shadow-surface-950/20 transition hover:text-surface-50 lg:hidden"
            on:click={startNewChat}
            aria-label="Start new chat"
        >
            ＋
        </button>
        <button
            type="button"
            class="btn btn-icon btn-icon-base border border-surface-800/50 bg-surface-950/60 text-base text-surface-200 shadow-lg shadow-surface-950/20 transition hover:text-surface-50 xl:hidden"
            on:click={openPreviewDrawer}
            aria-label="Configure Live2D model"
        >
            ⚙
        </button>
    </div>
{/snippet}

<div class="flex h-screen min-h-0 flex-col overflow-hidden bg-gradient-to-br from-surface-950 via-surface-950/95 to-surface-900 text-surface-50">
    <AppBar
        lead={appBarLead}
        trail={appBarTrail}
        background="bg-surface-950/70"
        border="border-b border-surface-800/50"
        shadow="shadow-lg shadow-surface-950/30"
        padding="px-3 py-2 sm:px-4 sm:py-3 lg:px-8 lg:py-4"
        classes="sticky top-0 z-40 backdrop-blur-xl"
    >
        <p class="hidden text-sm text-surface-400 sm:block">Harness your favourite models, orchestrate study plans, and learn faster.</p>
    </AppBar>

    <div class="relative flex flex-1 overflow-hidden gap-3 p-3 sm:gap-4 sm:p-4">
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
            {isPersistingSettings}
            {settingsPersistError}
            {chats}
            {activeChatId}
            {pendingChatIds}
            on:newChat={startNewChat}
            on:selectChat={({ detail }) => setActiveChat(detail)}
            on:renameChat={({ detail }) => renameChat(detail.id, detail.title)}
            on:deleteChat={({ detail }) => deleteChat(detail)}
            on:openSettings={openLlmSettings}
        />

        <main class="relative z-10 flex-1 overflow-hidden min-h-0">
            <div class="flex h-full w-full flex-col gap-4 min-h-0">
                <div class="flex flex-1 flex-col gap-4 min-h-0 xl:flex-row xl:items-stretch">
                    <section class="relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-3xl border border-surface-800/60 bg-surface-950/90 shadow-2xl shadow-surface-950/30 xl:flex-1">
                        <div class="relative flex flex-1 min-h-0">
                            {#if mobilePreviewConfig}
                                <div class="pointer-events-none absolute inset-0 overflow-hidden opacity-40 xl:hidden">
                                    <Live2DPreview
                                        config={mobilePreviewConfig}
                                        bind:loading={mobilePreviewLoading}
                                        bind:expressions={expressionOptions}
                                    />
                                    {#if mobilePreviewLoading}
                                        <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface-950/40">
                                            <div class="h-9 w-9 animate-spin rounded-full border-2 border-primary-400/80 border-t-transparent" aria-hidden="true"></div>
                                            <span class="sr-only">Loading model preview…</span>
                                        </div>
                                    {/if}
                                    <div class="absolute inset-0 bg-gradient-to-b from-surface-950/40 via-surface-950/10 to-surface-950/80"></div>
                                </div>
                            {/if}
                            <div class="relative flex flex-1">
                                <ChatMessages
                                    {messages}
                                    on:thinkingToggle={handleMessageThinkingToggle}
                                    on:playAudio={handleMessageAudioPlay}
                                    on:stopAudio={handleMessageAudioStop}
                                    on:generateAudio={handleMessageAudioGenerate}
                                />
                            </div>
                        </div>

                        <div class="border-t border-surface-800/50 bg-surface-950/95 p-3 sm:p-4">
                            <div class="flex flex-col gap-4">
                                <ChatProviderControls
                                    providerState={providerSelectionState}
                                    modelState={modelSelectionState}
                                    sfuToolsEnabled={sfuToolsEnabled}
                                    imageSupportEnabled={imageSupportEnabled}
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
                                <ChatInput
                                    bind:value={input}
                                    {isSending}
                                    attachments={pendingAttachments}
                                    isDisabled={isModelsLoading || !selectedModel}
                                    on:send={sendMessage}
                                    on:cancel={cancelGeneration}
                                    on:openSettings={openPromptSettings}
                                    on:attachmentsAdd={handleAttachmentsAdd}
                                    on:attachmentRemove={handleAttachmentRemove}
                                    on:attachmentError={handleAttachmentError}
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

                    <aside class="hidden h-full flex-col xl:flex xl:w-[420px] 2xl:w-[480px]">
                        <div class="mb-4 flex flex-col gap-2">
                            <button
                                type="button"
                                class="btn btn-base border border-primary-500/50 bg-primary-500/15 text-sm font-semibold text-[color:var(--color-primary-contrast-500)] shadow-lg shadow-primary-500/20 transition hover:bg-primary-500/25"
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
                        <ModelPreviewPanel
                            state={modelPreviewState}
                            bind:expressionOptions
                            bind:selectedExpression
                            autoGenerateAudio={autoGenerateAudio}
                            on:autoGenerateAudioChange={({ detail }) => updateAutoGenerateAudio(detail)}
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
                <div class="relative z-10 mt-auto pb-6">
                    <div class="relative mx-auto max-h-[80vh] w-full max-w-lg overflow-hidden">
                        <div class="flex max-h-[80vh] min-h-[360px] flex-col overflow-y-auto rounded-3xl">
                            <div class="flex-1 min-h-0">
                                <ModelPreviewPanel
                                    state={modelPreviewState}
                                    bind:expressionOptions
                                    bind:selectedExpression
                                    autoGenerateAudio={autoGenerateAudio}
                                    on:autoGenerateAudioChange={({ detail }) => updateAutoGenerateAudio(detail)}
                                    on:prev={prevModel}
                                    on:next={nextModel}
                                    on:confirm={({ detail }) => {
                                        selectModel(detail ?? previewIndex);
                                        closePreviewDrawer();
                                    }}
                                />
                            </div>
                            <div class="mt-4 flex flex-shrink-0 flex-col gap-2 px-5 pb-2">
                                <button
                                    type="button"
                                    class="btn btn-base border border-primary-500/50 bg-primary-500/15 text-sm font-semibold text-[color:var(--color-primary-contrast-500)] shadow-lg shadow-primary-500/20 transition hover:bg-primary-500/25"
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

<LlmSettingsModal
    open={isLlmSettingsOpen}
    on:close={closeLlmSettings}
/>

<PromptSettingsModal
    open={isPromptSettingsOpen}
    systemPrompt={systemPrompt}
    options={generationOptions}
    on:close={closePromptSettings}
    on:systemPromptChange={({ detail }) => updateSystemPrompt(detail)}
    on:optionsChange={({ detail }) => updateGenerationOptions(detail)}
/>
