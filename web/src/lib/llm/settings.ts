import { defaultProvider } from './providers';
import type { ProviderId } from './providers';

export const SETTINGS_COOKIE = 'llm-settings';

export type ThinkingLevel = 'auto' | 'off' | 'low' | 'medium' | 'high';

export const THINKING_LEVEL_VALUES: readonly ThinkingLevel[] = [
  'auto',
  'off',
  'low',
  'medium',
  'high'
] as const;

export const isThinkingLevel = (value: unknown): value is ThinkingLevel =>
  typeof value === 'string' && THINKING_LEVEL_VALUES.includes(value as ThinkingLevel);

export interface LLMGenerationOptions {
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  thinkingLevel: ThinkingLevel;
}

export interface TtsSettings {
  elevenLabsApiKey: string | null;
}

export interface LLMSettings {
  provider: ProviderId;
  model: string;
  options: LLMGenerationOptions;
  tts: TtsSettings;
}

export const defaultGenerationOptions: LLMGenerationOptions = {
  temperature: null,
  topP: null,
  topK: null,
  maxInputTokens: null,
  maxOutputTokens: null,
  thinkingLevel: 'auto'
};

export const defaultTtsSettings: TtsSettings = {
  elevenLabsApiKey: null
};

export const defaultSettings: LLMSettings = {
  provider: defaultProvider.id,
  model: '',
  options: { ...defaultGenerationOptions },
  tts: { ...defaultTtsSettings }
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeGenerationOptions = (value: unknown): LLMGenerationOptions => {
  if (!value || typeof value !== 'object') {
    return { ...defaultGenerationOptions };
  }

  const source = value as Partial<Record<keyof LLMGenerationOptions, unknown>>;

  return {
    temperature: toNullableNumber(source.temperature),
    topP: toNullableNumber(source.topP),
    topK: toNullableNumber(source.topK),
    maxInputTokens: toNullableNumber(source.maxInputTokens),
    maxOutputTokens: toNullableNumber(source.maxOutputTokens),
    thinkingLevel: isThinkingLevel(source.thinkingLevel) ? source.thinkingLevel : 'auto'
  };
};

export const normalizeTtsSettings = (value: unknown): TtsSettings => {
  if (!value || typeof value !== 'object') {
    return { ...defaultTtsSettings };
  }

  const source = value as { elevenLabsApiKey?: unknown };
  const rawKey = source.elevenLabsApiKey;

  if (typeof rawKey === 'string') {
    const trimmed = rawKey.trim();
    return { elevenLabsApiKey: trimmed.length > 0 ? trimmed : null };
  }

  if (rawKey === null) {
    return { elevenLabsApiKey: null };
  }

  return { ...defaultTtsSettings };
};

export const parseSettings = (raw: string | undefined | null): LLMSettings | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LLMSettings> & {
      options?: unknown;
      tts?: unknown;
    };
    if (!parsed || typeof parsed !== 'object') return null;

    const provider = parsed.provider;
    const model = parsed.model;

    if (!provider || typeof provider !== 'string') return null;
    if (typeof model !== 'string') return null;

    const options = normalizeGenerationOptions(parsed.options);
    const tts = normalizeTtsSettings(parsed.tts);

    return { provider, model, options, tts };
  } catch {
    return null;
  }
};

export interface ClientSettings {
  provider: ProviderId;
  model: string;
  options: LLMGenerationOptions;
  tts: {
    hasElevenLabsApiKey: boolean;
  };
}

export const maskSettingsForClient = (settings: LLMSettings): ClientSettings => ({
  provider: settings.provider,
  model: settings.model,
  options: { ...settings.options },
  tts: {
    hasElevenLabsApiKey: Boolean(settings.tts.elevenLabsApiKey)
  }
});

export const sanitizeElevenLabsApiKey = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
