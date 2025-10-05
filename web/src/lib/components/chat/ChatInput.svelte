<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { ThinkingMode, ThinkingModeOption } from '$lib/chat/types';

  declare global {
    interface Window {
      SpeechRecognition?: typeof SpeechRecognition;
      webkitSpeechRecognition?: typeof SpeechRecognition;
    }
  }

  export let value = '';
  export let isSending = false;
  export let isDisabled = false;
  export let thinkingMode: ThinkingMode = 'auto';
  const DEFAULT_THINKING_MODE_OPTIONS: ThinkingModeOption[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'expanded', label: 'Expanded' },
    { value: 'collapsed', label: 'Collapsed' },
    { value: 'hidden', label: 'Hidden' }
  ];

  export let thinkingModeOptions: ThinkingModeOption[] = [];
  export let showThinkingModeControl = false;
  $: availableThinkingModeOptions = thinkingModeOptions.length
    ? thinkingModeOptions
    : DEFAULT_THINKING_MODE_OPTIONS;

  const dispatch = createEventDispatcher<{
    send: void;
    openSettings: void;
    thinkingModeChange: ThinkingMode;
  }>();

  let recognition: SpeechRecognition | null = null;
  let isListening = false;
  let speechSupported = false;
  let micError: string | null = null;
  let shouldResume = false;

  if (typeof window !== 'undefined') {
    speechSupported = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  const appendTranscript = (current: string, addition: string): string => {
    if (!current) {
      return addition;
    }
    const needsSeparator = !/[\s\n]$/.test(current);
    return `${current}${needsSeparator ? ' ' : ''}${addition}`;
  };

  const emitSend = () => {
    if (!isSending && !isDisabled) {
      dispatch('send');
    }
  };

  const emitOpenSettings = () => {
    dispatch('openSettings');
  };

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      emitSend();
    }
  };

  const handleThinkingModeChange = (event: Event) => {
    const target = event.currentTarget as HTMLSelectElement | null;
    const next = (target?.value ?? '') as ThinkingMode;
    dispatch('thinkingModeChange', next);
  };

  const describeSpeechError = (error: SpeechRecognitionErrorEvent['error']): string => {
    switch (error) {
      case 'audio-capture':
        return 'No working microphone was found.';
      case 'language-not-supported':
        return 'The selected speech recognition language is not supported.';
      case 'bad-grammar':
        return 'Speech recognition grammar is invalid.';
      case 'network':
        return 'Speech recognition service could not reach the network.';
      case 'not-allowed':
        return 'Microphone access was denied.';
      case 'service-not-allowed':
        return 'Speech recognition service is not allowed in this context.';
      default:
        return 'Speech recognition encountered an error.';
    }
  };

  const ensureRecognition = () => {
    if (!speechSupported) {
      return null;
    }

    if (recognition) {
      return recognition;
    }

    const ctor = (window.SpeechRecognition ?? window.webkitSpeechRecognition) as
      | typeof window.SpeechRecognition
      | undefined;

    if (!ctor) {
      speechSupported = false;
      return null;
    }

    const instance = new ctor();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = navigator.language ?? 'en-US';

    instance.onstart = () => {
      micError = null;
      isListening = true;
    };

    instance.onend = () => {
      isListening = false;

      if (shouldResume && !isSending && !isDisabled) {
        // Restart automatically to emulate a continuous session when supported.
        setTimeout(() => {
          if (!recognition || !shouldResume) {
            return;
          }
          try {
            recognition.start();
          } catch (error) {
            shouldResume = false;
            const message = error instanceof Error ? error.message : 'Unknown error';
            micError = `Unable to restart the microphone: ${message}`;
          }
        }, 200);
      }
    };

    instance.onerror = (event) => {
      if (event.error === 'aborted') {
        // `stop()` triggers an aborted error; ignore it so we can exit cleanly.
        return;
      }

      if (event.error === 'no-speech') {
        micError = 'No speech detected. Listening again…';
        return;
      }

      shouldResume = false;
      isListening = false;
      micError = describeSpeechError(event.error);
    };

    instance.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalTranscript += transcript;
        }
      }

      const trimmed = finalTranscript.trim();
      if (trimmed) {
        value = appendTranscript(value, trimmed);
      }
    };

    recognition = instance;
    return recognition;
  };

  const toggleSpeech = () => {
    const instance = ensureRecognition();
    if (!instance) {
      micError = 'Speech recognition is not supported in this browser.';
      return;
    }

    micError = null;

    try {
      if (isListening) {
        shouldResume = false;
        instance.stop();
      } else {
        shouldResume = true;
        instance.start();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      micError = `Unable to access the microphone: ${message}`;
    }
  };

  $: if ((isSending || isDisabled) && isListening && recognition) {
    shouldResume = false;
    recognition.stop();
  }

  onDestroy(() => {
    if (!recognition) {
      return;
    }
    shouldResume = false;
    recognition.onstart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    try {
      recognition.stop();
    } catch (error) {
      console.error('Failed to stop speech recognition', error);
    }
    recognition = null;
  });
</script>

<div class="flex items-center gap-3 rounded-2xl border border-surface-800/60 bg-surface-950/60 px-4 py-4 shadow-lg shadow-surface-950/20 ">
	<button
		type="button"
		class="btn btn-icon btn-icon-lg border border-primary-500 bg-primary-500 text-xl text-[color:var(--color-primary-contrast-500)]  transition hover:text-surface-50"
		on:click={emitOpenSettings}
		aria-label="Open prompt settings"
	>
		⚙
	</button>
	{#if showThinkingModeControl && availableThinkingModeOptions.length}
		<label class="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-surface-400">
			<span>Thinking</span>
			<select
				class="input min-w-[132px] bg-surface-950/60 ring-1 ring-surface-800/60 text-xs text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500"
				bind:value={thinkingMode}
				on:change={handleThinkingModeChange}
				disabled={isSending || isDisabled}
			>
				{#each availableThinkingModeOptions as option (option.value)}
					<option class="bg-surface-900" value={option.value} title={option.description ?? undefined}>
						{option.label}
					</option>
				{/each}
			</select>
		</label>
	{/if}
	<textarea
		bind:value
		rows="2"
		placeholder="Send a message..."
		on:keydown={handleKey}
		disabled={isSending || isDisabled}
		class="textarea flex-1 w-full resize-none border-none bg-transparent text-sm text-surface-50 placeholder:text-surface-500 focus:outline-none"
	></textarea>
	<button
		type="button"
		class={`btn btn-icon btn-icon-lg border transition disabled:opacity-60 ${
			isListening
				? 'border-primary-500 bg-primary-500 text-[color:var(--color-primary-contrast-500)]'
				: 'border-surface-700/60 text-primary-400 hover:bg-primary-500/10'
		}`}
		on:click={toggleSpeech}
		disabled={isSending || isDisabled || !speechSupported}
		aria-pressed={isListening}
		aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
		aria-live="polite"
	>
		{#if isListening}
			<span class="animate-pulse">🎙️</span>
		{:else}
			<span>🎤</span>
		{/if}
	</button>
	<span class="sr-only" aria-live="polite">{isListening ? 'Listening for speech' : ''}</span>
	<button
		class="btn btn-icon btn-icon-lg bg-primary-500 text-[color:var(--color-primary-contrast-500)] text-xl transition disabled:opacity-60"
		type="button"
		on:click={emitSend}
		disabled={isSending || isDisabled}
		aria-busy={isSending}
	>
		{#if isSending}
			<span class="animate-pulse">…</span>
		{:else}
			<span>➤</span>
		{/if}
	</button>
</div>
{#if micError}
  <p class="mt-2 text-xs text-red-400" role="alert">{micError}</p>
{/if}
