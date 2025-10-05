import { defaultProvider } from './providers';
import type { ProviderId } from './providers';

export const SETTINGS_COOKIE = 'llm-settings';

export interface LLMGenerationOptions {
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
}

export interface LLMSettings {
  provider: ProviderId;
  model: string;
  options: LLMGenerationOptions;
}

export const defaultGenerationOptions: LLMGenerationOptions = {
  temperature: null,
  topP: null,
  topK: null,
  maxInputTokens: null,
  maxOutputTokens: null
};

export const defaultSettings: LLMSettings = {
  provider: defaultProvider.id,
  model: '',
  options: { ...defaultGenerationOptions }
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
    maxOutputTokens: toNullableNumber(source.maxOutputTokens)
  };
};

export const parseSettings = (raw: string | undefined | null): LLMSettings | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LLMSettings> & {
      options?: unknown;
    };
    if (!parsed || typeof parsed !== 'object') return null;

    const provider = parsed.provider;
    const model = parsed.model;

    if (!provider || typeof provider !== 'string') return null;
    if (typeof model !== 'string') return null;

    const options = normalizeGenerationOptions(parsed.options);

    return { provider, model, options };
  } catch {
    return null;
  }
};
