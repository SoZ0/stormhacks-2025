<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    defaultGenerationOptions,
    THINKING_LEVEL_VALUES,
    isThinkingLevel,
    type LLMGenerationOptions,
    type ThinkingLevel
  } from '$lib/llm/settings';

  export let systemPrompt = '';
  export let options: LLMGenerationOptions = { ...defaultGenerationOptions };

  type NumericOptionKey = Exclude<keyof LLMGenerationOptions, 'thinkingLevel'>;

  const dispatch = createEventDispatcher<{
    systemPromptChange: string;
    optionsChange: LLMGenerationOptions;
  }>();

  const handleSystemPromptInput = (event: Event) => {
    const value = (event.currentTarget as HTMLTextAreaElement).value;
    dispatch('systemPromptChange', value);
  };

  const toNullableNumber = (input: string): number | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const sanitizeOptionValue = (key: NumericOptionKey, value: number | null): number | null => {
    if (value === null) return null;

    switch (key) {
      case 'temperature':
        return Math.min(Math.max(value, 0), 2);
      case 'topP':
        return Math.min(Math.max(value, 0), 1);
      case 'topK': {
        const rounded = Math.round(value);
        return rounded < 0 ? 0 : rounded;
      }
      case 'maxInputTokens':
      case 'maxOutputTokens': {
        const rounded = Math.round(value);
        return rounded < 0 ? 0 : rounded;
      }
      default:
        return value;
    }
  };

  const handleOptionsChange = (key: NumericOptionKey) => (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    const rawValue = toNullableNumber(target.value ?? '');
    const sanitized = sanitizeOptionValue(key, rawValue);
    const nextOptions: LLMGenerationOptions = { ...options, [key]: sanitized };
    options = nextOptions;
    dispatch('optionsChange', nextOptions);
  };

  const formatOptionValue = (value: number | null) => (value ?? '').toString();

  const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
    auto: 'Auto',
    off: 'Off',
    low: 'Low',
    medium: 'Medium',
    high: 'High'
  };

  const handleThinkingLevelChange = (event: Event) => {
    const target = event.currentTarget as HTMLSelectElement | null;
    const selected = target?.value;
    const nextLevel = isThinkingLevel(selected) ? selected : 'auto';
    const nextOptions: LLMGenerationOptions = { ...options, thinkingLevel: nextLevel };
    options = nextOptions;
    dispatch('optionsChange', nextOptions);
  };
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-2 lg:col-span-2">
    <label class="text-xs font-semibold uppercase tracking-wide text-surface-400">
      <span>System Prompt</span>
      <textarea
        value={systemPrompt}
        on:input={handleSystemPromptInput}
        rows="3"
        class="input min-h-[96px] resize-y bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-surface-500"
        placeholder="Provide optional instructions for the model"
      ></textarea>
    </label>
  </div>

  <div class="flex flex-col gap-3 lg:col-span-2">
    <span class="text-xs font-semibold uppercase tracking-wide text-surface-400">
      Generation Settings
    </span>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-surface-400">
        <span>Temperature</span>
        <input
          type="number"
          step="0.05"
          min="0"
          max="2"
          value={formatOptionValue(options.temperature)}
          on:change={handleOptionsChange('temperature')}
          class="input bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Model default"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-surface-400">
        <span>Top P</span>
        <input
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={formatOptionValue(options.topP)}
          on:change={handleOptionsChange('topP')}
          class="input bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Model default"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-surface-400">
        <span>Top K</span>
        <input
          type="number"
          step="1"
          min="0"
          value={formatOptionValue(options.topK)}
          on:change={handleOptionsChange('topK')}
          class="input bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Model default"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-surface-400">
        <span>Max Input Tokens</span>
        <input
          type="number"
          step="1"
          min="0"
          value={formatOptionValue(options.maxInputTokens)}
          on:change={handleOptionsChange('maxInputTokens')}
          class="input bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Model default"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-surface-400 sm:col-span-2">
        <span>Max Output Tokens</span>
        <input
          type="number"
          step="1"
          min="0"
          value={formatOptionValue(options.maxOutputTokens)}
          on:change={handleOptionsChange('maxOutputTokens')}
          class="input bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Model default"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-surface-400 sm:col-span-2">
        <span>Thinking Level</span>
        <select
          value={options.thinkingLevel ?? 'auto'}
          on:change={handleThinkingLevelChange}
          class="input bg-surface-950/60 ring-1 ring-surface-800/60 text-sm text-surface-100 transition focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {#each THINKING_LEVEL_VALUES as level}
            <option class="bg-surface-900" value={level}>{THINKING_LEVEL_LABELS[level]}</option>
          {/each}
        </select>
      </label>
    </div>
  </div>
</div>
