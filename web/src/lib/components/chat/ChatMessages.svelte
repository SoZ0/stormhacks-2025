<script lang="ts">
  import type { ChatMessagePayload } from '$lib/llm/client';

  interface ChatDisplayMessage extends ChatMessagePayload {
    id?: string;
    raw?: string;
    thinking?: string | null;
    hasThinking?: boolean;
    thinkingOpen?: boolean;
    streaming?: boolean;
  }

  export let messages: ChatDisplayMessage[] = [];

  const stripThinkingTags = (value: string) => value.replace(/<\/?think>/gi, '').trim();

  const visibleText = (message: ChatDisplayMessage): string => {
    const text = message.text?.trim();
    if (text) return message.text ?? '';

    if (message.hasThinking) {
      return '';
    }

    const raw = message.raw?.trim();
    if (!raw) return '';

    return stripThinkingTags(raw);
  };
</script>

<div class="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto p-4">
	{#each messages as msg, index (msg.id ?? index)}
        <div
            class={
                `inline-flex max-w-full flex-col gap-4 rounded-2xl px-4 py-4 text-sm leading-relaxed shadow-sm ${
                    msg.sender === 'bot'
                        ? 'bg-surface-900/80 text-surface-50 shadow-surface-950/40'
                        : 'ml-auto bg-primary-500 text-[color:var(--color-primary-contrast-500)] shadow-primary-500/30'
             }`
            }
        >
			{#if msg.sender === 'bot' && msg.hasThinking && msg.thinking}
				<details
					class="group rounded-xl border border-surface-800/50 bg-surface-900/70 px-5 py-5 text-[13px] leading-relaxed text-surface-300"
					bind:open={msg.thinkingOpen}
				>
					<summary class="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-surface-400/80">
						Thinking
					</summary>
					<pre class="mt-4 whitespace-pre-wrap text-surface-200/90">{msg.thinking}</pre>
				</details>
			{/if}
			{#if visibleText(msg)}
				<div class="whitespace-pre-wrap break-words text-sm leading-relaxed">
					{visibleText(msg)}
				</div>
			{:else if !msg.streaming}
				<div class="text-xs italic text-surface-400">Model returned no visible response.</div>
			{/if}
			{#if msg.streaming && !visibleText(msg)}
				<div class="flex items-center gap-1 text-surface-400">
					<span class="h-6 w-2 animate-pulse rounded-full bg-primary-300"></span>
					<span class="h-4 w-2 animate-pulse rounded-full bg-primary-200" style="animation-delay: 120ms"></span>
					<span class="h-4 w-2 animate-pulse rounded-full bg-primary-100" style="animation-delay: 240ms"></span>
				</div>
			{/if}
		</div>
	{/each}
</div>
