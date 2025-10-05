<script lang="ts">
  import type { ChatMessagePayload } from '$lib/llm/client';
  import { markdownToHtml } from '$lib/utils/markdown';
  import { afterUpdate, createEventDispatcher, onMount, tick } from 'svelte';

  interface ChatDisplayMessage extends ChatMessagePayload {
    id?: string;
    raw?: string;
    thinking?: string | null;
    thinkingBlocks?: string[];
    hasThinking?: boolean;
    thinkingOpen?: boolean;
    thinkingOpenStates?: boolean[];
    streaming?: boolean;
    audio?: {
      dataUrl: string;
      mimeType?: string;
      voiceId?: string;
      createdAt?: number;
    } | null;
    audioStatus?: 'idle' | 'loading' | 'playing';
  }

  type ThinkingTogglePayload = {
    messageId?: string;
    messageIndex: number;
    blockIndex: number;
    open: boolean;
  };

  type AudioPlayPayload = {
    messageId?: string;
    messageIndex: number;
  };

  type AudioStopPayload = {
    messageId?: string;
    messageIndex: number;
  };

  const dispatch = createEventDispatcher<{
    thinkingToggle: ThinkingTogglePayload;
    playAudio: AudioPlayPayload;
    stopAudio: AudioStopPayload;
  }>();

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

  const computeThinkingBlocks = (message: ChatDisplayMessage): string[] => {
    if (Array.isArray(message.thinkingBlocks) && message.thinkingBlocks.length) {
      return message.thinkingBlocks;
    }
    if (typeof message.thinking === 'string' && message.thinking.trim()) {
      return [message.thinking.trim()];
    }
    return [];
  };

  const computeOpenStates = (message: ChatDisplayMessage, blocks: string[]): boolean[] => {
    if (!blocks.length) return [];
    const states = Array.isArray(message.thinkingOpenStates) ? message.thinkingOpenStates : [];
    return blocks.map((_, index) => {
      if (index < states.length) return Boolean(states[index]);
      if (index === 0 && typeof message.thinkingOpen === 'boolean') return Boolean(message.thinkingOpen);
      return false;
    });
  };

  interface RenderedMessage {
    message: ChatDisplayMessage;
    visibleContent: string;
    renderedHtml: string;
    thinkingBlocks: string[];
    openStates: boolean[];
  }

  $: renderedMessages = messages.map<RenderedMessage>((message) => {
    const content = visibleText(message);
    const thinkingBlocks = computeThinkingBlocks(message);
    return {
      message,
      visibleContent: content,
      renderedHtml: content ? markdownToHtml(content) : '',
      thinkingBlocks,
      openStates: computeOpenStates(message, thinkingBlocks)
    };
  });

  let container: HTMLDivElement | null = null;
  let stickToBottom = true;
  const SCROLL_THRESHOLD = 24;

  const isNearBottom = () => {
    const el = container;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= SCROLL_THRESHOLD;
  };

  const scrollToBottom = () => {
    const el = container;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const handleScroll = () => {
    stickToBottom = isNearBottom();
  };

  const handleThinkingToggle = (
    message: ChatDisplayMessage,
    messageIndex: number,
    blockIndex: number,
    event: Event
  ) => {
    const target = event.currentTarget as HTMLDetailsElement;
    dispatch('thinkingToggle', {
      messageId: message.id,
      messageIndex,
      blockIndex,
      open: target.open
    });
  };

  const handleAudioPlay = (message: ChatDisplayMessage, messageIndex: number) => {
    dispatch('playAudio', {
      messageId: message.id,
      messageIndex
    });
  };

  const handleAudioStop = (message: ChatDisplayMessage, messageIndex: number) => {
    dispatch('stopAudio', {
      messageId: message.id,
      messageIndex
    });
  };

  const audioDownloadName = (message: ChatDisplayMessage, index: number): string => {
    const suffix = message.id ? message.id.slice(0, 8) : `msg-${index}`;
    const mime = message.audio?.mimeType ?? 'audio/mpeg';
    let extension = 'mp3';
    if (mime.includes('wav')) extension = 'wav';
    else if (mime.includes('ogg')) extension = 'ogg';
    else if (mime.includes('aac')) extension = 'aac';
    return `stormhacks-response-${suffix}.${extension}`;
  };

  onMount(async () => {
    await tick();
    scrollToBottom();
  });

  afterUpdate(() => {
    if (stickToBottom) {
      scrollToBottom();
    }
  });
</script>

<div
  class="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto p-4"
  bind:this={container}
  on:scroll={handleScroll}
>
	{#each renderedMessages as item, index (item.message.id ?? index)}
        <div
            class={
                `inline-flex max-w-full flex-col gap-4 rounded-2xl px-4 py-4 text-sm leading-relaxed shadow-sm ${
                    item.message.sender === 'bot'
                        ? 'bg-surface-900/80 text-surface-50 shadow-surface-950/40'
                        : 'ml-auto bg-primary-500 text-[color:var(--color-primary-contrast-500)] shadow-primary-500/30'
             }`
            }
        >
			{#if item.message.sender === 'bot' && item.thinkingBlocks.length}
				{#each item.thinkingBlocks as block, blockIndex}
					<details
						class="group rounded-xl border border-surface-800/50 bg-surface-900/70 px-5 py-5 text-[13px] leading-relaxed text-surface-300"
						open={item.openStates[blockIndex] ?? false}
						on:toggle={(event) => handleThinkingToggle(item.message, index, blockIndex, event)}
					>
						<summary class="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-surface-400/80">
							Thinking{item.thinkingBlocks.length > 1 ? ` (${blockIndex + 1})` : ''}
						</summary>
						<pre class="mt-4 whitespace-pre-wrap text-surface-200/90">{block}</pre>
					</details>
				{/each}
			{/if}
			{#if item.visibleContent}
				<div class="prose prose-invert prose-p:my-1 prose-pre:bg-surface-800/70 prose-pre:text-[13px] prose-pre:leading-relaxed prose-pre:p-3 prose-pre:rounded-lg max-w-none text-sm leading-relaxed">
					{@html item.renderedHtml}
				</div>
			{:else if !item.message.streaming}
				<div class="text-xs italic text-surface-400">Model returned no visible response.</div>
			{/if}
			{#if item.message.streaming && !item.visibleContent}
				<div class="flex items-center gap-1 text-surface-400">
					<span class="h-6 w-2 animate-pulse rounded-full bg-primary-300"></span>
					<span class="h-4 w-2 animate-pulse rounded-full bg-primary-200" style="animation-delay: 120ms"></span>
					<span class="h-4 w-2 animate-pulse rounded-full bg-primary-100" style="animation-delay: 240ms"></span>
				</div>
			{/if}
			{#if item.message.sender === 'bot' && item.message.audio?.dataUrl}
				<div class="flex flex-col items-end gap-2">
					{#if item.message.audioStatus === 'loading'}
						<div class="flex items-center gap-2 text-xs text-surface-400">
							<span class="h-3 w-3 animate-spin rounded-full border border-surface-600 border-t-primary-400"></span>
							<span>Preparing audio…</span>
						</div>
					{/if}
					<div class="flex justify-end gap-2">
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-full border border-surface-700/60 bg-surface-900/60 px-3 py-1 text-xs font-medium text-surface-200 transition hover:border-primary-400 hover:text-primary-200 disabled:opacity-60 disabled:cursor-not-allowed"
							on:click={() => handleAudioPlay(item.message, index)}
							aria-label="Play response audio"
							disabled={item.message.audioStatus === 'loading'}
						>
							<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M5 10v4h2l3 3V7L7 10H5zm9.14-3.17a1 1 0 0 1 1.37.36A6.98 6.98 0 0 1 17 12a6.98 6.98 0 0 1-1.49 4.81 1 1 0 0 1-1.73-1.01A4.98 4.98 0 0 0 15 12a4.97 4.97 0 0 0-.78-2.68 1 1 0 0 1 .08-1.49l.84-.83z" />
								<path d="M16.55 5.55a1 1 0 1 1 1.41-1.42A9 9 0 0 1 20 12a9 9 0 0 1-2.04 5.87 1 1 0 1 1-1.58-1.23A7 7 0 0 0 18 12a7 7 0 0 0-1.45-4.32l-.01-.01-.01-.01z" />
							</svg>
							<span>{item.message.audioStatus === 'playing' ? 'Replay' : 'Play'}</span>
						</button>
						{#if item.message.audioStatus === 'playing'}
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded-full border border-surface-700/60 bg-surface-900/60 px-3 py-1 text-xs font-medium text-surface-200 transition hover:border-error-400 hover:text-error-200"
								on:click={() => handleAudioStop(item.message, index)}
								aria-label="Stop audio playback"
							>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path d="M6 6h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
								</svg>
								<span>Stop</span>
							</button>
						{/if}
						<a
							href={item.message.audio.dataUrl}
							download={audioDownloadName(item.message, index)}
							class="inline-flex items-center gap-2 rounded-full border border-surface-700/60 bg-surface-900/60 px-3 py-1 text-xs font-medium text-surface-200 transition hover:border-primary-400 hover:text-primary-200"
							aria-label="Download response audio"
						>
							<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M12 3a1 1 0 0 1 1 1v9.59l1.3-1.3a1 1 0 1 1 1.4 1.42l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1z" />
								<path d="M5 15a1 1 0 0 1 1 1v2h12v-2a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" />
							</svg>
							<span>Download</span>
						</a>
					</div>
				</div>
			{/if}
		</div>
	{/each}
</div>
