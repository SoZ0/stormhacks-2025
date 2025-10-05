<script lang="ts">
    import { availableThemes, theme } from '$lib/stores/theme';
    import type { ThemeId } from '$lib/stores/theme';

    export let className = '';

    const themeOptions = availableThemes;

    const handleSelect = (id: ThemeId) => {
        theme.set(id);
    };
</script>

<div
    class={`flex items-center gap-2 rounded-xl border border-surface-800/60 bg-surface-950/60 px-3 py-1.5 shadow-lg shadow-surface-950/20 ${className}`.trim()}
>
    <span class="text-[10px] font-semibold uppercase tracking-[0.32em] text-surface-400">Theme</span>
    <div class="flex items-center gap-1.5">
        {#each themeOptions as option}
            <button
                type="button"
                class={`flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                    $theme === option.id
                        ? 'bg-primary-500/20 text-primary-100 shadow-inner shadow-primary-500/20'
                        : 'bg-transparent text-surface-300 hover:text-surface-100'
                }`}
                aria-pressed={$theme === option.id}
                on:click={() => handleSelect(option.id)}
            >
                {#if option.accent}
                    <span
                        class={`inline-block h-2.5 w-2.5 rounded-full ${
                            $theme === option.id ? 'ring-2 ring-primary-400/80 ring-offset-2 ring-offset-surface-950/80' : ''
                        }`}
                        style={`background: ${option.accent}`}
                        aria-hidden="true"
                    ></span>
                {/if}
                <span>{option.label}</span>
            </button>
        {/each}
    </div>
</div>
