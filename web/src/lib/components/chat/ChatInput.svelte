<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import {
    createOfflineSpeechController,
    getDefaultModelPath,
    isOfflineSpeechSupported,
    OfflineSpeechError,
    type OfflineSpeechController
  } from '$lib/speech/offline';
  import type { ThinkingMode, ThinkingModeOption } from '$lib/chat/types';
  import type { ChatAttachmentPayload } from '$lib/llm/client';

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

  const MAX_ATTACHMENTS = 6;
  const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

  export let thinkingModeOptions: ThinkingModeOption[] = [];
  export let showThinkingModeControl = false;
  export let attachments: ChatAttachmentPayload[] = [];
  let attachmentsRemaining = MAX_ATTACHMENTS;
  $: availableThinkingModeOptions = thinkingModeOptions.length
    ? thinkingModeOptions
    : DEFAULT_THINKING_MODE_OPTIONS;

  $: attachmentsRemaining = Math.max(0, MAX_ATTACHMENTS - (attachments?.length ?? 0));

  const dispatch = createEventDispatcher<{
    send: void;
    openSettings: void;
    thinkingModeChange: ThinkingMode;
    cancel: void;
    attachmentsAdd: ChatAttachmentPayload[];
    attachmentRemove: string;
    attachmentError: string;
  }>();

  let recognition: SpeechRecognition | null = null;
  let offlineSpeech: OfflineSpeechController | null = null;
  let isListening = false;
  let speechSupported = false;
  let browserSpeechSupported = false;
  let offlineSpeechSupported = false;
  let micError: string | null = null;
  let shouldResume = false;
  let usingOfflineSpeech = false;
  let isLoadingSpeech = false;
  let fileInput: HTMLInputElement | null = null;
  let addingAttachments = false;
  const offlineModelPath = getDefaultModelPath();

  const offlineCallbacks = {
    onStart: () => {
      micError = null;
      isListening = true;
      usingOfflineSpeech = true;
    },
    onStop: () => {
      isListening = false;
      usingOfflineSpeech = false;
    },
    onResult: (text: string) => {
      value = appendTranscript(value, text);
    },
    onError: (error: OfflineSpeechError) => {
      micError = error.message;
    }
  };

  let stopPromise: Promise<void> | null = null;

  if (typeof window !== 'undefined') {
    browserSpeechSupported = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
    offlineSpeechSupported = isOfflineSpeechSupported();
    speechSupported = browserSpeechSupported || offlineSpeechSupported;
  }

  const appendTranscript = (current: string, addition: string): string => {
    if (!current) {
      return addition;
    }
    const needsSeparator = !/[\s\n]$/.test(current);
    return `${current}${needsSeparator ? ' ' : ''}${addition}`;
  };

  const createAttachmentId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const formatFileSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const fractionDigits = value >= 10 || index === 0 ? 0 : 1;
    return `${value.toFixed(fractionDigits)} ${units[index]}`;
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) {
          reject(new Error('File is empty.'));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => {
        reject(new Error('Unable to read file.'));
      };
      reader.readAsDataURL(file);
    });

  const isImageAttachment = (attachment: ChatAttachmentPayload) =>
    typeof attachment?.mimeType === 'string' && attachment.mimeType.startsWith('image/');

  const openAttachmentDialog = () => {
    if (isSending || isDisabled) {
      return;
    }
    fileInput?.click();
  };

  const handleAttachmentSelect = async (event: Event) => {
    if (isSending || isDisabled || addingAttachments) {
      return;
    }

    const inputEl = event.currentTarget as HTMLInputElement | null;
    const files = inputEl?.files ? Array.from(inputEl.files) : [];
    if (inputEl) {
      inputEl.value = '';
    }

    if (!files.length) {
      return;
    }

    const remaining = Math.max(0, MAX_ATTACHMENTS - (attachments?.length ?? 0));
    if (remaining <= 0) {
      dispatch('attachmentError', `You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }

    const selected = files.slice(0, remaining);
    if (files.length > selected.length) {
      dispatch('attachmentError', `Only ${MAX_ATTACHMENTS} attachments are allowed per message.`);
    }

    addingAttachments = true;
    const additions: ChatAttachmentPayload[] = [];

    try {
      for (const file of selected) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          dispatch(
            'attachmentError',
            `${file.name} is too large. Maximum size is ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`
          );
          continue;
        }

        try {
          const dataUrl = await readFileAsDataUrl(file);
          additions.push({
            id: createAttachmentId(),
            name: file.name || 'attachment',
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            dataUrl
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : `Failed to read ${file.name}.`;
          dispatch('attachmentError', message);
        }
      }
    } finally {
      addingAttachments = false;
    }

    if (additions.length) {
      dispatch('attachmentsAdd', additions);
    }
  };

  const handleAttachmentRemove = (id: string) => {
    dispatch('attachmentRemove', id);
  };

  const emitSend = () => {
    if (!isSending && !isDisabled) {
      dispatch('send');
    }
  };

  const emitOpenSettings = () => {
    dispatch('openSettings');
  };

  const emitCancel = () => {
    if (isSending) {
      dispatch('cancel');
    }
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
      usingOfflineSpeech = false;
    };

    instance.onend = () => {
      isListening = false;
      usingOfflineSpeech = false;

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

  const ensureOfflineController = () => {
    if (!offlineSpeech) {
      offlineSpeech = createOfflineSpeechController(offlineCallbacks, {
        modelUrl: offlineModelPath
      });
    }
    return offlineSpeech;
  };

  const stopSpeech = async () => {
    if (stopPromise) {
      return stopPromise;
    }

    stopPromise = (async () => {
      if (usingOfflineSpeech && offlineSpeech) {
        await offlineSpeech.stop();
        return;
      }

      if (recognition && isListening) {
        shouldResume = false;
        recognition.stop();
      }
    })();

    try {
      await stopPromise;
    } finally {
      stopPromise = null;
    }
  };

  const toggleSpeech = async () => {
    if (isListening) {
      await stopSpeech();
      return;
    }

    micError = null;

    if (isSending || isDisabled) {
      return;
    }

    if (offlineSpeechSupported) {
      try {
        isLoadingSpeech = true;
        const controller = ensureOfflineController();
        await controller.start();
        return;
      } catch (error) {
        usingOfflineSpeech = false;
        if (error instanceof OfflineSpeechError) {
          micError = error.message;
        } else {
          const message = error instanceof Error ? error.message : 'Unable to start offline speech recognition.';
          micError = message;
        }
        return;
      } finally {
        isLoadingSpeech = false;
      }
    }

    const instance = ensureRecognition();
    if (!instance) {
      if (!micError) {
        micError = 'Speech recognition is not supported in this browser.';
      }
      return;
    }

    micError = null;

    try {
      shouldResume = true;
      instance.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      micError = `Unable to access the microphone: ${message}`;
    }
  };

  $: if ((isSending || isDisabled) && isListening) {
    shouldResume = false;
    void stopSpeech();
  }

  onDestroy(() => {
    void stopSpeech();
    offlineSpeech?.destroy().catch((error) => {
      console.error('Failed to destroy offline speech controller', error);
    });
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

<div class="flex flex-col gap-3 rounded-2xl border border-surface-800/60 bg-surface-950/60 px-4 py-4 shadow-lg shadow-surface-950/20">
	<div class="flex items-center gap-3">
		<button
			type="button"
			class="btn btn-icon btn-icon-lg border border-primary-500 bg-primary-500 text-xl text-[color:var(--color-primary-contrast-500)] transition hover:text-surface-50"
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
			placeholder="Send a message or attach files…"
			on:keydown={handleKey}
			disabled={isSending || isDisabled}
			class="textarea flex-1 w-full resize-none border-none bg-transparent text-sm text-surface-50 placeholder:text-surface-500 focus:outline-none"
		></textarea>
		<button
			type="button"
			class="relative btn btn-icon btn-icon-lg border border-surface-700/60 text-primary-400 transition hover:bg-primary-500/10 disabled:opacity-60"
			class:cursor-wait={addingAttachments}
			on:click={openAttachmentDialog}
			disabled={isSending || isDisabled || attachmentsRemaining <= 0}
			aria-label="Add attachment"
			aria-busy={addingAttachments}
		>
			{#if addingAttachments}
				<span class="animate-spin">⌛</span>
			{:else}
				<span>📎</span>
			{/if}
			{#if attachments.length}
				<span class="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-500 px-1 text-[11px] font-semibold text-[color:var(--color-primary-contrast-500)]">
					{attachments.length}
				</span>
			{/if}
		</button>
		<input
			bind:this={fileInput}
			type="file"
			class="sr-only"
			multiple
			on:change={handleAttachmentSelect}
			aria-hidden="true"
		/>
		<button
			type="button"
			class={`btn btn-icon btn-icon-lg border transition disabled:opacity-60 ${
				isListening
					? 'border-primary-500 bg-primary-500 text-[color:var(--color-primary-contrast-500)]'
					: 'border-surface-700/60 text-primary-400 hover:bg-primary-500/10'
			}`}
			on:click={() => void toggleSpeech()}
			disabled={isSending || isDisabled || !speechSupported || isLoadingSpeech}
			aria-pressed={isListening}
			aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
			aria-live="polite"
			aria-busy={isLoadingSpeech}
		>
			{#if isLoadingSpeech}
				<span class="animate-pulse">⌛</span>
			{:else if isListening}
				<span class="animate-pulse">🎙️</span>
			{:else}
				<span>🎤</span>
			{/if}
		</button>
		<span class="sr-only" aria-live="polite">{isListening ? 'Listening for speech' : ''}</span>
		<button
			class={`btn btn-icon btn-icon-lg text-xl transition disabled:opacity-60 ${
				isSending
					? 'border border-error-500 bg-error-500 text-[color:var(--color-error-contrast-500)] hover:bg-error-500/80'
					: 'bg-primary-500 text-[color:var(--color-primary-contrast-500)] hover:bg-primary-500/90'
			}`}
			type="button"
			on:click={isSending ? emitCancel : emitSend}
			disabled={isSending ? false : isDisabled}
			aria-busy={isSending}
			aria-label={isSending ? 'Cancel generation' : 'Send message'}
		>
			{#if isSending}
				<span aria-hidden="true">✕</span>
			{:else}
				<span aria-hidden="true">➤</span>
			{/if}
		</button>
	</div>
	{#if attachments.length}
		<div class="flex flex-col gap-2">
			<div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-surface-500">
				<span>Attachments</span>
				<span>{attachmentsRemaining ? `${attachmentsRemaining} left` : 'Limit reached'}</span>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each attachments as attachment (attachment.id)}
					<div class="group flex min-w-0 items-center gap-3 rounded-xl border border-surface-800/60 bg-surface-900/50 px-3 py-2 text-xs text-surface-200">
						{#if isImageAttachment(attachment)}
							<img src={attachment.dataUrl} alt={`Attachment ${attachment.name}`} class="h-10 w-10 flex-none rounded-lg object-cover shadow-inner shadow-surface-950/40" loading="lazy" />
						{:else}
							<div class="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-surface-800/80 text-base">📄</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium text-surface-50">{attachment.name || 'Attachment'}</p>
							<p class="text-[11px] text-surface-400">{formatFileSize(attachment.size)}</p>
						</div>
						<button
							type="button"
							class="btn btn-icon btn-icon-sm ml-auto border border-transparent bg-transparent text-surface-400 transition hover:border-error-400/80 hover:bg-error-500/20 hover:text-error-200"
							on:click={() => handleAttachmentRemove(attachment.id)}
							aria-label={`Remove ${attachment.name}`}
						>
							✕
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

{#if micError}
  <p class="mt-2 text-xs text-red-400" role="alert">{micError}</p>
{/if}
