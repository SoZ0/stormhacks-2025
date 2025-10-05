<script lang="ts">
    import { createEventDispatcher, tick } from 'svelte';
    import { fly } from 'svelte/transition';

    interface ChatSummary {
        id: string;
        title: string;
        createdAt: number;
        updatedAt: number;
    }

    export let chats: ChatSummary[] = [];
    export let activeChatId = '';
    export let pendingChatIds: string[] = [];
    export let isCollapsed = false;
    export let settingsHref = '#';
    export let isPersistingSettings = false;
    export let settingsPersistError: string | null = null;

    const dispatch = createEventDispatcher<{
        newChat: void;
        selectChat: string;
        renameChat: { id: string; title: string };
        deleteChat: string;
    }>();

    let editingChatId: string | null = null;
    let draftTitle = '';
    let renameInput: HTMLInputElement | null = null;

    const handleNewChat = () => {
        dispatch('newChat');
        cancelRename();
    };

    const handleSelect = (id: string) => {
        if (editingChatId) {
            cancelRename();
        }
        dispatch('selectChat', id);
    };

    const beginRename = async (chat: ChatSummary) => {
        editingChatId = chat.id;
        draftTitle = chat.title;
        await tick();
        renameInput?.focus();
        renameInput?.select();
    };

    const commitRename = (id: string) => {
        const trimmed = draftTitle.trim();
        dispatch('renameChat', { id, title: trimmed });
        cancelRename();
    };

    const cancelRename = () => {
        editingChatId = null;
        draftTitle = '';
        renameInput = null;
    };

    const handleRenameKey = (event: KeyboardEvent, id: string) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitRename(id);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelRename();
        }
    };

    const handleRenameBlur = (event: FocusEvent, id: string) => {
        const next = event.relatedTarget as HTMLElement | null;
        if (next && next.dataset && next.dataset.renameAction) {
            return;
        }
        commitRename(id);
    };

    const handleDelete = (id: string) => {
        dispatch('deleteChat', id);
        if (editingChatId === id) {
            cancelRename();
        }
    };

    const formatUpdatedAt = (value: number): string => {
        const timestamp = Number(value);
        if (!Number.isFinite(timestamp)) return '';
        const diff = Date.now() - timestamp;

        if (diff < 60_000) return 'just now';
        if (diff < 3_600_000) {
            const minutes = Math.round(diff / 60_000);
            return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
        }
        if (diff < 86_400_000) {
            const hours = Math.round(diff / 3_600_000);
            return `${hours} hr${hours === 1 ? '' : 's'} ago`;
        }

        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const isPending = (id: string) => pendingChatIds.includes(id);
</script>

<aside
    class={`fixed inset-y-0 left-0 z-30 h-full w-72 max-w-[80vw] transition-transform duration-300 ${
        isCollapsed ? '-translate-x-full lg:translate-x-0' : 'translate-x-0'
    } lg:static lg:w-72 xl:w-80`}
    aria-hidden={isCollapsed}
    transition:fly|local={{ x: -200, duration: 200 }}
>
    <div class="flex h-full flex-col gap-6 overflow-hidden rounded-r-3xl border border-surface-800/40 bg-surface-950/80 p-4">
        <div class="flex flex-col gap-4">
            <button
                type="button"
                class="btn btn-base preset-filled-primary-500 text-[color:var(--color-primary-contrast-500)] shadow-lg shadow-primary-500/20"
                on:click={handleNewChat}
            >
                <span class="text-sm font-semibold tracking-wide">New Chat</span>
            </button>
            <h3 class="text-xs font-semibold uppercase tracking-wide text-surface-400">Chats</h3>
        </div>

        <div class="flex-1 overflow-y-auto pr-1">
            {#if chats.length === 0}
                <div class="flex h-full items-center justify-center rounded-2xl border border-dashed border-surface-800/50 bg-surface-950/60 p-6 text-center text-sm text-surface-400">
                    <button
                        type="button"
                        class="rounded-xl border border-primary-500/40 bg-primary-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-200 transition hover:border-primary-500/60 hover:text-primary-100"
                        on:click={handleNewChat}
                    >
                        Start a conversation
                    </button>
                </div>
            {:else}
                <div class="flex flex-col gap-2">
                    {#each chats as chat (chat.id)}
                        <div
                            class={`group flex min-w-0 items-start gap-3 rounded-2xl border p-3 transition ${
                                chat.id === activeChatId
                                    ? 'border-primary-500/70 bg-primary-500/10'
                                    : 'border-surface-800/50 bg-surface-950/60 hover:border-surface-700/60 hover:bg-surface-900/60'
                            }`}
                        >
                            {#if editingChatId === chat.id}
                                <div class="flex w-full flex-col gap-2">
                                    <input
                                        class="w-full rounded-xl border border-surface-700/60 bg-surface-900/80 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:border-primary-500 focus:outline-none"
                                        bind:this={renameInput}
                                        bind:value={draftTitle}
                                        placeholder="Chat name"
                                        on:keydown={(event) => handleRenameKey(event, chat.id)}
                                        on:blur={(event) => handleRenameBlur(event, chat.id)}
                                    />
                                    <div class="flex justify-end gap-2 text-[11px] uppercase tracking-wide">
                                        <button
                                            type="button"
                                            data-rename-action="save"
                                            class="rounded-lg border border-primary-500/40 bg-primary-500/20 px-3 py-1 font-semibold text-primary-100 transition hover:border-primary-500/80 hover:bg-primary-500/30"
                                            on:click={() => commitRename(chat.id)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            data-rename-action="cancel"
                                            class="rounded-lg border border-surface-700/50 bg-surface-900/70 px-3 py-1 font-semibold text-surface-300 transition hover:border-surface-600/60 hover:text-surface-100"
                                            on:click={cancelRename}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            {:else}
                                <button
                                    type="button"
                                    class="flex-1 min-w-0 text-left"
                                    on:click={() => handleSelect(chat.id)}
                                >
                                    <div class="flex items-center gap-2">
                                        <div
                                            class={`truncate text-sm font-semibold text-surface-50 ${
                                                isPending(chat.id) ? 'text-primary-100' : ''
                                            }`}
                                            title={chat.title}
                                        >
                                            {chat.title}
                                        </div>
                                        {#if isPending(chat.id)}
                                            <span class="flex flex-none items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary-200">
                                                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-300"></span>
                                                Live
                                            </span>
                                        {/if}
                                    </div>
                                    {#if formatUpdatedAt(chat.updatedAt)}
                                        <div class="text-xs text-surface-500">
                                            {formatUpdatedAt(chat.updatedAt)}
                                        </div>
                                    {/if}
                                </button>
                                <div class="flex flex-none items-center gap-2">
                                    <button
                                        type="button"
                                        class="rounded-lg border border-surface-700/60 bg-surface-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-surface-300 transition hover:border-surface-600/60 hover:text-surface-100"
                                        on:click={() => beginRename(chat)}
                                    >
                                        Rename
                                    </button>
                                    <button
                                        type="button"
                                        class="rounded-lg border border-error-500/50 bg-error-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-error-100 transition hover:border-error-400 hover:bg-error-500/30"
                                        on:click={() => handleDelete(chat.id)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="flex flex-col gap-3 text-xs text-surface-400">
            <a
                href={settingsHref}
                class="font-semibold text-primary-300 transition hover:text-primary-200"
            >
                Open LLM settings
            </a>
            {#if isPersistingSettings}
                <span class="text-[color:var(--color-surface-300)]">Saving…</span>
            {:else if settingsPersistError}
                <span class="text-error-300">{settingsPersistError}</span>
            {/if}
        </div>
    </div>
</aside>
